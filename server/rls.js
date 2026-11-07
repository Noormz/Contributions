// Loads entity schemas from base44/entities/*.jsonc and enforces their `rls`
// rules server-side, so access control lives in one declarative place.
import fs from 'node:fs';
import path from 'node:path';
import { getDoc } from './db.js';

const ENTITY_DIR = path.resolve(process.cwd(), 'base44', 'entities');

const stripJsonComments = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

export const schemas = {};
for (const f of fs.readdirSync(ENTITY_DIR)) {
  if (!f.endsWith('.jsonc') && !f.endsWith('.json')) continue;
  const s = JSON.parse(stripJsonComments(fs.readFileSync(path.join(ENTITY_DIR, f), 'utf8')));
  schemas[s.name] = s;
}

export const INTERNAL_ROLES = ['contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'];
export const isAdmin = (u) => u?.role === 'system_admin';
export const isInternal = (u) => INTERNAL_ROLES.includes(u?.role);

const resolveTemplate = (tpl, user) => {
  if (typeof tpl !== 'string') return tpl;
  const m = tpl.match(/^\{\{user\.(data\.)?([a-zA-Z_]+)\}\}$/);
  if (!m) return tpl;
  return user?.[m[2]];
};

function evalRule(rule, user, doc) {
  if (rule === undefined || rule === null) return isAdmin(user);
  if (Object.keys(rule).length === 0) return !!user;
  return Object.entries(rule).every(([key, cond]) => {
    if (key === '$or') return cond.some((r) => evalRule(r, user, doc));
    if (key === '$and') return cond.every((r) => evalRule(r, user, doc));
    if (key === 'user_condition') {
      return Object.entries(cond).every(([k, v]) => user?.[k] === v);
    }
    const expected = resolveTemplate(cond, user);
    if (expected === undefined || expected === null || expected === '') return false;
    const field = key.startsWith('data.') ? key.slice(5) : key;
    const actual = doc?.[field];
    if (Array.isArray(actual)) return actual.includes(expected);
    return actual === expected;
  });
}

// A draft application is the company's own unfinished work: KFAS staff (every internal
// role, administrators included) cannot see it, or the documents attached to it, until
// it is submitted.
const DRAFT_CHILDREN = ['ApplicationDocument', 'FinancialStatement', 'SubsidiaryDeclaration'];
export function isDraftWork(entity, doc) {
  if (entity === 'ContributionApplication') return doc?.status === 'draft';
  if (DRAFT_CHILDREN.includes(entity) && doc?.application_id) return getDoc('ContributionApplication', doc.application_id)?.status === 'draft';
  return false;
}

// op: read | create | update | delete
export function can(entity, op, user, doc) {
  if (!user) return false;
  if (isInternal(user) && op !== 'create' && isDraftWork(entity, doc)) return false;
  if (isAdmin(user)) return true;
  const schema = schemas[entity];
  if (!schema) return false;
  return evalRule(schema.rls?.[op], user, doc);
}

export function knownEntity(entity) {
  return !!schemas[entity] && entity !== 'User';
}
