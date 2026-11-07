// Dynamics (Dataverse) connection tests against an in-memory mock of the Web API.
//   node --test tests/api/dataverse.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startMock, STAFF_USER } from './mock-dataverse.mjs';
import { TABLES, toGuid, ACTIONS } from '../../server/dataverse/schema.js';

const PORT = 3198;
const DV_PORT = 3290;
const BASE = `http://localhost:${PORT}`;
const DV = `http://localhost:${DV_PORT}`;
const DATA_DIR = path.resolve(`data-test-dv-${Date.now()}`);
const env = {
  ...process.env, DATA_DIR, PORT: String(PORT),
  DATAVERSE_URL: DV, DATAVERSE_AUTHORITY: DV, DATAVERSE_TENANT_ID: 't', DATAVERSE_CLIENT_ID: 'c', DATAVERSE_CLIENT_SECRET: 's',
  DATAVERSE_PUSH_MS: '200', DATAVERSE_ACTIONS_MS: '300', DATAVERSE_PULL_MS: '300',
};
let server; let mock; let admin; let manager;

const call = async (token, method, url, body) => {
  const res = await fetch(`${BASE}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const login = async (email) => (await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Portal#2026' }) })).json()).access_token;
const dv = (method, p, body) => fetch(`${DV}/api/data/v9.2/${p}`, { method, headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'x-test-actor': STAFF_USER }, body: body ? JSON.stringify(body) : undefined });
const until = async (fn, ms = 15000, what = 'condition') => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`timed out waiting for ${what}`);
};
const rows = (entity) => [...mock.table(TABLES[entity].entitySet).values()];
const option = (field, key) => TABLES.ActionRequest.columns.find((c) => c.field === field).options.find((o) => o.key === key).value;

before(async () => {
  mock = await startMock(DV_PORT);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const seeded = spawnSync(process.execPath, ['server/seed.js'], { env, encoding: 'utf8' });
  assert.equal(seeded.status, 0, seeded.stderr);
  server = spawn(process.execPath, ['server/index.js'], { env, stdio: 'pipe' });
  let log = '';
  server.stderr.on('data', (d) => { log += d; });
  await until(async () => { try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; } }, 30000, `server start ${log}`);
  admin = await login('admin@portal.local');
  manager = await login('manager@portal.local');
});

after(async () => {
  server?.kill();
  mock?.server.close();
  await new Promise((r) => setTimeout(r, 500));
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('every seeded record and file reaches Dynamics, with lookups bound', async () => {
  const s = await until(async () => { const r = (await call(admin, 'GET', '/api/admin/dataverse')).data; return r.pending === 0 && r; }, 60000, 'outbox to drain');
  assert.equal(s.configured, true);
  assert.equal(s.failing.length, 0, JSON.stringify(s.failing));
  const apps = (await call(admin, 'GET', `/api/entities/ContributionApplication?limit=500`)).data.items;
  assert.ok(apps.length > 0);
  assert.equal(rows('ContributionApplication').length, apps.length);
  const a = apps.find((x) => x.application_reference);
  const row = mock.table(TABLES.ContributionApplication.entitySet).get(toGuid(a.id));
  assert.equal(row.new_name, a.application_reference);
  assert.equal(row.new_portalid, a.id);
  assert.equal(row._new_company_id_value, toGuid(a.company_id));
  const statusCol = TABLES.ContributionApplication.columns.find((c) => c.field === 'status');
  assert.equal(row.new_status, statusCol.options.find((o) => o.key === a.status).value);
  assert.ok(rows('PortalFile').length > 0, 'files pushed');
  assert.ok(mock.files.size > 0, 'file content uploaded');
  assert.ok(rows('Counter').some((c) => c.new_name.startsWith('APP-')), 'reference counters pushed');
});

test('a portal change is pushed to Dynamics within seconds', async () => {
  const faq = (await call(admin, 'POST', '/api/entities/FaqEntry', { question_en: 'Sync test?', answer_en: 'Yes', is_active: true, sort_order: 99 })).data;
  await until(() => mock.table(TABLES.FaqEntry.entitySet).get(toGuid(faq.id)), 10000, 'faq pushed');
  assert.equal(mock.table(TABLES.FaqEntry.entitySet).get(toGuid(faq.id)).new_question_en, 'Sync test?');
});

test('a staff action requested in Dynamics runs the portal workflow', async () => {
  const apps = (await call(manager, 'GET', '/api/entities/ContributionApplication?limit=500')).data.items;
  const target = apps.find((a) => ['submitted', 'assigned'].includes(a.status));
  assert.ok(target, 'a submitted application exists in seed data');
  await dv('POST', TABLES.ActionRequest.entitySet, {
    new_action: option('action', 'start_review'), new_request_status: option('request_status', 'pending'),
    'new_application_id@odata.bind': `/${TABLES.ContributionApplication.entitySet}(${toGuid(target.id)})`,
  });
  const done = await until(() => rows('ActionRequest').find((r) => r.new_request_status === option('request_status', 'done') || r.new_request_status === option('request_status', 'failed')), 15000, 'action processed');
  assert.equal(done.new_request_status, option('request_status', 'done'), done.new_result);
  const after = (await call(manager, 'GET', `/api/entities/ContributionApplication/${target.id}`)).data;
  assert.equal(after.status, 'under_review');
  await until(() => mock.table(TABLES.ContributionApplication.entitySet).get(toGuid(target.id)).new_status === TABLES.ContributionApplication.columns.find((c) => c.field === 'status').options.find((o) => o.key === 'under_review').value, 10000, 'status pushed back');
});

test('an invalid staff action fails with the workflow message', async () => {
  const apps = (await call(manager, 'GET', '/api/entities/ContributionApplication?limit=500')).data.items;
  const target = apps.find((a) => a.status === 'completed' || a.status === 'under_review');
  const before = rows('ActionRequest').length;
  await dv('POST', TABLES.ActionRequest.entitySet, {
    new_action: option('action', 'approve'), new_request_status: option('request_status', 'pending'),
    'new_application_id@odata.bind': `/${TABLES.ContributionApplication.entitySet}(${toGuid(target.id)})`,
  });
  await until(() => rows('ActionRequest').length > before && rows('ActionRequest').slice(-1)[0].new_request_status !== option('request_status', 'pending'), 15000, 'action processed');
  const r = rows('ActionRequest').slice(-1)[0];
  assert.equal(r.new_request_status, option('request_status', 'failed'));
  assert.match(r.new_result, /not waiting for approval/i);
  assert.ok(ACTIONS.length >= 15);
});

test('staff edits of system settings in Dynamics come back to the portal', async () => {
  await new Promise((r) => setTimeout(r, 800)); // let the first pull set its starting point
  const setting = rows('SystemSettings').find((r) => r.new_setting_key === 'pending_review_reminder_days');
  assert.ok(setting);
  await dv('PATCH', `${TABLES.SystemSettings.entitySet}(${setting[`${TABLES.SystemSettings.logical}id`]})`, { new_setting_value: '7' });
  await until(async () => {
    const items = (await call(admin, 'GET', '/api/entities/SystemSettings?limit=500')).data.items;
    return items.find((s) => s.setting_key === 'pending_review_reminder_days')?.setting_value === '7';
  }, 10000, 'setting pulled');
});

test('a full re-send rebuilds Dynamics, including circular links (company <-> primary user)', async () => {
  for (const t of Object.values(TABLES)) if (t.entity !== 'ActionRequest') mock.table(t.entitySet).clear();
  const r = await call(admin, 'POST', '/api/admin/dataverse/push-all');
  assert.ok(r.data.queued > 50);
  const s = await until(async () => { const x = (await call(admin, 'GET', '/api/admin/dataverse')).data; return x.pending === 0 && x; }, 60000, 'outbox to drain');
  assert.equal(s.failing.length, 0, JSON.stringify(s.failing));
  const companies = rows('Company');
  assert.ok(companies.length > 0);
  const withPrimary = companies.filter((c) => c._new_primary_user_id_value);
  assert.ok(withPrimary.length > 0, 'company -> primary user link kept');
  const reps = rows('User').filter((u) => u._new_company_id_value);
  assert.ok(reps.length > 0, 'user -> company link kept');
});
