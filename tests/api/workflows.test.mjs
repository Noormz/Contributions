// End-to-end API tests for the FRD workflows. Runs an isolated seeded server.
//   node --test tests/api
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = path.resolve(`data-test-api-${Date.now()}`);
const PASSWORD = 'Portal#2026';
let server;

before(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const seeded = spawnSync(process.execPath, ['server/seed.js'], { env: { ...process.env, DATA_DIR }, encoding: 'utf8' });
  assert.equal(seeded.status, 0, seeded.stderr);
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DATA_DIR, PORT: String(PORT) }, stdio: 'pipe' });
  let log = '';
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) { await loginAll(); return; } } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start: ${log}`);
});

after(async () => {
  server?.kill();
  await new Promise((r) => setTimeout(r, 500));
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* file lock on Windows */ }
});

async function call(token, method, url, body, raw = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${url}`, { method, headers, body: payload });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const ok = (r, msg) => { assert.ok(r.status < 300, `${msg || ''} → ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const login = async (email) => ok(await call(null, 'POST', '/api/auth/login', { email, password: PASSWORD }), `login ${email}`).access_token;
const fn = (t, name, params) => call(t, 'POST', `/api/functions/${name}`, params);
const list = async (t, entity, q = {}) => ok(await call(t, 'GET', `/api/entities/${entity}?q=${encodeURIComponent(JSON.stringify(q))}&limit=500`)).items;
const create = (t, entity, data) => call(t, 'POST', `/api/entities/${entity}`, data);
async function upload(t, name = 'doc.pdf') {
  const fd = new FormData();
  fd.append('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), name);
  return ok(await call(t, 'POST', '/api/files', fd)).file_url;
}
const devMail = async (to) => ok(await call(null, 'GET', `/api/dev/mailbox?to=${encodeURIComponent(to)}`));

let T = {};
async function loginAll() {
  for (const [k, e] of Object.entries({ admin: 'admin@portal.local', manager: 'manager@portal.local', officer1: 'officer1@portal.local', officer2: 'officer2@portal.local', officer3: 'officer3@portal.local', accounts: 'accounts@portal.local', rep1: 'rep1@gulfhorizon.example', rep3: 'rep@kni.example' })) T[k] = await login(e);
}

test('FR-02 login: username login, wrong password, multiple users per company', async () => {
  assert.ok(await login('manager'), 'username login');
  const bad = await call(null, 'POST', '/api/auth/login', { email: 'admin@portal.local', password: 'wrong' });
  assert.equal(bad.status, 401);
  const rep2 = await login('rep2@gulfhorizon.example');
  const me1 = ok(await call(T.rep1, 'GET', '/api/auth/me'));
  const me2 = ok(await call(rep2, 'GET', '/api/auth/me'));
  assert.equal(me1.company_id, me2.company_id, 'two users share a company');
});

test('FR-01 registration with OTP, Arabic name required, duplicate CR rejected', async () => {
  const email = 'newrep@newco.example';
  assert.equal((await call(null, 'POST', '/api/auth/register', { email, password: 'short' })).status, 400, 'password policy');
  ok(await call(null, 'POST', '/api/auth/register', { email, password: 'Newco#2026x' }));
  const otpMail = (await devMail(email)).find((m) => m.category === 'verification');
  const otp = otpMail.body.match(/\d{6}/)[0];
  assert.equal((await call(null, 'POST', '/api/auth/verify-otp', { email, otpCode: '000000' })).status, 400);
  const { access_token: t } = ok(await call(null, 'POST', '/api/auth/verify-otp', { email, otpCode: otp }));
  assert.equal((await create(t, 'Company', { company_name_en: 'NewCo', commercial_registration_number: '999001' })).status, 400, 'arabic name required');
  assert.equal((await create(t, 'Company', { company_name_en: 'Dup', company_name_ar: 'مكرر', commercial_registration_number: '345120' })).status, 409, 'duplicate CR');
  const c = ok(await create(t, 'Company', { company_name_en: 'NewCo', company_name_ar: 'شركة جديدة', commercial_registration_number: '999001', is_wll: true, status: 'active' }));
  assert.equal(c.status, 'pending', 'rep cannot self-activate');
  ok(await call(t, 'PUT', '/api/auth/me', { company_id: c.id }));
  assert.equal(ok(await call(t, 'GET', '/api/auth/me')).company_id, c.id);
  const notes = await list(T.officer1, 'Notification', { category: 'registration' });
  assert.ok(notes.some((n) => n.title.includes('NewCo')), 'contributions unit notified of registration');
});

test('RLS: company isolation, internal-only data, immutable audit, function-only records', async () => {
  const kniApps = await list(T.rep3, 'ContributionApplication');
  const ghApps = await list(T.rep1, 'ContributionApplication');
  assert.ok(kniApps.length && ghApps.length);
  assert.ok(!kniApps.some((a) => ghApps.find((g) => g.id === a.id)), 'reps only see own company apps');
  assert.equal((await call(T.rep3, 'GET', `/api/entities/ContributionApplication/${ghApps[0].id}`)).status, 403);
  assert.equal((await list(T.rep1, 'ContributionCalculation')).length, 0, 'reps cannot read calculations');
  assert.equal((await fn(T.rep1, 'companyBalances', { company_id: ghApps[0].company_id })).status, 403, 'balances internal only');
  assert.equal((await create(T.rep1, 'Payment', { company_id: ghApps[0].company_id, payment_amount: 5, payment_method: 'cheque' })).status, 403);
  const log = (await list(T.admin, 'AuditLog'))[0];
  assert.equal((await call(T.admin, 'PATCH', `/api/entities/AuditLog/${log.id}`, { action: 'x' })).status, 403, 'audit immutable');
  assert.equal((await call(T.admin, 'DELETE', `/api/entities/AuditLog/${log.id}`)).status, 403);
  const files = await list(T.rep1, 'FinancialStatement');
  const other = (await list(T.admin, 'FinancialStatement')).find((f) => f.company_id !== files[0].company_id);
  assert.equal((await call(T.rep1, 'GET', other.file_url, undefined, true)).status, 403, 'file isolation');
});

test('FR-05..17 full lifecycle: submit, auto-assign, review, manager return/approve, partial payments, PG, voucher, complete, archive', async () => {
  const me = ok(await call(T.rep3, 'GET', '/api/auth/me'));
  const cid = me.company_id;
  // draft + duplicate-year guard
  assert.equal((await create(T.rep3, 'ContributionApplication', { financial_year: '2023' })).status, 409, 'duplicate financial year rejected');
  const app = ok(await create(T.rep3, 'ContributionApplication', { financial_year: '2025', status: 'approved', payment_methods: ['bank_transfer', 'cheque'], profile_confirmed: true, acknowledgements: { accuracy: true, terms: true }, declared_amount: 12000 }));
  assert.equal(app.status, 'draft', 'rep cannot set status');
  // submit validation
  let r = await fn(T.rep3, 'submitApplication', { application_id: app.id });
  assert.equal(r.status, 400);
  assert.match(r.data.message, /financial statement/i);
  ok(await create(T.rep3, 'FinancialStatement', { application_id: app.id, financial_year: '2025', statement_end_date: '2025-12-31', document_name: 'FS 2025', file_url: await upload(T.rep3) }));
  ok(await create(T.rep3, 'FinancialStatement', { application_id: app.id, financial_year: '2024', statement_end_date: '2024-12-31', document_name: 'FS 2024 restated', file_url: await upload(T.rep3) }));
  ok(await create(T.rep3, 'ApplicationDocument', { application_id: app.id, category: 'payment_evidence', payment_method: 'bank_transfer', file_url: await upload(T.rep3), filename: 'slip.pdf' }));
  r = await fn(T.rep3, 'submitApplication', { application_id: app.id });
  assert.match(r.data.message, /cheque/i, 'evidence required per method');
  ok(await create(T.rep3, 'ApplicationDocument', { application_id: app.id, category: 'payment_evidence', payment_method: 'cheque', file_url: await upload(T.rep3), filename: 'cheque.pdf' }));
  ok(await create(T.rep3, 'SubsidiaryDeclaration', { application_id: app.id, subsidiary_name: 'Sub Co', ownership_percentage: 40, financial_year: '2025', statement_incomplete: true }));
  ok(await call(T.rep3, 'PATCH', `/api/entities/ContributionApplication/${app.id}`, { partial_calculation: true }));
  // officer loads before submit
  const loadBefore = ok(await fn(T.manager, 'officerWorkload'));
  const submitted = ok(await fn(T.rep3, 'submitApplication', { application_id: app.id }));
  assert.match(submitted.application_reference, /^APP-\d{4}-\d{6}$/);
  assert.equal(submitted.status, 'assigned', 'auto-assigned');
  const minOpen = Math.min(...loadBefore.map((o) => o.open));
  assert.equal(loadBefore.find((o) => o.officer_id === submitted.assigned_officer_id).open, minOpen, 'least-loaded officer chosen');
  assert.equal(ok(await call(T.admin, 'GET', `/api/entities/Company/${cid}`)).profile_locked, true, 'profile locked');
  assert.equal((await call(T.rep3, 'PATCH', `/api/entities/ContributionApplication/${app.id}`, { additional_comments: 'x' })).status, 403, 'no edits after submit');
  const confirmation = await call(T.rep3, 'GET', `/api/applications/${app.id}/confirmation.pdf`, undefined, true);
  assert.equal(confirmation.headers.get('content-type'), 'application/pdf');
  const officerEmail = { [submitted.assigned_officer_id]: null };
  const officers = ok(await fn(T.manager, 'listOfficers'));
  const officer = officers.find((o) => o.id === submitted.assigned_officer_id);
  const ot = await login(officer.email);
  assert.ok(officerEmail);
  assert.ok((await list(ot, 'Notification', { category: 'assignment' })).some((n) => n.title.includes(submitted.application_reference)), 'officer notified');
  // manual reassignment by manager, then back
  const other = officers.find((o) => o.id !== officer.id);
  ok(await fn(T.manager, 'assignApplication', { application_id: app.id, officer_id: other.id, reason: 'Balancing' }));
  ok(await fn(T.manager, 'assignApplication', { application_id: app.id, officer_id: officer.id, reason: 'Back to original officer' }));
  assert.equal((await list(T.manager, 'OfficerAssignment', { application_id: app.id })).length, 3);
  assert.equal((await fn(ot, 'assignApplication', { application_id: app.id, officer_id: other.id })).status, 403, 'officers cannot assign');
  // review & calculation
  assert.equal((await fn(ot, 'saveCalculation', { application_id: app.id, inputs: { net_profit: 1000000, contribution_rate: 1 }, submit: true })).status, 400, 'must start review first');
  ok(await fn(ot, 'applicationAction', { application_id: app.id, action: 'start_review' }));
  const prev = ok(await fn(ot, 'previousCalculations', { company_id: cid, exclude_application_id: app.id }));
  assert.ok(prev.length >= 1, 'previous years calculations available');
  const calc = ok(await fn(ot, 'saveCalculation', { application_id: app.id, inputs: { net_profit: 2000000, subsidiary_share: 200000, contribution_rate: 1, adjustments: -1000 }, submit: true }));
  assert.equal(calc.calculated_contribution, 21000);
  assert.equal(calc.is_partial, true);
  assert.equal((await fn(T.manager, 'applicationAction', { application_id: app.id, action: 'return_to_officer' })).status, 400, 'comments required');
  ok(await fn(T.manager, 'applicationAction', { application_id: app.id, action: 'return_to_officer', comments: 'Recheck subsidiary share' }));
  ok(await fn(ot, 'saveCalculation', { application_id: app.id, inputs: { net_profit: 2000000, subsidiary_share: 100000, contribution_rate: 1, adjustments: 0 }, submit: true }));
  assert.equal((await fn(ot, 'applicationAction', { application_id: app.id, action: 'approve' })).status, 403, 'officer cannot approve');
  const approved = ok(await fn(T.manager, 'applicationAction', { application_id: app.id, action: 'approve', comments: 'OK' }));
  assert.equal(approved.status, 'accounts_processing');
  assert.equal(approved.contribution_due, 21000);
  assert.ok((await list(T.accounts, 'Notification', { category: 'accounts' })).some((n) => n.title.includes(submitted.application_reference)), 'accounts notified');
  assert.equal((await list(T.manager, 'CalculationVersion', { application_id: app.id })).length, 2, 'calculation versions kept');
  // payments: partial cheque then rejection then gateway
  assert.equal((await fn(T.rep3, 'recordPayment', { company_id: cid, application_id: app.id, payment_method: 'cheque', payment_amount: 5000 })).status, 400, 'evidence mandatory');
  const p1 = ok(await fn(T.rep3, 'recordPayment', { company_id: cid, application_id: app.id, payment_method: 'cheque', payment_amount: 6000, cheque_number: '123', payment_evidence_attachment: await upload(T.rep3) }));
  assert.match(p1.payment_reference, /^PAY-/);
  assert.equal(p1.payment_status, 'pending');
  ok(await fn(T.accounts, 'verifyPayment', { payment_id: p1.id, decision: 'verified' }));
  let bal = ok(await fn(T.accounts, 'companyBalances', { company_id: cid }));
  let row = bal.rows.find((x) => x.application_id === app.id);
  assert.equal(row.paid, 6000);
  assert.equal(row.remaining, 15000);
  r = await fn(T.accounts, 'applicationAction', { application_id: app.id, action: 'complete' });
  assert.equal(r.status, 400, 'cannot complete without voucher/with balance');
  const p2 = ok(await fn(T.rep3, 'recordPayment', { company_id: cid, application_id: app.id, payment_method: 'bank_transfer', payment_amount: 100, payment_evidence_attachment: await upload(T.rep3) }));
  assert.equal((await fn(T.accounts, 'verifyPayment', { payment_id: p2.id, decision: 'rejected' })).status, 400, 'reason required');
  ok(await fn(T.accounts, 'verifyPayment', { payment_id: p2.id, decision: 'rejected', notes: 'Slip unreadable' }));
  const pg = ok(await fn(T.rep3, 'startGatewayPayment', { application_id: app.id, amount: 15000 }));
  assert.match(pg.checkout_url, /^\/pay\/checkout\//);
  const tx = ok(await fn(T.rep3, 'completeGatewayPayment', { transaction_id: pg.transaction_id, outcome: 'completed' }));
  assert.equal(tx.status, 'completed');
  assert.equal((await fn(T.rep3, 'completeGatewayPayment', { transaction_id: pg.transaction_id, outcome: 'completed' })).status, 400, 'no double capture');
  const pgPayment = ok(await call(T.rep3, 'GET', `/api/entities/Payment/${pg.payment_id}`));
  assert.equal(pgPayment.payment_status, 'verified');
  assert.ok(pgPayment.transaction_reference);
  bal = ok(await fn(T.accounts, 'companyBalances', { company_id: cid }));
  row = bal.rows.find((x) => x.application_id === app.id);
  assert.equal(row.remaining, 0);
  // voucher & complete
  const rv = ok(await fn(T.accounts, 'issueDocument', { kind: 'voucher', company_id: cid, application_id: app.id, related_payment_id: pg.payment_id }));
  assert.ok(!rv.attachment, 'no uploaded copy: the signed PDF is generated');
  assert.match(rv.voucher_number, /^RV-/);
  assert.equal(rv.uploaded_by, 'Hamad Al-Azmi');
  assert.ok((await list(T.rep3, 'ReceiptVoucher')).some((v) => v.id === rv.id), 'company sees voucher');
  assert.equal((await call(T.accounts, 'GET', `/api/applications/${app.id}/archive.zip`, undefined, true)).status, 400, 'archive only when completed');
  const done = ok(await fn(T.accounts, 'applicationAction', { application_id: app.id, action: 'complete' }));
  assert.equal(done.status, 'completed');
  const zip = await call(T.manager, 'GET', `/api/applications/${app.id}/archive.zip`, undefined, true);
  assert.equal(zip.status, 200);
  const buf = Buffer.from(await zip.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const names = buf.toString('latin1');
  for (const n of ['01_Cover_Summary', '02_Submission_Confirmation', '03_Financial_Statements', '06_Internal_Calculation_Sheet', '07_Payment_Evidence', '08_Receipt_Vouchers']) assert.ok(names.includes(n), `zip contains ${n}`);
  assert.ok(names.indexOf('03_Financial_Statements') < names.indexOf('06_Internal_Calculation_Sheet'), 'ordered');
  assert.equal((await call(T.rep3, 'GET', `/api/applications/${app.id}/archive.zip`, undefined, true)).status, 403, 'archive internal only');
  const history = await list(T.manager, 'ApprovalHistory', { application_id: app.id });
  for (const a of ['submit', 'assign', 'reassign', 'start_review', 'submit_calculation', 'return_for_correction', 'approve', 'forward_to_accounts', 'complete']) assert.ok(history.some((h) => h.action === a), `history has ${a}`);
  assert.ok(history.every((h) => h.action_date && h.action_by), 'timestamped and attributable');
});

test('FR-06 profile change requests are recorded; locked profile blocks direct edits', async () => {
  const me = ok(await call(T.rep1, 'GET', '/api/auth/me'));
  const c = ok(await call(T.rep1, 'GET', `/api/entities/Company/${me.company_id}`));
  assert.equal(c.profile_locked, true);
  assert.equal((await call(T.rep1, 'PATCH', `/api/entities/Company/${c.id}`, { telephone: '1' })).status, 403);
  ok(await fn(T.rep1, 'applyProfileChanges', { company_id: c.id, changes: { telephone: '+965 2555 0000' }, application_reference: 'APP-X', reason: 'Updated during application' }));
  assert.equal((await fn(T.rep1, 'applyProfileChanges', { company_id: c.id, changes: { cofs_file_number: 'X' } })).status, 400, 'COFS internal only');
  ok(await fn(T.officer1, 'applyProfileChanges', { company_id: c.id, changes: { cofs_file_number: 'COFS-NEW-1' } }));
  const hist = await list(T.rep1, 'CompanyProfileChangeHistory', { company_id: c.id });
  assert.ok(hist.some((h) => h.field_name === 'telephone' && h.related_application_reference === 'APP-X'));
});

test('FR-11 allocation override and past dues', async () => {
  const c2 = (await list(T.admin, 'Company')).find((c) => c.commercial_registration_number === '289004');
  const apps = await list(T.admin, 'ContributionApplication', { company_id: c2.id });
  const a2023 = apps.find((a) => a.financial_year === '2023');
  const bal = ok(await fn(T.officer1, 'companyBalances', { company_id: c2.id }));
  assert.ok(bal.total_remaining > 0);
  const pay = (await list(T.admin, 'Payment', { company_id: c2.id, payment_status: 'verified' }))[0];
  assert.equal((await fn(T.accounts, 'allocatePayment', { payment_id: pay.id, allocations: [{ application_id: a2023.id, amount: 1 }] })).status, 400, 'reason required');
  assert.equal((await fn(T.accounts, 'allocatePayment', { payment_id: pay.id, allocations: [{ application_id: a2023.id, amount: pay.payment_amount + 1 }], reason: 'x' })).status, 400, 'cannot exceed amount');
  ok(await fn(T.accounts, 'allocatePayment', { payment_id: pay.id, allocations: [{ application_id: a2023.id, amount: 5000 }], reason: 'Company instruction' }));
  const after = ok(await fn(T.officer1, 'companyBalances', { company_id: c2.id }));
  assert.equal(after.rows.find((r) => r.application_id === a2023.id).paid, 5000);
  assert.equal(after.unallocated_credit, pay.payment_amount - 5000);
});

test('FR-15 threaded email: reference in subject, BCC to officer, reply matching, unmatched linking', async () => {
  const c1 = (await list(T.admin, 'Company')).find((c) => c.commercial_registration_number === '345120');
  const { thread } = ok(await fn(T.officer2, 'sendThreadMessage', { company_id: c1.id, subject: 'Missing page', body: 'Please send page 14.', to: [c1.official_email, c1.ceo_email], cc: ['cc@example.com'] }));
  assert.match(thread.thread_reference, /^THR-\d{4}-\d{6}$/);
  const mail = (await devMail(c1.official_email)).find((m) => m.subject.includes(thread.thread_reference));
  assert.ok(mail, 'email sent');
  assert.ok(mail.subject.includes(`[Ref: ${thread.thread_reference}]`));
  assert.deepEqual(mail.bcc_addresses, ['officer2@portal.local'], 'BCC to sending officer');
  assert.deepEqual(mail.to_addresses.sort(), [c1.ceo_email, c1.official_email].sort());
  // inbound webhook with reference
  assert.equal((await call(null, 'POST', '/api/email/inbound', { from: c1.official_email, subject: 'x' })).status, 401);
  const res = await fetch(`${BASE}/api/email/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-inbound-secret': 'dev-inbound-secret' }, body: JSON.stringify({ from: c1.official_email, subject: `RE: Missing page [Ref: ${thread.thread_reference}]`, text: 'Attached.' }) });
  const inbound = await res.json();
  assert.equal(inbound.matched, true);
  assert.equal(inbound.thread_id, thread.id);
  const msgs = await list(T.officer2, 'CommunicationMessage', { thread_id: thread.id });
  assert.equal(msgs.filter((m) => m.direction === 'inbound').length, 1);
  assert.equal(ok(await call(T.officer2, 'GET', `/api/entities/CommunicationThread/${thread.id}`)).status, 'replied');
  assert.ok((await list(T.officer2, 'Notification', { category: 'message' })).some((n) => n.title.includes(thread.thread_reference)), 'officer notified of reply');
  // portal reply by company
  ok(await fn(T.rep1, 'sendThreadMessage', { thread_id: thread.id, body: 'Uploaded in portal.' }));
  // unmatched + link
  const um = ok(await fn(T.officer2, 'simulateInboundEmail', { from: c1.official_email, subject: 'Question without reference', body: 'Hello' }));
  assert.equal(um.matched, false);
  ok(await fn(T.officer2, 'linkUnmatchedMessage', { message_id: um.message_id, thread_id: thread.id }));
  assert.equal((await list(T.officer2, 'CommunicationMessage', { thread_id: thread.id })).length, 4);
  // other company cannot see the thread
  assert.equal((await call(T.rep3, 'GET', `/api/entities/CommunicationThread/${thread.id}`)).status, 403);
});

