// Resets the local database and seeds demo data by driving the real workflow
// functions, so every record has a genuine history. Run: npm run seed
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dbFile = process.env.DB_FILE || path.join(DATA_DIR, 'portal.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
fs.rmSync(path.join(DATA_DIR, 'uploads'), { recursive: true, force: true });

const { db, insertDoc, updateDoc, getDoc, now, insertFile } = await import('./db.js');
const { createUser } = await import('./auth.js');
await import('./dataverse/index.js'); // queue seed data for Dynamics when DATAVERSE_URL is set
const { functions } = await import('./functions.js');

// Development accounts (local test data only). Password for all seeded users:
export const DEV_PASSWORD = 'Portal#2026';

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Demo attachments written as the company's own documents: letterhead, title, date and details.
function companyPdf(title, companyId, lines = []) {
  const company = companyId ? getDoc('Company', companyId) : null;
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    if (company) {
      doc.fontSize(14).fillColor('#111827').text(company.company_name_en);
      doc.fontSize(8.5).fillColor('#6b7280').text([`C.R. ${company.commercial_registration_number}`, [company.building && `Bldg ${company.building}`, company.street, company.area, 'Kuwait'].filter(Boolean).join(', '), company.telephone, company.official_email].filter(Boolean).join('  ·  '));
      doc.moveTo(56, doc.y + 6).lineTo(539, doc.y + 6).lineWidth(0.6).strokeColor('#9ca3af').stroke();
      doc.moveDown(1.6);
    }
    doc.fontSize(16).fillColor('#111827').text(title).moveDown(0.3);
    doc.fontSize(9).fillColor('#6b7280').text(`Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`).moveDown(1.2);
    doc.fillColor('#111827');
    for (const l of lines) {
      if (Array.isArray(l)) doc.fontSize(10).font('Helvetica-Bold').text(`${l[0]}: `, { continued: true }).font('Helvetica').text(String(l[1]));
      else doc.fontSize(10).font('Helvetica').text(l);
      doc.moveDown(0.5);
    }
    doc.end();
  });
}

async function file(user, name, title, companyId, lines) {
  const id = crypto.randomBytes(12).toString('hex');
  const p = path.join(UPLOAD_DIR, id);
  const buf = await companyPdf(title, companyId, lines);
  fs.writeFileSync(p, buf);
  insertFile({ id, filename: name, mime: 'application/pdf', size: buf.length, path: p, uploaded_by: user.id, company_id: companyId || '', created: now() });
  return `/api/files/${id}`;
}

const mk = (email, full_name, role, extra = {}) => createUser({ email, password: DEV_PASSWORD, full_name, role, verified: true, ...extra });

// ---------- users ----------
const admin = mk('admin@portal.local', 'Abdullah Al-Ajmi', 'system_admin', { username: 'admin', job_title: 'Portal Administrator' });
const manager = mk('manager@portal.local', 'Mariam Al-Sabah', 'contributions_manager', { username: 'manager', job_title: 'Contributions Manager' });
const officer1 = mk('officer1@portal.local', 'Khaled Al-Mutairi', 'contributions_officer', { username: 'officer1', job_title: 'Senior Contributions Officer' });
const officer2 = mk('officer2@portal.local', 'Noura Al-Enezi', 'contributions_officer', { username: 'officer2', job_title: 'Contributions Officer' });
const officer3 = mk('officer3@portal.local', 'Fahad Al-Rashidi', 'contributions_officer', { username: 'officer3', job_title: 'Contributions Officer' });
const accounts = mk('accounts@portal.local', 'Hamad Al-Azmi', 'accounts_unit', { username: 'accounts', job_title: 'Senior Accountant' });

