import './env.js';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, DATA_DIR, allDocs, getDoc, insertDoc, updateDoc, deleteDoc, matches, sortDocs, nextSequence, now, insertFile } from './db.js';
import { can, knownEntity, isInternal, isAdmin } from './rls.js';
import { startDataverse, dataverseStatus } from './dataverse/index.js';
import { enqueueAll, fetchFileContent } from './dataverse/sync.js';
import { enabled as dataverseEnabled } from './dataverse/client.js';
import {
  userFromToken, createSession, destroySession, findUserByLogin, verifyPassword, createUser, issueOtp,
  markVerified, findCredentialByEmail, issueResetToken, consumeResetToken, setPassword, passwordProblem,
} from './auth.js';
import { functions, HttpError, processInboundEmail, runReminders } from './functions.js';
import { notify, usersByRole, audit } from './services.js';
import { sendMail, recentMail } from './mail.js';
import { runReport, reportXlsx, reportPdf, REPORTS } from './reports.js';
import { handleAi, LLM as AI_LLM, dailyLimit as aiDailyLimit, usedToday as aiUsedToday } from './ai/gateway.js';
import { confirmationPdf, calculationPdf, paymentReceiptPdf, receiptVoucherPdf, clearanceLetterPdf, streamArchive } from './documents.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);
const ALLOWED_EXT = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv|txt|zip|msg|eml)$/i;
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

// ---------- auth middleware ----------
const tokenFrom = (req) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('portal_token='));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
};
app.use((req, _res, next) => { req.user = userFromToken(tokenFrom(req)); next(); });
const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ message: 'Authentication required' }));
const setCookie = (res, token) => res.setHeader('Set-Cookie', `portal_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`);

const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? {});
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ message: status >= 500 ? 'Something went wrong. Please try again.' : e.message });
  }
};
const bad = (status, message) => { throw new HttpError(status, message); };

// ---------- auth routes ----------
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const found = findUserByLogin(email);
  if (!found || !verifyPassword(password || '', found.cred.password_hash)) bad(401, 'Invalid email or password.');
  if (!found.cred.verified) bad(403, 'Please verify your email address before logging in.');
  if (found.user.is_active === false) bad(403, 'This account is deactivated. Contact the Contributions Unit.');
  const token = createSession(found.user.id);
  updateDoc('User', found.user.id, { last_login_date: now() });
  setCookie(res, token);
  return { access_token: token, user: getDoc('User', found.user.id) };
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  destroySession(tokenFrom(req));
  res.setHeader('Set-Cookie', 'portal_token=; Path=/; Max-Age=0');
  return { ok: true };
}));

app.post('/api/auth/register', wrap(async (req) => {
  const { email, password, full_name } = req.body || {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) bad(400, 'Enter a valid email address.');
  const problem = passwordProblem(password);
  if (problem) bad(400, problem);
  const existing = findCredentialByEmail(email);
  if (existing?.verified) bad(409, 'An account with this email already exists. Please log in.');
  const userId = existing ? existing.user_id : createUser({ email, password, full_name }).id;
  if (existing) setPassword(userId, password);
  const otp = issueOtp(userId);
  await sendMail({ to: email, subject: 'Your Contributions E-Portal verification code', text: `Your verification code is ${otp}. It expires in 15 minutes.`, category: 'verification' });
  return { ok: true };
}));

app.post('/api/auth/resend-otp', wrap(async (req) => {
  const cred = findCredentialByEmail(req.body?.email);
  if (cred && !cred.verified) {
    const otp = issueOtp(cred.user_id);
    await sendMail({ to: cred.email, subject: 'Your Contributions E-Portal verification code', text: `Your verification code is ${otp}. It expires in 15 minutes.`, category: 'verification' });
  }
  return { ok: true };
}));

