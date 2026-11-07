// Portal <-> Dynamics (Dataverse) synchronisation.
//
// Dynamics is the system of record; the portal server keeps a local working copy
// (SQLite) so the portal stays fast and keeps working if Dynamics is briefly unreachable.
//
//  push  : every create/update/delete in the portal is written to a durable outbox in the
//          same SQLite transaction, then replayed to Dataverse in order (upsert by GUID).
//  pull  : edits made by staff in the Dynamics apps on the tables they are allowed to edit
//          (settings, templates, FAQ, lookups, comments, user role/activation) come back.
//  import: `npm run dataverse:import` rebuilds an empty portal database from Dynamics.
import fs from 'node:fs';
import { db, getDoc, allDocs, updateDoc, putDoc, withOrigin, onChange, now } from '../db.js';
import { TABLES, toGuid, STAFF_EDITABLE, STAFF_EDITABLE_FIELDS } from './schema.js';
import { isDraftWork } from '../rls.js';
import { request, ok, getAll, whoAmI, enabled, config, DataverseError } from './client.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS dv_outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL,
    attempts INTEGER DEFAULT 0, last_error TEXT, next_try TEXT, created TEXT
  );
  CREATE INDEX IF NOT EXISTS dv_outbox_key ON dv_outbox(entity, id);
  CREATE TABLE IF NOT EXISTS dv_state (key TEXT PRIMARY KEY, value TEXT);