// ---------- settings, lookups, templates, FAQ ----------
const settings = [
  ['currency', 'default_currency', 'KWD', 'Default currency'], ['currency', 'enabled_currencies', 'KWD', 'Enabled currencies'],
  ['currency', 'currency_symbol_position', 'after', 'Currency symbol position'], ['currency', 'amount_decimals', '3', 'Amount decimals'],
  ['currency', 'exchange_rate_usd', '3.25', 'Exchange rate'],
  ['application', 'kfas_bank_name', '', 'KFAS bank name (shown to companies for transfers and deposits once set together with the IBAN)'],
  ['application', 'kfas_account_name', 'Kuwait Foundation for the Advancement of Sciences', 'KFAS account name'],
  ['application', 'kfas_account_number', '', 'KFAS account number'],
  ['application', 'kfas_iban', '', 'KFAS IBAN'],
  ['application', 'default_contribution_rate', '1', 'Default contribution rate (%)'],
  ['application', 'auto_assignment_enabled', 'true', 'Automatically assign submitted applications to the least-loaded officer'],
  ['application', 'pending_review_reminder_days', '3', 'Days before officers are reminded of pending reviews'],
  ['application', 'clearance_validity_months', '12', 'Clearance letter validity (months)'],
  ['application', 'payment_gateway_provider', 'Simulated (test mode)', 'Payment gateway provider'],
  ['application', 'ai_daily_limit', '60', 'AI assistant questions per user per day (0 switches the assistant off)'],
];
settings.forEach(([group, k, v, desc]) => insertDoc('SystemSettings', { setting_group: group, setting_key: k, setting_value: v, description: desc }, admin));

const lookups = {
  business_sector: [['Banking', 'البنوك'], ['Investment', 'الاستثمار'], ['Insurance', 'التأمين'], ['Real Estate', 'العقار'], ['Industrial', 'الصناعة'], ['Telecommunications', 'الاتصالات'], ['Services', 'الخدمات'], ['Oil & Gas', 'النفط والغاز']],
  company_type: [['Kuwaiti Shareholding Company (Public)', 'شركة مساهمة كويتية عامة'], ['Kuwaiti Shareholding Company (Closed)', 'شركة مساهمة كويتية مقفلة'], ['W.L.L.', 'ذات مسؤولية محدودة']],
  governorate: [['Capital', 'العاصمة'], ['Hawalli', 'حولي'], ['Farwaniya', 'الفروانية'], ['Ahmadi', 'الأحمدي'], ['Jahra', 'الجهراء'], ['Mubarak Al-Kabeer', 'مبارك الكبير']],
  inquiry_category: [['Financial statement submission', 'تقديم البيانات المالية'], ['Pending contribution', 'مساهمة معلقة'], ['Clearance letter', 'شهادة مخالصة'], ['Payment', 'الدفع'], ['Other', 'أخرى']],
};
Object.entries(lookups).forEach(([category, vals]) => vals.forEach(([en, ar], i) => insertDoc('LookupValue', { category, value_en: en, value_ar: ar, code: en.toLowerCase().replace(/[^a-z]+/g, '_'), sort_order: i, is_active: true }, admin)));