app.post('/api/auth/verify-otp', wrap(async (req, res) => {
  const { email, otpCode } = req.body || {};
  const cred = findCredentialByEmail(email);
  if (!cred || !cred.otp || cred.otp !== String(otpCode || '').trim() || cred.otp_expires < now()) bad(400, 'The verification code is invalid or has expired.');
  markVerified(cred.user_id);
  const token = createSession(cred.user_id);
  setCookie(res, token);
  return { access_token: token, user: getDoc('User', cred.user_id) };
}));

app.post('/api/auth/reset-request', wrap(async (req) => {
  const cred = findCredentialByEmail(req.body?.email);
  if (cred) {
    const token = issueResetToken(cred.user_id);
    await sendMail({ to: cred.email, subject: 'Reset your Contributions E-Portal password', text: `Open this link to reset your password: ${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`, category: 'password_reset' });
  }
  return { ok: true };
}));

app.post('/api/auth/reset', wrap(async (req) => {
  const { token, password } = req.body || {};
  const problem = passwordProblem(password);
  if (problem) bad(400, problem);
  const userId = consumeResetToken(token);
  if (!userId) bad(400, 'This reset link is invalid or has expired.');
  setPassword(userId, password);
  return { ok: true };
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.put('/api/auth/me', requireAuth, wrap(async (req) => {
  const allowed = ['full_name', 'full_name_ar', 'phone', 'job_title', 'language_preference'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  // A newly registered representative may link the company they just created.
  if (req.body?.company_id && !req.user.company_id) {
    const c = getDoc('Company', req.body.company_id);
    if (c && c.primary_user_id === req.user.id) patch.company_id = c.id;
  }
  return updateDoc('User', req.user.id, patch);
}));

// ---------- entity guards & hooks ----------
const REP_PROTECTED = {
  ContributionApplication: ['status', 'assigned_officer_id', 'assigned_officer_name', 'assigned_date', 'contribution_due', 'application_reference', 'submitted_date', 'completed_date', 'company_id', 'company_name'],
  Company: ['status', 'profile_locked', 'cofs_file_number', 'primary_user_id', 'authorized_users'],
  FinancialStatement: ['review_status', 'company_id'],
  Inquiry: ['status', 'response', 'response_date', 'assigned_officer_id', 'assigned_officer_name', 'inquiry_reference'],
};
const FUNCTION_ONLY_CREATE = ['Payment', 'ReceiptVoucher', 'ClearanceLetter', 'PaymentAllocation', 'PaymentGatewayTransaction', 'OfficerAssignment', 'CommunicationMessage', 'CommunicationThread', 'ContributionCalculation', 'WorkflowTransition', 'ApprovalHistory', 'CalculationVersion', 'CompanyProfileChangeHistory', 'MailOutbox'];
const IMMUTABLE = ['AuditLog', 'MailOutbox', 'WorkflowTransition', 'ApprovalHistory', 'CalculationVersion', 'CompanyProfileChangeHistory'];
const NO_AUDIT = ['AuditLog', 'Notification', 'MailOutbox', 'RecordComment'];
const STATUS_FIELDS = { Payment: ['payment_status', 'verified_by', 'verified_date'], ContributionApplication: ['status'] };

function beforeCreate(entity, user, data) {
  if (FUNCTION_ONLY_CREATE.includes(entity) && !isAdmin(user)) bad(403, 'This record is created through its workflow action.');
  const d = { ...data };
  if (user.role === 'company_representative') {
    (REP_PROTECTED[entity] || []).forEach((k) => delete d[k]);
    if (['ContributionApplication', 'FinancialStatement', 'ApplicationDocument', 'Inquiry', 'SubsidiaryDeclaration', 'CompanyRelationship'].includes(entity)) {
      if (entity === 'CompanyRelationship') { if (d.parent_company_id !== user.company_id && d.subsidiary_company_id !== user.company_id) bad(403, 'You can only manage relationships of your own company.'); d.company_id = user.company_id; }
      else d.company_id = user.company_id;
    }
    if (entity === 'Company') {
      if (user.company_id) bad(400, 'Your account is already linked to a company.');
      d.primary_user_id = user.id; d.authorized_users = [user.id]; d.status = 'pending'; d.profile_locked = false;
    }
  }
  if (entity === 'Company') {
    if (!d.company_name_ar && user.role === 'company_representative') bad(400, 'The Arabic company name is required.');
    const cr = String(d.commercial_registration_number || '').trim();
    if (!cr) bad(400, 'The commercial registration number is required.');
    if (allDocs('Company').some((c) => String(c.commercial_registration_number).trim() === cr)) bad(409, 'A company with this commercial registration number is already registered.');
  }
  if (entity === 'ContributionApplication') {
    if (!d.company_id) bad(400, 'Company is required.');
    const company = getDoc('Company', d.company_id);
    d.company_name = company?.company_name_en || '';
    d.status = user.role === 'company_representative' || !d.status ? 'draft' : d.status;
    if (d.financial_year && allDocs('ContributionApplication').some((a) => a.company_id === d.company_id && a.financial_year === d.financial_year && a.status !== 'draft')) {
      bad(409, `An application for financial year ${d.financial_year} already exists for this company.`);
    }
  }
  if (entity === 'Inquiry') {
    d.inquiry_reference = nextSequence('INQ');
    d.status = 'open';
    d.submission_date = now();
    if (d.company_id) d.company_name = getDoc('Company', d.company_id)?.company_name_en || d.company_name;
  }
  if (entity === 'FinancialStatement' && !d.upload_date) d.upload_date = now();
  if (entity === 'ApplicationDocument') { d.uploaded_by_name = user.full_name || user.email; d.upload_date = now(); }
  return d;
}

function beforeUpdate(entity, user, existing, patch) {
  if (IMMUTABLE.includes(entity)) bad(403, 'Audit and history records cannot be modified.');
  const p = { ...patch };
  (STATUS_FIELDS[entity] || []).forEach((k) => { if (k in p && p[k] !== existing[k] && !isAdmin(user)) bad(403, 'Status changes must go through the workflow actions.'); });
  if (user.role === 'company_representative') {
    (REP_PROTECTED[entity] || []).forEach((k) => delete p[k]);
    if (entity === 'ContributionApplication' && !['draft', 'returned'].includes(existing.status)) bad(403, 'This application can no longer be edited.');
    if (entity === 'Company' && existing.profile_locked) bad(403, 'Your company profile is locked while an application is in progress. Request field changes from the application.');
  }
  if (entity === 'Company' && p.commercial_registration_number && allDocs('Company').some((c) => c.id !== existing.id && c.commercial_registration_number === p.commercial_registration_number)) bad(409, 'Another company already uses this CR number.');
  return p;
}

async function afterCreate(entity, user, rec) {
  if (entity === 'Company') {
    await notify(usersByRole('contributions_officer', 'contributions_manager'), { category: 'registration', title: `New company registration: ${rec.company_name_en}`, title_ar: `تسجيل شركة جديدة: ${rec.company_name_ar || rec.company_name_en}`, link: `/records/Company/${rec.id}`, template: 'unit_new_registration', vars: { company: rec.company_name_en } });
    if (user.role === 'company_representative') {
      await notify(user, { category: 'registration', title: 'Your company registration was received', title_ar: 'تم استلام تسجيل شركتك', link: '/company-profile', template: 'registration_success', vars: { company: rec.company_name_en } });
    }
  }
  if (entity === 'Inquiry') {
    await notify(usersByRole('contributions_officer', 'contributions_manager'), { category: 'inquiry', title: `New inquiry ${rec.inquiry_reference}: ${rec.subject}`, title_ar: `استفسار جديد ${rec.inquiry_reference}`, link: `/records/Inquiry/${rec.id}`, template: 'unit_new_inquiry', vars: { reference: rec.inquiry_reference, subject: rec.subject, company: rec.company_name || '' } });
  }
}

// ---------- entity CRUD ----------
const parseQuery = (q) => { try { return q ? JSON.parse(q) : {}; } catch { bad(400, 'Invalid query'); } return {}; };
const checkEntity = (e) => { if (!knownEntity(e)) bad(404, 'Unknown entity'); };
const readable = (entity, user) => allDocs(entity).filter((d) => can(entity, 'read', user, d));

app.get('/api/entities/:entity', requireAuth, wrap(async (req) => {
  checkEntity(req.params.entity);
  const query = parseQuery(req.query.q);
  let docs = readable(req.params.entity, req.user).filter((d) => matches(d, query));
  if (req.query.distinct) return { items: Array.from(new Set(docs.map((d) => d[req.query.distinct]).filter((v) => v !== undefined && v !== ''))) };
  docs = sortDocs(docs, req.query.sort || '-created_date');
  const limit = Math.min(Number(req.query.limit || 50), 1000);
  const offset = Number(req.query.cursor ? Buffer.from(req.query.cursor, 'base64').toString() : req.query.skip || 0);
  const items = docs.slice(offset, offset + limit);
  const more = offset + limit < docs.length;
  return { items, has_more: more, next_cursor: more ? Buffer.from(String(offset + limit)).toString('base64') : null, total: docs.length };
}));

app.get('/api/entities/:entity/count', requireAuth, wrap(async (req) => {
  checkEntity(req.params.entity);
  const query = parseQuery(req.query.q);
  return { count: readable(req.params.entity, req.user).filter((d) => matches(d, query)).length };
}));

app.post('/api/entities/:entity/aggregate', requireAuth, wrap(async (req) => {
  checkEntity(req.params.entity);
  const { query = {}, sum, group_by } = req.body || {};
  const docs = readable(req.params.entity, req.user).filter((d) => matches(d, query));
  const groups = {};
  docs.forEach((d) => {
    const g = group_by ? String(d[group_by] ?? '') : '_all';
    groups[g] = groups[g] || { [group_by || 'group']: g, count: 0, [`sum_${sum}`]: 0 };
    groups[g].count += 1;
    if (sum) groups[g][`sum_${sum}`] += Number(d[sum] || 0);
  });
  return { rows: Object.values(groups) };
}));

app.get('/api/entities/:entity/:id', requireAuth, wrap(async (req) => {
  checkEntity(req.params.entity);
  const doc = getDoc(req.params.entity, req.params.id);
  if (!doc) bad(404, 'The requested record could not be found.');
  if (!can(req.params.entity, 'read', req.user, doc)) bad(403, 'You do not have permission to access this record.');
  return doc;
}));

async function createOne(entity, user, body) {
  if (entity === 'AuditLog') return {}; // audit entries are written by the server only
  const data = beforeCreate(entity, user, body || {});
  if (!can(entity, 'create', user, data)) bad(403, 'You do not have permission to create this record.');
  const rec = insertDoc(entity, data, user);
  if (!NO_AUDIT.includes(entity)) audit(user, entity, rec.id, 'create', '', data);
  await afterCreate(entity, user, rec);
  return rec;
}

app.post('/api/entities/:entity', requireAuth, wrap(async (req) => { checkEntity(req.params.entity); return createOne(req.params.entity, req.user, req.body); }));
app.post('/api/entities/:entity/bulk', requireAuth, wrap(async (req) => {
  checkEntity(req.params.entity);
  const out = [];
  for (const b of req.body || []) out.push(await createOne(req.params.entity, req.user, b));
  return out;
}));

app.patch('/api/entities/:entity/:id', requireAuth, wrap(async (req) => {
  const { entity, id } = req.params;
  checkEntity(entity);
  const existing = getDoc(entity, id);
  if (!existing) bad(404, 'The requested record could not be found.');
  if (!can(entity, 'update', req.user, existing)) bad(403, 'You do not have permission to edit this record.');
  const patch = beforeUpdate(entity, req.user, existing, req.body || {});
  const rec = updateDoc(entity, id, patch);
  if (!NO_AUDIT.includes(entity)) {
    const changed = Object.keys(patch).filter((k) => JSON.stringify(existing[k]) !== JSON.stringify(patch[k]));
    if (changed.length) audit(req.user, entity, id, 'update', Object.fromEntries(changed.map((k) => [k, existing[k]])), Object.fromEntries(changed.map((k) => [k, patch[k]])));
  }
  return rec;
}));

app.delete('/api/entities/:entity/:id', requireAuth, wrap(async (req) => {
  const { entity, id } = req.params;
  checkEntity(entity);
  if (IMMUTABLE.includes(entity)) bad(403, 'Audit and history records cannot be deleted.');
  const existing = getDoc(entity, id);
  if (!existing) bad(404, 'The requested record could not be found.');
  if (!can(entity, 'delete', req.user, existing)) bad(403, 'You do not have permission to delete this record.');
  if (entity === 'ContributionApplication' && !isAdmin(req.user) && !['draft'].includes(existing.status)) bad(400, 'Only draft applications can be deleted.');
  deleteDoc(entity, id);
  if (!NO_AUDIT.includes(entity)) audit(req.user, entity, id, 'delete', existing, '');
  return { ok: true };
}));

// ---------- files ----------
app.post('/api/files', requireAuth, upload.single('file'), wrap(async (req) => {
  const f = req.file;
  if (!f) bad(400, 'No file uploaded.');
  if (!ALLOWED_EXT.test(f.originalname)) { fs.unlinkSync(f.path); bad(400, 'This file type is not allowed. Upload PDF, image, Office, CSV, TXT or ZIP files.'); }
  const id = crypto.randomBytes(12).toString('hex');
  const companyId = req.user.role === 'company_representative' ? req.user.company_id : (req.body.company_id || '');
  insertFile({ id, filename: f.originalname, mime: f.mimetype, size: f.size, path: f.path, uploaded_by: req.user.id, company_id: companyId || '', created: now() });
  const url = `/api/files/${id}`;
  return { file_uri: url, file_url: url, id, filename: f.originalname, size: f.size, mime: f.mimetype };
}));

app.get('/api/files/:id/meta', requireAuth, wrap(async (req) => {
  const f = db.prepare('SELECT id, filename, mime, size, uploaded_by, company_id, created FROM files WHERE id = ?').get(req.params.id);
  if (!f) bad(404, 'File not found');
  return f;
}));

app.get('/api/files/:id', requireAuth, async (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ message: 'File not found' });
  const allowed = isInternal(req.user) || f.uploaded_by === req.user.id || (f.company_id && f.company_id === req.user.company_id);
  if (!allowed) return res.status(403).json({ message: 'You do not have permission to access this file.' });
  // After rebuilding the portal from Dynamics only file metadata is local: fetch the bytes once.
  if ((!f.path || !fs.existsSync(f.path)) && dataverseEnabled()) {
    const dest = path.join(DATA_DIR, 'uploads', f.id);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (await fetchFileContent(f.id, dest).catch(() => false)) f.path = dest;
  }
  if (!f.path || !fs.existsSync(f.path)) return res.status(404).json({ message: 'File content not available' });
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(f.filename)}"`);
  fs.createReadStream(f.path).pipe(res);
});

// ---------- functions ----------
// Feature modules in server/ext/*.js may export `functions` to extend the API.
const extFunctions = {};
for (const f of fs.readdirSync(path.resolve(process.cwd(), 'server', 'ext')).filter((x) => x.endsWith('.js'))) {
  const mod = await import(`./ext/${f}`);
  Object.assign(extFunctions, mod.functions || {});
}
app.post('/api/functions/:name', requireAuth, wrap(async (req) => {
  const fn = functions[req.params.name] || extFunctions[req.params.name];
  if (!fn) bad(404, 'Unknown function');
  return fn(req.user, req.body || {});
}));

// ---------- AI assistant (server/ai) ----------
app.post('/api/ai', requireAuth, wrap(async (req, res) => {
  const out = await handleAi({ user: req.user, body: req.body || {} });
  res.status(out.status).json(out.body);
}));
app.get('/api/ai/status', requireAuth, (req, res) => {
  const limit = aiDailyLimit();
  res.json({ provider: AI_LLM.provider, enabled: limit > 0, daily_limit: limit, used_today: aiUsedToday(req.user) });
});
// Recent assistant requests for administrators (read-only; the log is written by the server only).
app.get('/api/ai/log', requireAuth, (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only system administrators can view the assistant log.' });
  res.json(sortDocs(allDocs('AiAuditLog'), '-created_date').slice(0, 300));
});

// ---------- reports ----------
const REPORT_ROLES = ['contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'];
app.get('/api/reports', requireAuth, (req, res) => res.json(Object.entries(REPORTS).map(([k, r]) => ({ name: k, title: r.title }))));
app.get('/api/reports/:name', requireAuth, wrap(async (req, res) => {
  if (!REPORT_ROLES.includes(req.user.role)) bad(403, 'You do not have permission to view reports.');
  const r = runReport(req.params.name, req.query);
  if (!r) bad(404, 'Unknown report');
  const fmt = req.query.format;
  audit(req.user, 'Report', req.params.name, fmt ? `export_${fmt}` : 'view', '', JSON.stringify(req.query));
  if (fmt === 'xlsx') {
    const buf = await reportXlsx(r);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.xlsx"`);
    return res.end(Buffer.from(buf));
  }
  if (fmt === 'pdf') {
    const buf = await reportPdf(r, req.query.password || '', req.query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.pdf"`);
    return res.end(buf);
  }
  return r;
}));

// ---------- documents ----------
function readableApp(req) {
  const a = getDoc('ContributionApplication', req.params.id);
  if (!a) bad(404, 'The requested application could not be found.');
  if (!can('ContributionApplication', 'read', req.user, a)) bad(403, 'You do not have permission to access this record.');
  return a;
}
app.get('/api/applications/:id/confirmation.pdf', requireAuth, wrap(async (req, res) => {
  const a = readableApp(req);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${a.application_reference || 'application'}-confirmation.pdf"`);
  res.end(await confirmationPdf(a));
}));
app.get('/api/applications/:id/calculation.pdf', requireAuth, wrap(async (req, res) => {
  const a = readableApp(req);
  if (!isInternal(req.user)) bad(403, 'Internal document');
  const calc = allDocs('ContributionCalculation').find((c) => c.application_id === a.id);
  if (!calc) bad(404, 'No calculation');
  res.setHeader('Content-Type', 'application/pdf');
  res.end(await calculationPdf(a, calc));
}));
app.get('/api/applications/:id/archive.zip', requireAuth, wrap(async (req, res) => {
  const a = readableApp(req);
  if (!isInternal(req.user)) bad(403, 'Only internal users can download the archive.');
  if (a.status !== 'completed') bad(400, 'The archive is available once the application is completed.');
  audit(req.user, 'ContributionApplication', a.id, 'download_archive', '', '', a.application_reference);
  await streamArchive(a, res);
}));

// Payment receipt, receipt voucher and clearance letter PDFs (readable by whoever may read the record).
const sendPdf = (res, buf, name, download) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}"`);
  res.end(buf);
};
for (const [route, entity, build, nameOf] of [
  ['/api/payments/:id/receipt.pdf', 'Payment', paymentReceiptPdf, (r) => `${r.payment_reference}-receipt.pdf`],
  ['/api/receipt-vouchers/:id/voucher.pdf', 'ReceiptVoucher', receiptVoucherPdf, (r) => `${r.voucher_number}.pdf`],
  ['/api/clearance-letters/:id/letter.pdf', 'ClearanceLetter', clearanceLetterPdf, (r) => `${r.clearance_reference}.pdf`],
]) {
  app.get(route, requireAuth, wrap(async (req, res) => {
    const rec = getDoc(entity, req.params.id);
    if (!rec) bad(404, 'The requested record could not be found.');
    if (!can(entity, 'read', req.user, rec)) bad(403, 'You do not have permission to access this record.');
    sendPdf(res, await build(rec), nameOf(rec), req.query.download);
  }));
}

