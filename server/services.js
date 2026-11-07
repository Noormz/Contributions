// Shared business helpers: recipients, notifications (in-app + email), audit,
// workflow history and settings.
import { allDocs, getDoc, insertDoc, matches, now } from './db.js';
import { sendMail } from './mail.js';

export const APP_URL = process.env.APP_URL || 'http://localhost:5173';

export const usersByRole = (...roles) =>
  allDocs('User').filter((u) => roles.includes(u.role === 'admin' ? 'system_admin' : u.role) && u.is_active !== false);

export const companyUsers = (companyId) =>
  allDocs('User').filter((u) => u.company_id === companyId && u.is_active !== false);

export function setting(key, fallback = '') {
  const s = allDocs('SystemSettings').find((r) => r.setting_key === key);
  return s ? s.setting_value : fallback;
}

export function audit(user, entity_type, record_id, action, previous, next, related_reference) {
  return insertDoc('AuditLog', {
    entity_type, record_id, action,
    previous_value: previous === undefined ? '' : (typeof previous === 'string' ? previous : JSON.stringify(previous)),
    new_value: next === undefined ? '' : (typeof next === 'string' ? next : JSON.stringify(next)),
    user_id: user?.id || 'system', user_email: user?.email || 'system',
    related_reference: related_reference || '', timestamp: now(),
  }, user);
}

const fill = (tpl, vars) => String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));

// Sends an in-app notification to each user and, unless email === false, an
// email built from the EmailTemplate with `template` key (falls back to title/body).
export async function notify(users, { category, title, title_ar, body = '', body_ar, link = '', template, vars = {}, email = true }) {
  const list = (Array.isArray(users) ? users : [users]).filter(Boolean);
  const seen = new Set();
  const tpl = template ? allDocs('EmailTemplate').find((t) => t.template_key === template && t.is_active !== false) : null;
  for (const u of list) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    insertDoc('Notification', {
      user_id: u.id, category, title, title_ar: title_ar || title, body, body_ar: body_ar || body,
      link, is_read: false,
    }, null);
    if (email && u.email) {
      const ar = u.language_preference === 'ar';
      const v = { name: u.full_name || u.email, link: link ? `${APP_URL}${link}` : APP_URL, ...vars };
      const subject = tpl ? fill(ar ? tpl.subject_ar || tpl.subject_en : tpl.subject_en, v) : (ar ? title_ar || title : title);
      const text = tpl ? fill(ar ? tpl.body_ar || tpl.body_en : tpl.body_en, v) : `${ar ? body_ar || body : body}\n\n${v.link}`;
      await sendMail({ to: u.email, subject, text, category: `notification:${category}` });
    }
  }
}

export const appLink = (id) => `/records/ContributionApplication/${id}`;

export function logTransition(user, app, previous_status, new_status, action, comments = '', calculation_id = '') {
  const ts = now();
  insertDoc('WorkflowTransition', {
    application_id: app.id, entity_type: 'ContributionApplication', record_id: app.id,
    previous_status, new_status, action_by: user?.email || 'system', action_date: ts, comments,
  }, user);
  insertDoc('ApprovalHistory', {
    application_id: app.id, calculation_id, action, previous_status, new_status,
    action_by: user?.id || 'system', action_by_name: user?.full_name || user?.email || 'System',
    action_date: ts, comments,
  }, user);
  audit(user, 'ContributionApplication', app.id, `status:${action}`, previous_status, new_status, app.application_reference);
}

export const OPEN_STATUSES = ['submitted', 'assigned', 'under_review', 'calculation_review', 'pending_manager_approval'];

export function officerLoad() {
  const officers = usersByRole('contributions_officer');
  const apps = allDocs('ContributionApplication').filter((a) => OPEN_STATUSES.includes(a.status));
  return officers.map((o) => ({
    officer: o,
    open: apps.filter((a) => a.assigned_officer_id === o.id).length,
  }));
}

// Fewest open applications wins; ties go to the officer assigned longest ago.
export function pickOfficer() {
  const loads = officerLoad();
  if (!loads.length) return null;
  const lastAssigned = (id) => {
    const rows = allDocs('OfficerAssignment').filter((r) => r.new_officer_id === id);
    return rows.reduce((m, r) => (r.created_date > m ? r.created_date : m), '');
  };
  loads.sort((a, b) => a.open - b.open || lastAssigned(a.officer.id).localeCompare(lastAssigned(b.officer.id)));
  return loads[0].officer;
}

export const find = (entity, query) => allDocs(entity).filter((d) => matches(d, query));
export const findOne = (entity, query) => find(entity, query)[0] || null;
export { getDoc };