const T = (key, name, subject_en, body_en, subject_ar, body_ar, category = 'notification') => insertDoc('EmailTemplate', { template_key: key, template_name: name, subject_en, body_en, subject_ar, body_ar, category, is_active: true }, admin);
T('registration_success', 'Registration received', 'Your company registration was received', 'Dear {{name}},\n\nThank you for registering {{company}} on the Contributions E-Portal. You can now submit contribution applications.\n\n{{link}}', 'تم استلام تسجيل شركتك', 'عزيزي {{name}}،\n\nشكراً لتسجيل {{company}} في بوابة المساهمات.\n\n{{link}}');
T('unit_new_registration', 'New registration (unit)', 'New company registration: {{company}}', 'A new company has registered: {{company}}.\n\n{{link}}', 'تسجيل شركة جديدة: {{company}}', 'تم تسجيل شركة جديدة: {{company}}\n\n{{link}}');
T('unit_new_inquiry', 'New inquiry (unit)', 'New inquiry {{reference}}: {{subject}}', 'A new inquiry was raised by {{company}}: {{subject}}\n\n{{link}}', 'استفسار جديد {{reference}}', 'استفسار جديد من {{company}}: {{subject}}\n\n{{link}}');
T('application_submitted', 'Application submitted', 'Application {{reference}} submitted', 'Dear {{name}},\n\nYour contribution application {{reference}} for {{company}} has been submitted successfully. You can print the confirmation here:\n{{link}}', 'تم تقديم الطلب {{reference}}', 'عزيزي {{name}}،\n\nتم تقديم طلب المساهمة {{reference}} بنجاح.\n{{link}}');
T('application_resubmitted', 'Application resubmitted (officer)', 'Application {{reference}} resubmitted', 'The company has resubmitted application {{reference}}.\n\n{{link}}', 'إعادة تقديم الطلب {{reference}}', 'أعادت الشركة تقديم الطلب {{reference}}\n\n{{link}}');
T('officer_assignment', 'Officer assignment', 'Application {{reference}} assigned to you', 'Dear {{name}},\n\nApplication {{reference}} ({{company}}) has been assigned to you.\n\n{{link}}', 'تم إسناد الطلب {{reference}} إليك', 'تم إسناد الطلب {{reference}} ({{company}}) إليك.\n\n{{link}}');
T('application_returned', 'Application returned', 'Application {{reference}} returned for changes', 'Dear {{name}},\n\nYour application {{reference}} was returned with the following comments:\n\n{{comments}}\n\nPlease update and resubmit: {{link}}', 'إعادة الطلب {{reference}} للتعديل', 'تمت إعادة طلبكم {{reference}} مع الملاحظات التالية:\n\n{{comments}}\n\n{{link}}');
T('approval_request', 'Approval request (manager)', 'Calculation for {{reference}} awaiting your approval', 'A calculation of {{amount}} KWD for {{reference}} is awaiting your approval.\n\n{{link}}', 'حساب بانتظار اعتمادك {{reference}}', 'حساب بقيمة {{amount}} د.ك للطلب {{reference}} بانتظار اعتمادك.\n\n{{link}}');
T('calculation_returned', 'Calculation returned (officer)', 'Calculation for {{reference}} returned for correction', 'The manager returned the calculation for {{reference}}:\n\n{{comments}}\n\n{{link}}', 'إعادة الحساب {{reference}} للتصحيح', '{{comments}}\n\n{{link}}');
T('application_approved', 'Contribution approved', 'Contribution for {{reference}} approved', 'Dear {{name}},\n\nThe contribution for application {{reference}} has been approved at {{amount}} KWD. Please arrange payment.\n\n{{link}}', 'اعتماد المساهمة {{reference}}', 'تم اعتماد المساهمة للطلب {{reference}} بمبلغ {{amount}} د.ك.\n\n{{link}}');
T('accounts_ready', 'Ready for receipt voucher (accounts)', 'Approved: {{reference}} ready for receipt voucher processing', 'Application {{reference}} ({{company}}) has been approved and forwarded to the Accounts Unit.\n\n{{link}}', 'طلب معتمد {{reference}}', 'تم اعتماد الطلب {{reference}} وإحالته لوحدة الحسابات.\n\n{{link}}');
T('application_completed', 'Application completed', 'Application {{reference}} completed', 'Dear {{name}},\n\nApplication {{reference}} is now completed.\n\n{{link}}', 'اكتمال الطلب {{reference}}', 'اكتمل الطلب {{reference}}.\n\n{{link}}');
T('payment_verified', 'Payment verified', 'Payment {{reference}} confirmed', 'Dear {{name}},\n\nYour payment {{reference}} of {{amount}} KWD has been confirmed.\n\n{{link}}', 'تأكيد الدفعة {{reference}}', 'تم تأكيد دفعتكم {{reference}} بمبلغ {{amount}} د.ك.\n\n{{link}}');
T('payment_rejected', 'Payment rejected', 'Payment {{reference}} rejected', 'Dear {{name}},\n\nYour payment {{reference}} was rejected: {{reason}}\n\n{{link}}', 'رفض الدفعة {{reference}}', 'تم رفض الدفعة {{reference}}: {{reason}}\n\n{{link}}');
T('receipt_issued', 'Receipt voucher issued', 'Receipt voucher {{reference}} issued', 'Dear {{name}},\n\nReceipt voucher {{reference}} is available in your portal.\n\n{{link}}', 'إصدار سند القبض {{reference}}', 'سند القبض {{reference}} متاح في البوابة.\n\n{{link}}');
T('clearance_issued', 'Clearance letter issued', 'Clearance letter {{reference}} issued', 'Dear {{name}},\n\nClearance letter {{reference}} is available in your portal.\n\n{{link}}', 'إصدار شهادة المخالصة {{reference}}', 'شهادة المخالصة {{reference}} متاحة في البوابة.\n\n{{link}}');
T('company_reply', 'Company reply (officer)', 'Company reply on {{reference}}', '{{company}} replied on thread {{reference}}.\n\n{{link}}', 'رد الشركة {{reference}}', 'ردت {{company}} على {{reference}}.\n\n{{link}}');
T('inquiry_response', 'Inquiry response', 'Response to your inquiry {{reference}}', 'Dear {{name}},\n\n{{response}}\n\n{{link}}', 'رد على استفساركم {{reference}}', '{{response}}\n\n{{link}}');
T('pending_review_reminder', 'Pending review reminder', 'Reminder: {{reference}} pending review', '{{reference}} has been pending review for more than {{days}} days.\n\n{{link}}', 'تذكير: {{reference}} بانتظار المراجعة', '{{reference}} بانتظار المراجعة منذ أكثر من {{days}} أيام.\n\n{{link}}');
T('escalation', 'Escalation (manager)', 'Escalation: {{reference}}', '{{comments}}\n\n{{link}}', 'تصعيد: {{reference}}', '{{comments}}\n\n{{link}}');