`);

const SYSTEM = new Set(['id', 'created_date', 'updated_date', 'created_by_id', 'created_by']);
const MAX_ATTEMPTS = 25;
const state = { lastPushOk: null, lastPullOk: null, lastError: null, running: false, entitySets: null };

export const getState = (k) => db.prepare('SELECT value FROM dv_state WHERE key = ?').get(k)?.value;
export const setState = (k, v) => db.prepare('INSERT INTO dv_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

// ---------------- outbox ----------------
export function enqueue(entity, id, op = 'upsert') {
  if (!TABLES[entity]) return;
  if (op === 'delete') db.prepare('DELETE FROM dv_outbox WHERE entity = ? AND id = ? AND attempts = 0').run(entity, id);
  else if (db.prepare("SELECT 1 FROM dv_outbox WHERE entity = ? AND id = ? AND op = 'upsert' AND attempts = 0").get(entity, id)) return;
  db.prepare('INSERT INTO dv_outbox (entity, id, op, next_try, created) VALUES (?,?,?,?,?)').run(entity, id, op, now(), now());
}

// Record changes whenever a Dynamics URL is configured (even before the secret is added,
// so nothing is lost while setting up).
export function installHooks() {
  if (!config().url || process.env.DATAVERSE_SYNC === 'off') return false;
  onChange(({ op, entity, id }) => enqueue(entity, id, op));
  return true;
}

// ---------------- conversion ----------------
async function entitySets() {
  if (state.entitySets) return state.entitySets;
  const j = await ok('GET', "EntityDefinitions?$select=LogicalName,EntitySetName");
  state.entitySets = Object.fromEntries((j.value || []).map((e) => [e.LogicalName, e.EntitySetName]));
  return state.entitySets;
}
const setOf = async (entity) => (await entitySets())[TABLES[entity].logical] || TABLES[entity].entitySet;

const NAME_FIELDS = ['application_reference', 'calculation_reference', 'payment_reference', 'voucher_reference', 'clearance_reference', 'thread_reference', 'inquiry_reference', 'company_name_en', 'full_name', 'template_key', 'setting_key', 'question_en', 'value_en', 'subject', 'title', 'filename', 'document_name', 'subsidiary_name', 'gateway_reference', 'code', 'action', 'field_name', 'entity_type'];
export function displayName(entity, doc) {
  const f = NAME_FIELDS.find((k) => doc[k]);
  let v = f ? doc[f] : doc.id;
  if (entity === 'User' && doc.email) v = `${doc.full_name || ''} <${doc.email}>`.trim();
  if (entity === 'PaymentAllocation') v = `${doc.allocated_amount ?? ''} KWD ${doc.financial_year || ''}`.trim();
  return String(v ?? '').slice(0, 400);
}

const validDate = (v) => v && !Number.isNaN(Date.parse(v));
function toValue(c, v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return c.kind === 'boolean' ? false : null;
  switch (c.kind) {
    case 'text': return String(v).slice(0, c.max || 1000);
    case 'memo': return String(v).slice(0, 1048576);
    case 'json': return JSON.stringify(v).slice(0, 1048576);
    case 'integer': return Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
    case 'decimal': return Number.isFinite(Number(v)) ? Math.round(Number(v) * 1000) / 1000 : null;
    case 'boolean': return v === true || v === 'true' || v === 1;
    case 'choice': return c.options.find((o) => o.key === v)?.value ?? null;
    case 'date': return validDate(v) ? String(v).slice(0, 10) : null;
    case 'datetime': return validDate(v) ? new Date(v).toISOString() : null;
    default: return null;
  }
}

export async function toPayload(entity, doc, { skipLookups = new Set() } = {}) {
  const t = TABLES[entity];
  const body = {
    new_name: displayName(entity, doc), new_portalid: String(doc.id),
    new_portal_created_on: validDate(doc.created_date) ? new Date(doc.created_date).toISOString() : null,
    new_portal_created_by: doc.created_by || null,
  };
  const extra = {};
  const known = new Set(t.columns.map((c) => c.field));
  for (const c of t.columns) {
    const v = doc[c.field];
    if (c.kind === 'lookup') {
      if (v && !skipLookups.has(c.field)) body[`${c.logical}@odata.bind`] = `/${await setOf(c.target)}(${toGuid(v)})`;
      else if (v) extra[c.field] = v;
      continue;
    }
    const out = toValue(c, v);
    if (out === undefined) continue;
    body[c.logical] = out;
    if (c.kind === 'choice' && v && out === null) extra[c.field] = v; // value outside the choice list
  }
  for (const [k, v] of Object.entries(doc)) if (!known.has(k) && !SYSTEM.has(k) && v !== undefined) extra[k] = v;
  body.new_extra = Object.keys(extra).length ? JSON.stringify(extra).slice(0, 1048576) : null;
  return body;
}

export function fromRow(entity, row, resolveId = () => null) {
  const t = TABLES[entity];
  const out = {};
  let extra = {};
  try { extra = row.new_extra ? JSON.parse(row.new_extra) : {}; } catch { extra = {}; }
  Object.assign(out, extra);
  for (const c of t.columns) {
    if (c.kind === 'lookup') {
      const g = row[`_${c.logical}_value`];
      if (g) out[c.field] = resolveId(c.target, g) || g;
      continue;
    }
    if (!(c.logical in row)) continue;
    const v = row[c.logical];
    if (v === null) { if (!(c.field in extra)) out[c.field] = c.kind === 'boolean' ? false : ''; continue; }
    switch (c.kind) {
      case 'json': try { out[c.field] = JSON.parse(v); } catch { out[c.field] = v; } break;
      case 'choice': out[c.field] = c.options.find((o) => o.value === v)?.key ?? extra[c.field] ?? ''; break;
      default: out[c.field] = v;
    }
  }
  return out;
}

// ---------------- push ----------------
function sourceRecord(entity, id) {
  if (entity === 'PortalFile') {
    const f = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    return f && { id: f.id, filename: f.filename, mime: f.mime, size: f.size, uploaded_by: f.uploaded_by, company_id: f.company_id, created_date: f.created, _path: f.path };
  }
  if (entity === 'Counter') {
    const c = db.prepare('SELECT * FROM counters WHERE name = ?').get(id);
    return c && { id: c.name, value: c.value };
  }
  return getDoc(entity, id);
}

async function pushOne(entity, id, op, depth = 0, skipLookups = new Set()) {
  const set = await setOf(entity);
  const guid = toGuid(id);
  if (op === 'delete') {
    const r = await request('DELETE', `${set}(${guid})`);
    if (r.status >= 300 && r.status !== 404) throw new DataverseError(r.status, r.json, `delete ${entity}`);
    return;
  }
  const doc = sourceRecord(entity, id);
  if (!doc) return; // deleted locally since it was queued
  // A company's draft application (and its attachments) is private until submitted, as in the portal.
  if (isDraftWork(entity, doc)) return;
  const body = await toPayload(entity, doc, { skipLookups });
  const r = await request('PATCH', `${set}(${guid})`, body);
  if (r.status < 300) {
    if (entity === 'PortalFile') await uploadFile(set, guid, doc);
    if (entity === 'ContributionApplication' && !getState(`app:${id}`)) {
      // first time the application leaves draft: send the documents the company attached to it
      for (const child of ['FinancialStatement', 'ApplicationDocument', 'SubsidiaryDeclaration']) allDocs(child).filter((d) => d.application_id === id).forEach((d) => enqueue(child, d.id));
      setState(`app:${id}`, now());
    }
    return;
  }
  const msg = r.json?.error?.message || '';
  // A lookup target is not in Dynamics yet: push it first (or drop the dangling link), then retry.
  if (depth < 3 && /does not exist|not found/i.test(msg)) {
    const lookups = TABLES[entity].columns.filter((c) => c.kind === 'lookup' && doc[c.field] && !skipLookups.has(c.field));
    const next = new Set(skipLookups);
    for (const c of lookups) {
      const exists = await request('GET', `${await setOf(c.target)}(${toGuid(doc[c.field])})?$select=new_portalid`);
      if (exists.status === 200) continue;
      if (c.target === 'User' || c.target === 'Company' || sourceRecord(c.target, doc[c.field])) {
        try { await pushOne(c.target, doc[c.field], 'upsert', depth + 1); continue; } catch { /* fall through */ }
      }
      next.add(c.field);
    }
    return pushOne(entity, id, op, depth + 1, next);
  }
  throw new DataverseError(r.status, r.json, `upsert ${entity}`);
}

async function uploadFile(set, guid, f) {
  if (getState(`file:${f.id}`) || !f._path || !fs.existsSync(f._path)) return;
  const buf = fs.readFileSync(f._path);
  if (!buf.length || buf.length > 128 * 1024 * 1024) return;
  const r = await request('PATCH', `${set}(${guid})/new_content`, new Uint8Array(buf), { 'Content-Type': 'application/octet-stream', 'x-ms-file-name': encodeURIComponent(f.filename || f.id) });
  if (r.status >= 300) throw new DataverseError(r.status, r.json, 'upload file');
  setState(`file:${f.id}`, now());
}

export async function pushPending(limit = 100) {
  const rows = db.prepare('SELECT * FROM dv_outbox WHERE attempts < ? AND next_try <= ? ORDER BY seq LIMIT ?').all(MAX_ATTEMPTS, now(), limit);
  let done = 0;
  for (const row of rows) {
    try {
      await pushOne(row.entity, row.id, row.op);
      db.prepare('DELETE FROM dv_outbox WHERE seq = ?').run(row.seq);
      done++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const wait = Math.min(2 ** attempts * 5000, 30 * 60 * 1000);
      db.prepare('UPDATE dv_outbox SET attempts = ?, last_error = ?, next_try = ? WHERE seq = ?')
        .run(attempts, String(e.message || e).slice(0, 2000), new Date(Date.now() + wait).toISOString(), row.seq);
      state.lastError = `${row.entity} ${row.id}: ${e.message}`;
      if (e.status === 401 || e.status === 403 || /sign-in failed/i.test(e.message)) break; // configuration problem: stop this round
    }
  }
  if (done) state.lastPushOk = now();
  return { done, tried: rows.length };
}

// Queue every local record (first load of an existing portal into Dynamics).
export function enqueueAll() {
  let n = 0;
  const order = ['User', 'Company', 'ContributionApplication', 'ContributionCalculation', 'Payment', 'ReceiptVoucher', 'CommunicationThread', 'Inquiry'];
  const rest = Object.keys(TABLES).filter((e) => !order.includes(e) && !['PortalFile', 'Counter', 'ActionRequest'].includes(e));
  for (const e of [...order, ...rest]) for (const d of allDocs(e)) { enqueue(e, d.id); n++; }
  for (const f of db.prepare('SELECT id FROM files').all()) { enqueue('PortalFile', f.id); n++; }
  for (const c of db.prepare('SELECT name FROM counters').all()) { enqueue('Counter', c.name); n++; }
  return n;
}

// ---------------- pull (staff edits made in Dynamics) ----------------
const guidMaps = new Map();
export function resolveId(entity, guid) {
  const g = String(guid).toLowerCase();
  let m = guidMaps.get(entity);
  if (!m || !m.has(g)) {
    m = new Map(allDocs(entity).map((d) => [toGuid(d.id), d.id]));
    guidMaps.set(entity, m);
  }
  return m.get(g) || null;
}

const PULL_ENTITIES = [...STAFF_EDITABLE, 'User'];
export async function pullChanges() {
  const me = await whoAmI();
  for (const entity of PULL_ENTITIES) {
    const t = TABLES[entity];
    const key = `pull:${entity}`;
    const since = getState(key);
    if (!since) { setState(key, now()); continue; } // start tracking from now
    const set = await setOf(entity);
    const rows = await getAll(`${set}?$filter=modifiedon gt ${since} and _modifiedby_value ne ${me.UserId}&$orderby=modifiedon asc`);
    let mark = since;
    for (const row of rows) {
      const id = row.new_portalid || row[`${t.logical}id`];
      let patch = fromRow(entity, row, resolveId);
      if (STAFF_EDITABLE_FIELDS[entity]) patch = Object.fromEntries(Object.entries(patch).filter(([k]) => STAFF_EDITABLE_FIELDS[entity].includes(k)));
      const local = getDoc(entity, id);
      if (local) withOrigin('dataverse', () => updateDoc(entity, id, patch));
      else if (STAFF_EDITABLE.has(entity)) {
        withOrigin('dataverse', () => putDoc(entity, { ...patch, id, created_date: row.createdon, created_by: row['_createdby_value@OData.Community.Display.V1.FormattedValue'] || 'Dynamics' }));
        if (!row.new_portalid) await request('PATCH', `${set}(${row[`${t.logical}id`]})`, { new_portalid: id });
      }
      mark = row.modifiedon > mark ? row.modifiedon : mark;
    }
    setState(key, mark);
  }
  state.lastPullOk = now();
}

// ---------------- import (rebuild an empty portal from Dynamics) ----------------
export async function importAll(log = console.log) {
  const rowsBy = {};
  const portalIdByGuid = {};
  for (const [entity, t] of Object.entries(TABLES)) {
    if (entity === 'ActionRequest') continue;
    const set = await setOf(entity);
    rowsBy[entity] = await getAll(`${set}?$filter=statecode eq 0`);
    portalIdByGuid[entity] = new Map(rowsBy[entity].map((r) => [r[`${t.logical}id`], r.new_portalid || r[`${t.logical}id`]]));
    log(`fetched ${rowsBy[entity].length} ${entity}`);
  }
  const resolve = (target, g) => portalIdByGuid[target]?.get(g) || null;
  withOrigin('dataverse', () => {
    for (const [entity, rows] of Object.entries(rowsBy)) {
      for (const row of rows) {
        const id = row.new_portalid || row[`${TABLES[entity].logical}id`];
        const rec = fromRow(entity, row, resolve);
        if (entity === 'Counter') {
          db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)').run(id, Number(rec.value || 0));
        } else if (entity === 'PortalFile') {
          // metadata only; bytes are downloaded on first access (see fetchFileContent)
          db.prepare('INSERT OR IGNORE INTO files (id, filename, mime, size, path, uploaded_by, company_id, created) VALUES (?,?,?,?,?,?,?,?)')
            .run(id, rec.filename, rec.mime, rec.size, '', rec.uploaded_by || null, rec.company_id || null, row.new_portal_created_on || row.createdon);
        } else {
          putDoc(entity, { ...rec, id, created_date: row.new_portal_created_on || row.createdon, created_by: row.new_portal_created_by || null });
        }
      }
    }
  });
  return Object.fromEntries(Object.entries(rowsBy).map(([k, v]) => [k, v.length]));
}

// Downloads a file's bytes from Dynamics (used after an import, when only metadata is local).
export async function fetchFileContent(fileId, destPath) {
  const r = await request('GET', `${await setOf('PortalFile')}(${toGuid(fileId)})/new_content/$value`, undefined, {}, { raw: true });
  if (r.status !== 200 || !r.body) return false;
  fs.writeFileSync(destPath, r.body);
  db.prepare('UPDATE files SET path = ? WHERE id = ?').run(destPath, fileId);
  return true;
}

// ---------------- status for admins ----------------
export function status() {
  const pending = db.prepare(`SELECT COUNT(*) n FROM dv_outbox WHERE attempts < ${MAX_ATTEMPTS}`).get().n;
  const failing = db.prepare('SELECT entity, id, op, attempts, last_error, next_try FROM dv_outbox WHERE attempts > 0 ORDER BY attempts DESC, seq LIMIT 20').all();
  return { configured: enabled(), url: config().url, pending, failing, ...state, entitySets: undefined };
}
export { state };
