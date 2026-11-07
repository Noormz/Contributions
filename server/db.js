// SQLite-backed document store. Every entity record is one row; the record body
// is JSON so the schema in base44/entities/*.jsonc can evolve without migrations.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'portal.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    data TEXT NOT NULL,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by_id TEXT,
    created_by TEXT
  );
  CREATE INDEX IF NOT EXISTS docs_entity ON docs(entity);
  CREATE TABLE IF NOT EXISTS credentials (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    verified INTEGER DEFAULT 0,
    otp TEXT,
    otp_expires TEXT,
    reset_token TEXT,
    reset_expires TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY, filename TEXT, mime TEXT, size INTEGER, path TEXT,
    uploaded_by TEXT, company_id TEXT, created TEXT
  );
`);

export const newId = () => crypto.randomBytes(12).toString('hex');
export const now = () => new Date().toISOString();

const toRecord = (row) => (row ? {
  ...JSON.parse(row.data),
  id: row.id,
  created_date: row.created_date,
  updated_date: row.updated_date,
  created_by_id: row.created_by_id,
  created_by: row.created_by,
} : null);

const SYSTEM_FIELDS = ['id', 'created_date', 'updated_date', 'created_by_id', 'created_by'];
const strip = (data) => {
  const out = { ...data };
  SYSTEM_FIELDS.forEach((k) => delete out[k]);
  return out;
};

export function allDocs(entity) {
  return db.prepare('SELECT * FROM docs WHERE entity = ?').all(entity).map(toRecord);
}

export function getDoc(entity, id) {
  return toRecord(db.prepare('SELECT * FROM docs WHERE entity = ? AND id = ?').get(entity, id));
}

export function insertDoc(entity, data, user, opts = {}) {
  const id = opts.id || newId();
  const ts = opts.created_date || now();
  db.prepare('INSERT INTO docs (id, entity, data, created_date, updated_date, created_by_id, created_by) VALUES (?,?,?,?,?,?,?)')
    .run(id, entity, JSON.stringify(strip(data)), ts, ts, user?.id || null, user?.email || null);
  return getDoc(entity, id);
}

export function updateDoc(entity, id, patch) {
  const existing = getDoc(entity, id);
  if (!existing) return null;
  const merged = { ...strip(existing), ...strip(patch) };
  db.prepare('UPDATE docs SET data = ?, updated_date = ? WHERE id = ? AND entity = ?')
    .run(JSON.stringify(merged), now(), id, entity);
  return getDoc(entity, id);
}

export function deleteDoc(entity, id) {
  db.prepare('DELETE FROM docs WHERE entity = ? AND id = ?').run(entity, id);
}

// Collision-safe sequence: PREFIX-YYYY-000001
export function nextSequence(prefix, year = new Date().getFullYear()) {
  const name = `${prefix}-${year}`;
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT value FROM counters WHERE name = ?').get(name);
    const value = (row?.value || 0) + 1;
    db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(name, value);
    db.exec('COMMIT');
    return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- Mongo-style query matching ----------
const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const cmp = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

function matchValue(value, cond) {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$eq': return matchValue(value, arg);
        case '$ne': return !matchValue(value, arg);
        case '$in': return Array.isArray(value) ? value.some((v) => arg.includes(v)) : arg.includes(value);
        case '$nin': return Array.isArray(value) ? !value.some((v) => arg.includes(v)) : !arg.includes(value);
        case '$gt': return value != null && cmp(value, arg) > 0;
        case '$gte': return value != null && cmp(value, arg) >= 0;
        case '$lt': return value != null && cmp(value, arg) < 0;
        case '$lte': return value != null && cmp(value, arg) <= 0;
        case '$exists': return arg ? value !== undefined && value !== null && value !== '' : value === undefined || value === null || value === '';
        case '$regex': {
          const re = new RegExp(arg, cond.$options || '');
          return value != null && re.test(String(value));
        }
        case '$options': return true;
        default: return false;
      }
    });
  }
  if (Array.isArray(value)) return value.includes(cond);
  if (typeof cond === 'boolean') return (value ?? false) === cond;
  return value === cond || (value != null && cond != null && String(value) === String(cond));
}

export function matches(doc, query = {}) {
  return Object.entries(query || {}).every(([key, cond]) => {
    if (key === '$or') return cond.some((q) => matches(doc, q));
    if (key === '$and') return cond.every((q) => matches(doc, q));
    if (key === '$text' || key === '$search') {
      const needle = String(cond).toLowerCase();
      return JSON.stringify(doc).toLowerCase().includes(needle);
    }
    return matchValue(getPath(doc, key), cond);
  });
}

export function sortDocs(docs, sort) {
  if (!sort) return docs;
  const keys = (Array.isArray(sort) ? sort : String(sort).split(',')).map((s) => s.trim()).filter(Boolean);
  return [...docs].sort((a, b) => {
    for (const k of keys) {
      const desc = k.startsWith('-');
      const f = desc ? k.slice(1) : k;
      const c = cmp(getPath(a, f), getPath(b, f));
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}