const faqs = [
  ['Who must pay the KFAS contribution?', 'من يجب عليه دفع مساهمة المؤسسة؟', 'Kuwaiti shareholding companies contribute a percentage of their annual net profit as set by the applicable regulations.', 'تساهم الشركات المساهمة الكويتية بنسبة من صافي أرباحها السنوية وفق اللوائح المعمول بها.'],
  ['Which documents do I need to apply?', 'ما المستندات المطلوبة لتقديم الطلب؟', 'Audited financial statements for the year (with year and statement end date), subsidiary details where applicable, and supporting payment documents for each payment method used.', 'البيانات المالية المدققة للسنة، وبيانات الشركات التابعة إن وجدت، ومستندات الدفع لكل طريقة دفع.'],
  ['How do I get a clearance letter?', 'كيف أحصل على شهادة مخالصة؟', 'A clearance letter is issued once all contribution applications are completed and there is no outstanding balance. Check your eligibility above.', 'تصدر شهادة المخالصة بعد اكتمال جميع الطلبات وعدم وجود رصيد مستحق.'],
  ['Can I pay in instalments?', 'هل يمكن الدفع على دفعات؟', 'Yes. Partial payments are accepted; each payment is allocated to your outstanding financial years.', 'نعم، تقبل الدفعات الجزئية ويتم تخصيص كل دفعة للسنوات المالية المستحقة.'],
];
faqs.forEach(([qe, qa, ae, aa], i) => insertDoc('FaqEntry', { question_en: qe, question_ar: qa, answer_en: ae, answer_ar: aa, sort_order: i, is_active: true }, admin));