test('FR-04 inquiries & company status', async () => {
  const inq = ok(await create(T.rep1, 'Inquiry', { inquiry_category: 'Clearance letter', subject: 'Eligibility?', description: 'Are we eligible?' }));
  assert.match(inq.inquiry_reference, /^INQ-/);
  assert.equal(inq.status, 'open');
  const st = ok(await fn(T.rep1, 'companyStatus', {}));
  assert.ok('clearance_eligible' in st && st.last_statement);
  ok(await fn(T.officer1, 'respondInquiry', { inquiry_id: inq.id, response: 'Yes once 2024 is completed.' }));
  assert.equal(ok(await call(T.rep1, 'GET', `/api/entities/Inquiry/${inq.id}`)).status, 'responded');
});

test('FR-19 reports, exports, encrypted PDF, anonymisation, role restriction', async () => {
  const names = ok(await call(T.manager, 'GET', '/api/reports')).map((r) => r.name);
  for (const n of ['contributions', 'pending_contributions', 'payments_by_method', 'payments', 'gateway_transactions', 'receipts_clearances', 'officer_workload', 'dues_aging', 'applications', 'email_activity']) {
    assert.ok(names.includes(n), n);
    const r = ok(await call(T.manager, 'GET', `/api/reports/${n}`));
    assert.ok(Array.isArray(r.rows), n);
  }
  const anon = ok(await call(T.manager, 'GET', '/api/reports/contributions?anonymize=true'));
  assert.ok(anon.rows.length && anon.rows.every((r) => /^Company C-\d{4}$/.test(r.company_name)), 'anonymised');
  const xlsx = await call(T.manager, 'GET', '/api/reports/payments_by_method?format=xlsx', undefined, true);
  assert.equal(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  const pdf = Buffer.from(await (await call(T.manager, 'GET', '/api/reports/dues_aging?format=pdf&password=Secret1', undefined, true)).arrayBuffer());
  assert.ok(pdf.toString('latin1').includes('/Encrypt'), 'PDF encrypted');
  const plain = Buffer.from(await (await call(T.manager, 'GET', '/api/reports/dues_aging?format=pdf', undefined, true)).arrayBuffer());
  assert.ok(!plain.toString('latin1').includes('/Encrypt'));
  assert.equal((await call(T.rep1, 'GET', '/api/reports/payments')).status, 403);
});

test('Admin user management and reminders', async () => {
  const u = ok(await fn(T.admin, 'createUser', { email: 'officer4@portal.local', full_name: 'New Officer', role: 'contributions_officer', password: 'Officer#2026' }));
  ok(await fn(T.admin, 'updateUser', { user_id: u.id, role: 'contributions_manager' }));
  assert.equal((await fn(T.manager, 'updateUser', { user_id: u.id, role: 'system_admin' })).status, 403);
  ok(await fn(T.admin, 'updateUser', { user_id: u.id, is_active: false }));
  assert.equal((await call(null, 'POST', '/api/auth/login', { email: 'officer4@portal.local', password: 'Officer#2026' })).status, 403, 'deactivated');
  const rem = ok(await fn(T.manager, 'runReminders', {}));
  assert.ok(typeof rem.sent === 'number');
});

test('Generated PDFs: access control, QR verification registry, public verify', async () => {
  const pay = (await list(T.rep1, 'Payment')).find((p) => p.payment_status === 'verified');
  const ok200 = async (t, url) => { const r = await call(t, 'GET', url, undefined, true); assert.equal(r.status, 200, url); assert.equal(r.headers.get('content-type'), 'application/pdf'); return Buffer.from(await r.arrayBuffer()); };
  const pdf = await ok200(T.rep1, `/api/payments/${pay.id}/receipt.pdf`);
  assert.ok(pdf.subarray(0, 4).toString() === '%PDF');
  assert.equal((await call(T.rep3, 'GET', `/api/payments/${pay.id}/receipt.pdf`, undefined, true)).status, 403, 'other company refused');
  const rv = (await list(T.rep1, 'ReceiptVoucher'))[0];
  await ok200(T.rep1, `/api/receipt-vouchers/${rv.id}/voucher.pdf`);
  const cl = (await list(T.rep1, 'ClearanceLetter'))[0];
  await ok200(T.rep1, `/api/clearance-letters/${cl.id}/letter.pdf`);
  assert.equal((await call(T.rep3, 'GET', `/api/clearance-letters/${cl.id}/letter.pdf`, undefined, true)).status, 403);
  const reg = await list(T.manager, 'DocumentVerification', { doc_type: 'clearance_letter', record_id: cl.id });
  assert.equal(reg.length, 1, 'verification registered once');
  await ok200(T.rep1, `/api/clearance-letters/${cl.id}/letter.pdf`);
  assert.equal((await list(T.manager, 'DocumentVerification', { doc_type: 'clearance_letter', record_id: cl.id })).length, 1, 'stable code on regeneration');
  const v = ok(await call(null, 'GET', `/api/public/verify/${reg[0].code}`));
  assert.equal(v.valid, true);
  assert.equal(v.reference, cl.clearance_reference);
  assert.equal(v.document, 'Clearance letter');
  assert.equal(ok(await call(null, 'GET', '/api/public/verify/NOTACODE')).valid, false);
});

test('Official documents: one signed version, generated by the portal', async () => {
  for (const [entity, url] of [['ReceiptVoucher', (r) => `/api/receipt-vouchers/${r.id}/voucher.pdf`], ['ClearanceLetter', (r) => `/api/clearance-letters/${r.id}/letter.pdf`]]) {
    const rec = (await list(T.rep1, entity))[0];
    assert.ok(!rec.attachment && !rec.document_attachment, `${entity} has no separate uploaded copy`);
    const r = await call(T.rep1, 'GET', url(rec), undefined, true);
    assert.equal(r.status, 200);
    const pdf = Buffer.from(await r.arrayBuffer()).toString('latin1');
    assert.match(pdf, /GreatVibes/, `${entity} carries the electronic signature`);
    assert.match(pdf, /\/Subtype \/Image/, `${entity} carries the KFAS logo / seal`);
  }
  assert.equal((await fn(T.accounts, 'setMySignature', {})).status, 404, 'signature upload removed');
});

test('Drafts are private to the company until submitted', async () => {
  const draft = (await list(T.rep1, 'ContributionApplication')).find((a) => a.status === 'draft');
  assert.ok(draft, 'seed has a draft for Gulf Horizon');
  const fs = (await list(T.rep1, 'FinancialStatement')).find((s) => s.application_id === draft.id);
  assert.ok(fs, 'company sees its draft statement');
  for (const who of ['admin', 'manager', 'officer1', 'accounts']) {
    assert.ok(!(await list(T[who], 'ContributionApplication')).some((a) => a.id === draft.id), `${who} cannot list the draft`);
    assert.equal((await call(T[who], 'GET', `/api/entities/ContributionApplication/${draft.id}`)).status, 403, `${who} cannot open the draft`);
    assert.ok(!(await list(T[who], 'FinancialStatement')).some((s) => s.application_id === draft.id), `${who} cannot see draft statements`);
    assert.ok(!(await list(T[who], 'ApplicationDocument')).some((d) => d.application_id === draft.id), `${who} cannot see draft documents`);
  }
  const rows = ok(await call(T.manager, 'GET', '/api/reports/applications')).rows;
  assert.ok(!rows.some((r) => r.status === 'draft'), 'reports exclude drafts');
});