// Public document verification (QR codes on generated PDFs). Shows only what the document itself states.
app.get('/api/public/verify/:code', wrap(async (req) => {
  const v = allDocs('DocumentVerification').find((d) => d.code === String(req.params.code || '').toUpperCase());
  if (!v) return { valid: false };
  const TYPES = { submission_confirmation: 'Submission confirmation', calculation_sheet: 'Internal calculation sheet', payment_receipt: 'Payment receipt', receipt_voucher: 'Receipt voucher', clearance_letter: 'Clearance letter', archive_cover: 'Application archive' };
  const ENT = { submission_confirmation: 'ContributionApplication', archive_cover: 'ContributionApplication', calculation_sheet: 'ContributionCalculation', payment_receipt: 'Payment', receipt_voucher: 'ReceiptVoucher', clearance_letter: 'ClearanceLetter' };
  const rec = ENT[v.doc_type] ? getDoc(ENT[v.doc_type], v.record_id) : null;
  const status = rec ? (rec.status || rec.payment_status || rec.clearance_status) : 'withdrawn';
  return { valid: !!rec, code: v.code, document: TYPES[v.doc_type] || v.doc_type, reference: v.reference, company_name: v.company_name, company_name_ar: v.company_name_ar, summary: v.summary, issued_at: v.issued_at, current_status: status };
}));