// ---------- companies ----------
const companiesSpec = [
  { ceo: 'Faisal Al-Mutawa', ceoAr: 'فيصل المطوع', mob: '+965 9417 5308', en: 'Gulf Horizon Investment Co.', ar: 'شركة أفق الخليج للاستثمار', cr: '345120', sector: 'Investment', email: 'finance@gulfhorizon.example', rep: 'rep1@gulfhorizon.example', repName: 'Ahmad Al-Kandari', cofs: 'COFS-10021' },
  { ceo: 'Bader Al-Kharafi', ceoAr: 'بدر الخرافي', mob: '+965 9528 6417', en: 'Al-Waha Real Estate Co.', ar: 'شركة الواحة العقارية', cr: '289004', sector: 'Real Estate', email: 'accounts@alwaha.example', rep: 'rep@alwaha.example', repName: 'Sara Al-Hajri', cofs: 'COFS-10044' },
  { ceo: 'Jassim Al-Bahar', ceoAr: 'جاسم البحر', mob: '+965 9639 7526', en: 'Kuwait National Industries Co.', ar: 'شركة الصناعات الوطنية الكويتية', cr: '110987', sector: 'Industrial', email: 'cfo@kni.example', rep: 'rep@kni.example', repName: 'Yousef Al-Shammari', cofs: 'COFS-10002' },
  { ceo: 'Reem Al-Saleh', ceoAr: 'ريم الصالح', mob: '+965 97410 8635', en: 'Bayan Telecom Co.', ar: 'شركة بيان للاتصالات', cr: '402331', sector: 'Telecommunications', email: 'finance@bayantel.example', rep: 'rep@bayantel.example', repName: 'Dana Al-Ali', cofs: 'COFS-10107' },
  { ceo: 'Talal Al-Ghanim', ceoAr: 'طلال الغانم', mob: '+965 98511 9744', en: 'Sahel Insurance Co.', ar: 'شركة الساحل للتأمين', cr: '377654', sector: 'Insurance', email: 'finance@sahel.example', rep: 'rep@sahel.example', repName: 'Omar Al-Fadhli', cofs: 'COFS-10088' },
  { ceo: 'Nasser Al-Roumi', ceoAr: 'ناصر الرومي', mob: '+965 99612 10853', en: 'Desert Pearl Services W.L.L.', ar: 'شركة لؤلؤة الصحراء للخدمات ذ.م.م', cr: '512876', sector: 'Services', email: 'office@desertpearl.example', rep: 'rep@desertpearl.example', repName: 'Hessa Al-Mutawa', cofs: '', wll: true },
];
const companies = [];
for (const s of companiesSpec) {
  const rep = mk(s.rep, s.repName, 'company_representative', { job_title: 'Finance Manager' });
  const c = insertDoc('Company', {
    company_name_en: s.en, company_name_ar: s.ar, commercial_registration_number: s.cr, business_license_number: `BL-${s.cr}`,
    year_of_establishment: String(1975 + companies.length * 6), company_type: s.wll ? 'W.L.L.' : 'Kuwaiti Shareholding Company (Closed)', is_wll: !!s.wll,
    business_sector: s.sector, capital: 5000000 + companies.length * 2500000, currency: 'KWD', auditor_name: ['Deloitte', 'KPMG', 'EY', 'PwC'][companies.length % 4],
    cofs_file_number: s.cofs, country: 'Kuwait', governorate: 'Capital', area: 'Sharq', street: 'Jaber Al-Mubarak St.', building: String(10 + companies.length),
    telephone: `+965 22${String(41 + companies.length * 6)} ${String(3200 + companies.length * 457)}`, official_email: s.email,
    ceo_name_en: s.ceo, ceo_name_ar: s.ceoAr, ceo_job_title: 'Chief Executive Officer', ceo_email: `ceo@${s.email.split('@')[1]}`, ceo_mobile: s.mob,
    financial_manager_name: s.repName, financial_manager_position: 'Finance Manager', financial_manager_email: s.rep, financial_manager_telephone: `+965 22${String(43 + companies.length * 7)} ${String(5100 + companies.length * 137)}`, financial_manager_mobile: `+965 6${String(5 + companies.length)}${String(2 + companies.length)}1 ${String(4400 + companies.length * 211)}`,
    primary_user_id: rep.id, authorized_users: [rep.id], status: 'active', profile_locked: false,
  }, rep);
  updateDoc('User', rep.id, { company_id: c.id });
  companies.push({ company: c, rep: getDoc('User', rep.id) });
}
// Second user for the first company (FR-02 multiple accounts)
const rep1b = mk('rep2@gulfhorizon.example', 'Lulwa Al-Sabah', 'company_representative', { company_id: companies[0].company.id, job_title: 'Accountant' });
updateDoc('Company', companies[0].company.id, { authorized_users: [companies[0].rep.id, rep1b.id] });
// Parent / subsidiary
insertDoc('CompanyRelationship', { parent_company_id: companies[0].company.id, parent_company_name: companies[0].company.company_name_en, subsidiary_company_id: companies[1].company.id, subsidiary_company_name: companies[1].company.company_name_en, company_id: companies[0].company.id, ownership_percentage: 60, relationship_start_date: '2018-01-01' }, admin);

// ---------- applications through the real workflow ----------
async function draftApp({ company, rep }, year, opts = {}) {
  const app = insertDoc('ContributionApplication', {
    company_id: company.id, company_name: company.company_name_en, financial_year: year, status: 'draft', profile_confirmed: true,
    payment_methods: opts.methods || ['bank_transfer'], payment_method: (opts.methods || ['bank_transfer'])[0], declared_amount: opts.declared || 0,
    acknowledgements: { accuracy: true, terms: true }, additional_comments: opts.comments || '', partial_calculation: !!opts.partial, current_step: 1,
  }, rep);
  insertDoc('FinancialStatement', { company_id: company.id, application_id: app.id, financial_year: year, statement_start_date: `${year}-01-01`, statement_end_date: `${year}-12-31`, document_name: `Audited Financial Statements ${year}`, document_type: 'Audited', file_url: await file(rep, `FS-${year}.pdf`, `Audited Financial Statements — Year ended 31 December ${year}`, company.id, [['Reporting period', `1 January ${year} to 31 December ${year}`], ['Basis of preparation', 'International Financial Reporting Standards (IFRS)'], ['Independent auditor', company.auditor_name], ['Contents', 'Independent auditor\'s report; statement of financial position; statement of profit or loss; statement of changes in equity; statement of cash flows; notes to the financial statements'], ['Currency', 'Kuwaiti Dinar (KWD)']]), upload_date: now(), review_status: 'pending' }, rep);
  for (const m of (opts.methods || ['bank_transfer']).filter((x) => x !== 'payment_gateway')) {
    insertDoc('ApplicationDocument', { application_id: app.id, company_id: company.id, category: 'payment_evidence', payment_method: m, description: `${m.replace('_', ' ')} slip`, filename: `${m}-slip.pdf`, file_url: await file(rep, `${m}-slip.pdf`, m === 'cheque' ? 'Cheque Copy' : m === 'bank_deposit' ? 'Bank Deposit Slip' : 'Bank Transfer Confirmation', company.id, [['Beneficiary', 'Kuwait Foundation for the Advancement of Sciences'], ['Bank', 'National Bank of Kuwait'], ['Purpose', `KFAS contribution — financial year ${year}`], ['Authorised by', rep.full_name]]), uploaded_by_name: rep.full_name, upload_date: now() }, rep);
  }
  insertDoc('ApplicationDocument', { application_id: app.id, company_id: company.id, category: 'calculation_working', description: 'Company calculation working', filename: `calc-working-${year}.pdf`, file_url: await file(rep, `calc-working-${year}.pdf`, `KFAS Contribution Calculation — Financial Year ${year}`, company.id, [['Basis', 'Net profit for the year after statutory deductions, per the audited financial statements'], ['Contribution rate', '1% of the basis'], ['Subsidiaries', opts.subsidiary ? `${opts.subsidiary} (60% owned), share of profit included` : 'None'], ['Prepared by', `${rep.full_name}, Finance Manager`]]), uploaded_by_name: rep.full_name, upload_date: now() }, rep);
  if (opts.subsidiary) insertDoc('SubsidiaryDeclaration', { application_id: app.id, company_id: company.id, subsidiary_name: opts.subsidiary, ownership_percentage: 60, financial_year: year, financial_statement_end_date: `${year}-12-31`, income_statement_page: '14', statement_incomplete: !!opts.partial, statement_incomplete_reason: opts.partial ? 'Subsidiary audit not finalised' : '' }, rep);
  return app;
}
const submit = (ctx, app) => functions.submitApplication(ctx.rep, { application_id: app.id });
const calc = (who, app, net, rate = 1, extra = {}) => functions.saveCalculation(who, { application_id: app.id, inputs: { net_profit: net, contribution_rate: rate, adjustments: 0, previous_contribution: 0, outstanding_balance: 0, calculation_basis: 'Net profit after statutory deductions', officer_comments: 'Verified against audited statements', ...extra }, submit: true });
const act = (who, app, action, comments = '') => functions.applicationAction(who, { application_id: app.id, action, comments });
const officerOf = (app) => getDoc('User', getDoc('ContributionApplication', app.id).assigned_officer_id);

async function payAndVerify(ctx, app, amount, method = 'bank_transfer', verify = true) {
  const p = await functions.recordPayment(ctx.rep, { company_id: ctx.company.id, application_id: app.id, payment_method: method, payment_amount: amount, payment_date: now().slice(0, 10), bank_name: 'NBK', transfer_reference: `TRF${Math.floor(Math.random() * 1e6)}`, cheque_number: method === 'cheque' ? '004512' : '', payment_evidence_attachment: await file(ctx.rep, `${method}-receipt.pdf`, method === 'cheque' ? 'Cheque Copy' : 'Bank Transfer Confirmation', ctx.company.id, [['Amount', `${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 3 })} KWD`], ['Beneficiary', 'Kuwait Foundation for the Advancement of Sciences'], ['Bank', 'National Bank of Kuwait'], ['Purpose', `KFAS contribution — application ${getDoc('ContributionApplication', app.id).application_reference}`]]) });
  if (verify) await functions.verifyPayment(accounts, { payment_id: p.id, decision: 'verified' });
  return p;
}