// ---------- mailbox & inbound email ----------
app.get('/api/mailbox', requireAuth, wrap(async (req) => {
  if (!isInternal(req.user)) bad(403, 'Not allowed');
  const all = recentMail(500);
  if (isAdmin(req.user) || req.user.role === 'contributions_manager') return all;
  return all.filter((m) => [...m.to_addresses, ...m.cc_addresses, ...m.bcc_addresses].includes(req.user.email));
}));

// Local development mailbox (no login) so OTP codes and notifications can be read.
// Disabled when NODE_ENV=production.
app.get('/api/dev/mailbox', wrap(async (req) => {
  if (process.env.NODE_ENV === 'production') bad(404, 'Not found');
  const to = String(req.query.to || '').toLowerCase();
  return recentMail(300).filter((m) => !to || [...m.to_addresses, ...m.cc_addresses, ...m.bcc_addresses].map((x) => x.toLowerCase()).includes(to));
}));

// Inbound mail webhook (e.g. from the mail provider's inbound parse). Protected by a shared secret.
app.post('/api/email/inbound', wrap(async (req) => {
  const secret = process.env.INBOUND_SECRET || 'dev-inbound-secret';
  if (req.headers['x-inbound-secret'] !== secret) bad(401, 'Invalid inbound secret');
  const { from, subject, text, body } = req.body || {};
  return processInboundEmail({ from, subject, body: text || body || '' });
}));

// Public lookup values (e.g. sectors for the pre-login registration form).
app.get('/api/public/lookups', (req, res) => {
  const cat = String(req.query.category || '');
  res.json(allDocs('LookupValue').filter((l) => l.is_active !== false && (!cat || l.category === cat)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(({ category, code, value_en, value_ar }) => ({ category, code, value_en, value_ar })));
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- Dynamics (Dataverse) connection ----------
app.get('/api/admin/dataverse', requireAuth, (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only system administrators can view the Dynamics connection.' });
  res.json(dataverseStatus());
});
app.post('/api/admin/dataverse/push-all', requireAuth, (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only system administrators can do this.' });
  res.json({ queued: enqueueAll() });
});

// ---------- production static ----------
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

const PORT = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV !== 'test-no-listen') {
  app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT} · assistant provider: ${AI_LLM.provider}${AI_LLM.model ? ` (${AI_LLM.model})` : ''}`));
  setInterval(() => runReminders().catch((e) => console.error('[reminders]', e)), 60 * 60 * 1000);
  startDataverse();
}

export default app;