// Company 1 — 2023 completed (full lifecycle), 2024 under review, 2025 draft
const c1 = companies[0];
let a = await draftApp(c1, '2023', { subsidiary: 'Al-Waha Real Estate Co.' });
await submit(c1, a); await act(officerOf(a), a, 'start_review'); await calc(officerOf(a), a, 4200000, 1);
await act(manager, a, 'approve', 'Approved as calculated.');
const pay1 = await payAndVerify(c1, a, 42000);
await functions.issueDocument(accounts, { kind: 'voucher', company_id: c1.company.id, application_id: a.id, related_payment_id: pay1.id });
await act(accounts, a, 'complete', 'Fully paid.');
await functions.issueDocument(accounts, { kind: 'clearance', company_id: c1.company.id, application_id: a.id });
a = await draftApp(c1, '2024', { methods: ['bank_transfer', 'cheque'], subsidiary: 'Al-Waha Real Estate Co.', partial: true });
await submit(c1, a); await act(officerOf(a), a, 'start_review');
await draftApp(c1, '2025');

// Company 2 — 2024 pending manager approval; 2023 approved with partial payment (past due)
const c2 = companies[1];
a = await draftApp(c2, '2023');
await submit(c2, a); await act(officerOf(a), a, 'start_review'); await calc(officerOf(a), a, 1850000, 1); await act(manager, a, 'approve');
await payAndVerify(c2, a, 8000);
a = await draftApp(c2, '2024', { methods: ['payment_gateway'] });
await submit(c2, a); await act(officerOf(a), a, 'start_review'); await calc(officerOf(a), a, 2100000, 1);

// Company 3 — 2024 returned to company; pending payment awaiting verification on 2023
const c3 = companies[2];
a = await draftApp(c3, '2023', { methods: ['cheque'] });
await submit(c3, a); await act(officerOf(a), a, 'start_review'); await calc(officerOf(a), a, 9600000, 1); await act(manager, a, 'approve');
await payAndVerify(c3, a, 50000, 'cheque', false);
a = await draftApp(c3, '2024');
await submit(c3, a); await act(officerOf(a), a, 'return_to_company', 'Please upload the signed auditor report page and confirm the subsidiary ownership.');

// Company 4 — submitted (auto-assigned); Company 5 — calculation returned by manager
const c4 = companies[3];
a = await draftApp(c4, '2024'); await submit(c4, a);
const c5 = companies[4];
a = await draftApp(c5, '2024');
await submit(c5, a); await act(officerOf(a), a, 'start_review'); await calc(officerOf(a), a, 760000, 1); await act(manager, a, 'return_to_officer', 'Please apply the 2024 adjustment for the disposed subsidiary.');

// ---------- communications, inquiries ----------
const t1 = await functions.sendThreadMessage(officer1, { company_id: c1.company.id, subject: 'Clarification on 2024 subsidiary statements', body: 'Dear team,\n\nPlease confirm when the audited statements for Al-Waha Real Estate will be available so we can finalise the 2024 calculation.\n\nRegards', to: [c1.company.official_email] });
await functions.sendThreadMessage(c1.rep, { thread_id: t1.thread.id, body: 'We expect the audited statements by the end of next month and will upload them to the portal.' });
await functions.sendThreadMessage(officer2, { company_id: c3.company.id, subject: 'Cheque payment confirmation', body: 'We have received your cheque and it is pending clearance.', to: [c3.company.official_email] });
const inq = await functions.nextReference(admin, { prefix: 'INQ' });
insertDoc('Inquiry', { inquiry_reference: inq.reference, company_id: c4.company.id, company_name: c4.company.company_name_en, inquiry_category: 'Clearance letter', subject: 'Clearance letter for tender submission', description: 'We need a clearance letter for a government tender. What is required?', submission_date: now(), status: 'open' }, c4.rep);
const inq2 = insertDoc('Inquiry', { inquiry_reference: (await functions.nextReference(admin, { prefix: 'INQ' })).reference, company_id: c2.company.id, company_name: c2.company.company_name_en, inquiry_category: 'Pending contribution', subject: 'Remaining balance for 2023', description: 'Could you confirm our remaining balance for 2023?', submission_date: now(), status: 'open' }, c2.rep);
await functions.respondInquiry(officer1, { inquiry_id: inq2.id, response: 'Your remaining balance for 2023 is shown in the payment section. Please contact us for instalment options.' });

console.log('Seed complete.');
console.log(`Users: admin@portal.local, manager@portal.local, officer1..3@portal.local, accounts@portal.local, rep1@gulfhorizon.example (+ other company reps). Password: see DEV_PASSWORD in server/seed.js`);
process.exit(0);
