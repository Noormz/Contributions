// Generated documents, all on the shared KFAS theme (server/pdfkit-theme.js):
// submission confirmation, calculation sheet, payment receipt, receipt voucher,
// clearance letter, archive cover — plus the application archive ZIP.
import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import { db, getDoc } from './db.js';
import { find, setting } from './services.js';
import { applicationBalance, companyBalances } from './functions.js';
import { themedPdf, kwd, dateEn, dateTimeEn, label, amountInWords, ORG } from './pdfkit-theme.js';

const yesNo = (v) => (v ? 'Yes' : 'No');
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);
const methods = (app) => (app.payment_methods?.length ? app.payment_methods : [app.payment_method]).filter(Boolean).map(label).join(', ');
const address = (c) => [c.building && `Bldg ${c.building}`, c.floor && `Floor ${c.floor}`, c.office && `Office ${c.office}`, c.street, c.area, c.governorate, c.country].filter(Boolean).join(', ');
const ROLE_TITLES = { contributions_officer: 'Contributions Officer', contributions_manager: 'Contributions Manager', accounts_unit: 'Accounts Unit', system_admin: 'System Administrator' };
// "Job title, Unit" line under a signature, from the signer's user record.
const signerRole = (userId, fallback) => {
  const u = userId ? getDoc('User', userId) : null;
  return [u?.job_title || ROLE_TITLES[u?.role] || fallback, 'KFAS'].filter(Boolean).join(' · ');
};
const lastAction = (appId, action) => find('ApprovalHistory', { application_id: appId, action }).sort((a, b) => b.created_date.localeCompare(a.created_date))[0];

export function fileIdFromUrl(url) {
  const m = String(url || '').match(/\/api\/files\/([a-f0-9]+)/);
  return m ? m[1] : null;
}
const fileRow = (url) => {
  const id = fileIdFromUrl(url);
  return id ? db.prepare('SELECT * FROM files WHERE id = ?').get(id) : null;
};

export function applicationDocuments(app) {
  const docs = [];
  const push = (category, labelText, url, extra = {}) => {
    const f = fileRow(url);
    if (f) docs.push({ category, label: labelText, file: f, ...extra });
  };
  find('FinancialStatement', { application_id: app.id }).forEach((s) => push('financial_statement', `Financial statement ${s.financial_year} (${s.document_name})`, s.file_url));
  find('ApplicationDocument', { application_id: app.id }).forEach((d) => push(d.category, d.description || d.filename, d.file_url, { payment_method: d.payment_method }));
  find('SubsidiaryDeclaration', { application_id: app.id }).forEach((s) => push('subsidiary', `Subsidiary: ${s.subsidiary_name}`, s.supporting_document));
  find('Payment', { application_id: app.id }).forEach((p) => push('payment_evidence', `Payment ${p.payment_reference}`, p.payment_evidence_attachment));
  return docs;
}

function companyBlock(t, c) {
  t.section('Company', 'الشركة');
  t.grid([
    ['Company name (Arabic)', c.company_name_ar], ['Company name (English)', c.company_name_en],
    ['Commercial registration no.', c.commercial_registration_number], ['COFS file no.', c.cofs_file_number],
    ['Business licence no.', c.business_license_number], ['Company type', [c.company_type, c.is_wll && !String(c.company_type).includes('W.L.L') ? '(W.L.L.)' : ''].filter(Boolean).join(' ')],
    ['Business sector', c.business_sector], ['Year established', c.year_of_establishment],
    ['Capital', c.capital ? kwd(c.capital) : ''], ['Auditor', c.auditor_name],
    ['Address', address(c)], ['Official email / telephone', [c.official_email, c.telephone].filter(Boolean).join(' · ')],
    ['Chief executive', [c.ceo_name_en, c.ceo_job_title].filter(Boolean).join(', ')], ['Financial manager', [c.financial_manager_name, c.financial_manager_email].filter(Boolean).join(' · ')],
  ]);
}

// ---------------- Submission confirmation ----------------
export async function confirmationPdf(app) {
  const company = getDoc('Company', app.company_id) || {};
  const submit = lastAction(app.id, 'resubmit') || lastAction(app.id, 'submit');
  const t = await themedPdf({
    titleEn: 'Contribution Application — Submission Confirmation', titleAr: 'تأكيد تقديم طلب المساهمة',
    reference: app.application_reference, docType: 'submission_confirmation', recordId: app.id, status: app.status === 'draft' ? 'draft' : 'submitted',
    verifyInfo: { company_name: company.company_name_en, company_name_ar: company.company_name_ar, summary: `Application ${app.application_reference} for financial year ${app.financial_year}` },
  });
  t.callout(
    `This confirms that ${company.company_name_en || 'the company'} submitted contribution application ${app.application_reference} for financial year ${app.financial_year} on ${dateTimeEn(app.submitted_date)}. Quote this reference in all correspondence with the Contributions Unit.`,
    `نؤكد استلام طلب المساهمة عن السنة المالية ${app.financial_year} بالمرجع المبين أعلاه`,
  );
  t.section('Application', 'الطلب');
  t.grid([
    ['Application reference', app.application_reference], ['Financial year', app.financial_year],
    ['Submitted on', dateTimeEn(app.submitted_date)], ['Submitted by', submit?.action_by_name || app.created_by],
    ['Payment method(s)', methods(app)], ['Self-declared contribution', app.declared_amount ? kwd(app.declared_amount) : 'Not declared'],
    ['Current status', label(app.status)], ['Partial calculation (subsidiary statements pending)', yesNo(app.partial_calculation)],
  ]);
  companyBlock(t, company);

  const statements = find('FinancialStatement', { application_id: app.id }).sort((a, b) => String(b.financial_year).localeCompare(String(a.financial_year)));
  t.section('Financial statements', 'البيانات المالية');
  t.table([
    { key: 'document_name', label: 'Document', width: 0.34 }, { key: 'financial_year', label: 'Financial year', width: 0.14 },
    { key: 'period', label: 'Statement period', width: 0.3 }, { key: 'upload', label: 'Uploaded', width: 0.22 },
  ], statements.map((s) => ({ ...s, period: `${dateEn(s.statement_start_date)} – ${dateEn(s.statement_end_date)}`, upload: dateEn(s.upload_date || s.created_date) })));

  const subs = find('SubsidiaryDeclaration', { application_id: app.id });
  t.section('Subsidiary declaration', 'إقرار الشركات التابعة');
  t.table([
    { key: 'subsidiary_name', label: 'Subsidiary', width: 0.3 }, { key: 'pct', label: 'Ownership', width: 0.12, align: 'right' },
    { key: 'financial_year', label: 'Year', width: 0.1 }, { key: 'end', label: 'Statement end', width: 0.16 },
    { key: 'income_statement_page', label: 'Income stmt. page', width: 0.14 }, { key: 'complete', label: 'Statement', width: 0.18 },
  ], subs.map((s) => ({ ...s, pct: `${s.ownership_percentage}%`, end: dateEn(s.financial_statement_end_date), complete: s.statement_incomplete ? `Pending${s.statement_incomplete_reason ? ` — ${s.statement_incomplete_reason}` : ''}` : 'Provided' })), { empty: 'No subsidiaries declared.' });

  const docs = applicationDocuments(app).filter((d) => ['financial_statement', 'calculation_working', 'payment_evidence', 'additional', 'subsidiary'].includes(d.category));
  t.section('Documents received', 'المستندات المستلمة');
  t.table([
    { key: 'n', label: '#', width: 0.05 }, { key: 'cat', label: 'Category', width: 0.2 }, { key: 'label', label: 'Description', width: 0.33 },
    { key: 'name', label: 'File', width: 0.27 }, { key: 'size', label: 'Size', width: 0.15, align: 'right' },
  ], docs.map((d, i) => ({ n: i + 1, cat: label(d.category) + (d.payment_method ? ` (${label(d.payment_method)})` : ''), label: d.label, name: d.file.filename, size: size(d.file.size) })));

  t.section('Declarations', 'الإقرارات');
  t.grid([
    ['Company profile confirmed as up to date', yesNo(app.profile_confirmed)],
    ['Information declared accurate and complete', yesNo(app.acknowledgements?.accuracy)],
    ['Terms of the contribution process accepted', yesNo(app.acknowledgements?.terms)],
    ['Profile changes requested with this application', app.profile_changes && Object.keys(app.profile_changes).length ? Object.keys(app.profile_changes).map(label).join(', ') : 'None'],
  ]);
  t.section('What happens next', 'الخطوات التالية');
  t.paragraph('1. The application is assigned to a contributions officer, who reviews the statements and prepares the calculation.  2. The Contributions Manager approves the calculated contribution and you are notified of the amount due.  3. Pay by cheque, transfer, deposit or online; each payment is confirmed and a receipt voucher is issued.  4. Once fully paid, the application is completed and a clearance letter can be issued.');
  if (app.additional_comments) { t.section('Company comments', 'ملاحظات الشركة'); t.paragraph(app.additional_comments); }
  return t.done();
}

// ---------------- Internal calculation sheet ----------------
export async function calculationPdf(app, calc) {
  let inputs = {};
  try { inputs = JSON.parse(calc.financial_inputs || '{}'); } catch { /* ignore */ }
  const company = getDoc('Company', app.company_id) || {};
  const t = await themedPdf({
    titleEn: 'Internal Contribution Calculation Sheet', titleAr: 'كشف احتساب المساهمة الداخلي',
    reference: calc.calculation_reference, docType: 'calculation_sheet', recordId: calc.id, status: calc.status,
    verifyInfo: { company_name: company.company_name_en, summary: `Calculation for ${app.application_reference}` },
  });
  t.callout('Internal document — for Contributions Unit use only.', 'وثيقة داخلية — لاستخدام وحدة المساهمات فقط.', '#b45309');
  t.section('Application', 'الطلب');
  t.grid([['Application', app.application_reference], ['Company', company.company_name_en], ['الشركة', company.company_name_ar], ['Financial year', calc.financial_year], ['Assigned officer', app.assigned_officer_name], ['Partial calculation', yesNo(calc.is_partial)], ['Version', String(calc.version || 1)], ['Status', label(calc.status)]]);
  const net = Number(inputs.net_profit || 0); const sub = Number(inputs.subsidiary_share || 0); const rate = Number(inputs.contribution_rate || 0); const adj = Number(calc.adjustments || 0);
  t.section('Calculation', 'الاحتساب');
  t.table([{ key: 'k', label: 'Item', width: 0.62 }, { key: 'v', label: 'Amount', width: 0.38, align: 'right' }], [
    { k: 'Net profit for the year', v: kwd(net) },
    { k: 'Share of subsidiary profit', v: kwd(sub) },
    { k: 'Contribution base (net profit + subsidiary share)', v: kwd(net + sub) },
    { k: 'Contribution rate', v: `${rate}%` },
    { k: `Contribution before adjustments (${kwd(net + sub)} × ${rate}%)`, v: kwd(((net + sub) * rate) / 100) },
    { k: 'Adjustments', v: kwd(adj) },
    { k: 'Previous contribution (reference only)', v: kwd(calc.previous_contribution) },
  ], { totals: { k: 'Calculated contribution', v: kwd(calc.calculated_contribution) } });
  t.grid([['Calculation basis', calc.calculation_basis], ['Officer comments', calc.officer_comments], ['Manager comments', calc.manager_comments]], 1);
  const versions = find('CalculationVersion', { calculation_id: calc.id }).sort((a, b) => a.version - b.version);
  t.section('Version history', 'سجل الإصدارات');
  t.table([{ key: 'version', label: 'Version', width: 0.12 }, { key: 'amount', label: 'Calculated', width: 0.22, align: 'right' }, { key: 'changed_by', label: 'Changed by', width: 0.26 }, { key: 'when', label: 'Date', width: 0.2 }, { key: 'reason', label: 'Reason', width: 0.2 }],
    versions.map((v) => { let s = {}; try { s = JSON.parse(v.snapshot); } catch { /* ignore */ } return { ...v, amount: kwd(s.calculated_contribution), when: dateEn(v.created_date) }; }));
  const trail = find('ApprovalHistory', { application_id: app.id }).filter((h) => ['submit_calculation', 'return_for_correction', 'approve', 'reopen_calculation', 'submit_revised_calculation'].includes(h.action)).sort((a, b) => a.created_date.localeCompare(b.created_date));
  t.section('Approval trail', 'مسار الاعتماد');
  t.table([{ key: 'when', label: 'Date', width: 0.2 }, { key: 'act', label: 'Action', width: 0.25 }, { key: 'action_by_name', label: 'By', width: 0.22 }, { key: 'comments', label: 'Comments', width: 0.33 }], trail.map((h) => ({ ...h, when: dateTimeEn(h.action_date || h.created_date), act: label(h.action) })));
  const submitted = trail.filter((h) => ['submit_calculation', 'submit_revised_calculation'].includes(h.action)).pop();
  const approved = calc.status === 'approved';
  t.signature([
    { role: `Prepared by — ${signerRole(calc.reviewed_by_id, 'Contributions Officer')}`, name: calc.reviewed_by, userId: calc.reviewed_by_id, at: submitted?.action_date || submitted?.created_date, pending: !submitted },
    { role: `Approved by — ${signerRole(calc.approved_by_id, 'Contributions Manager')}`, name: calc.approved_by, userId: calc.approved_by_id, at: calc.approval_date, pending: !approved },
  ]);
  return t.done();
}

// ---------------- Payment receipt ----------------
export async function paymentReceiptPdf(p) {
  const company = getDoc('Company', p.company_id) || {};
  const allocations = find('PaymentAllocation', { payment_id: p.id });
  const tx = find('PaymentGatewayTransaction', { payment_id: p.id })[0];
  const t = await themedPdf({
    titleEn: 'Payment Receipt', titleAr: 'إيصال دفع', reference: p.payment_reference, docType: 'payment_receipt', recordId: p.id, status: p.payment_status,
    verifyInfo: { company_name: company.company_name_en, summary: `Payment ${p.payment_reference} of ${kwd(p.payment_amount)} (${p.payment_status})` },
  });
  if (p.payment_status === 'verified') {
    t.callout(`Received with thanks from ${company.company_name_en} the sum of ${kwd(p.payment_amount)} — ${amountInWords(p.payment_amount)}.`, `استلمنا من ${company.company_name_ar || company.company_name_en} مبلغ ${Number(p.payment_amount).toLocaleString('en-US')} دينار كويتي.`);
  } else if (p.payment_status === 'pending') {
    t.callout(`Payment of ${kwd(p.payment_amount)} recorded on ${dateEn(p.created_date)} and awaiting confirmation by the Accounts Unit. This receipt becomes final once the payment is confirmed.`, 'الدفعة مسجلة وبانتظار التأكيد من وحدة الحسابات.', '#b45309');
  } else {
    t.callout(`This payment was not accepted${p.internal_notes ? ` — ${p.internal_notes.split('\n').pop()}` : ''}.`, 'لم يتم قبول هذه الدفعة.', '#b91c1c');
  }
  t.section('Payment', 'الدفعة');
  t.grid([
    ['Payment reference', p.payment_reference], ['Amount', kwd(p.payment_amount)],
    ['Method', label(p.payment_method)], ['Payment date', dateEn(p.payment_date)],
    ['Cheque no. / bank', [p.cheque_number, p.bank_name].filter(Boolean).join(' · ')], ['Transfer / deposit ref.', p.transfer_reference || p.deposit_reference],
    ['Transaction reference', p.transaction_reference], ['Gateway reference', tx?.gateway_reference],
    ['Application', p.contribution_reference], ['Status', label(p.payment_status)],
    ['Confirmed by', p.verified_by], ['Confirmed on', p.verified_date ? dateTimeEn(p.verified_date) : ''],
  ]);
  companyBlock(t, company);
  const total = allocations.reduce((s, a) => s + Number(a.allocated_amount || 0), 0);
  t.section('Allocation to financial years', 'التخصيص على السنوات المالية');
  t.table([{ key: 'financial_year', label: 'Financial year', width: 0.2 }, { key: 'ref', label: 'Application', width: 0.3 }, { key: 'how', label: 'Allocation', width: 0.25 }, { key: 'amt', label: 'Amount', width: 0.25, align: 'right' }],
    allocations.map((a) => ({ ...a, ref: getDoc('ContributionApplication', a.application_id)?.application_reference, how: a.manual ? 'Manual (officer)' : 'Automatic', amt: kwd(a.allocated_amount) })),
    { empty: p.payment_status === 'verified' ? 'Not yet allocated to a financial year.' : 'Allocated once the payment is confirmed.', totals: allocations.length ? { financial_year: 'Total allocated', amt: kwd(total) } : undefined });
  return t.done();
}

// ---------------- Receipt voucher ----------------
export async function receiptVoucherPdf(v) {
  const company = getDoc('Company', v.company_id) || {};
  const payment = v.related_payment_id ? getDoc('Payment', v.related_payment_id) : null;
  const app = v.application_id ? getDoc('ContributionApplication', v.application_id) : null;
  const amount = payment ? payment.payment_amount : 0;
  const t = await themedPdf({
    titleEn: 'Receipt Voucher', titleAr: 'سند قبض', reference: v.voucher_number, docType: 'receipt_voucher', recordId: v.id, status: v.status,
    verifyInfo: { company_name: company.company_name_en, company_name_ar: company.company_name_ar, summary: `Receipt voucher ${v.voucher_number}${amount ? ` for ${kwd(amount)}` : ''}` },
  });
  t.section('Voucher', 'السند');
  t.grid([
    ['Voucher no.', v.voucher_number], ['Voucher date', dateEn(v.voucher_date)],
    ['Received from', company.company_name_en], ['استلمنا من', company.company_name_ar],
    ['Amount', amount ? kwd(amount) : 'Not linked to a payment'], ['Amount in words', amount ? amountInWords(amount) : ''],
    ['For', app ? `Contribution for financial year ${app.financial_year} (${app.application_reference})` : 'Contribution'],
    ['Payment', payment ? `${payment.payment_reference} · ${label(payment.payment_method)} · ${dateEn(payment.payment_date)}` : ''],
    ['Cheque / transfer details', payment ? [payment.cheque_number && `Cheque ${payment.cheque_number}`, payment.bank_name, payment.transfer_reference, payment.deposit_reference, payment.transaction_reference].filter(Boolean).join(' · ') : ''],
    ['Commercial registration no.', company.commercial_registration_number],
  ]);
  if (app) {
    const b = applicationBalance(app);
    t.section('Contribution balance after this receipt', 'رصيد المساهمة بعد هذا السند');
    t.table([{ key: 'k', label: 'Item', width: 0.62 }, { key: 'v', label: 'Amount', width: 0.38, align: 'right' }], [
      { k: `Contribution due — financial year ${app.financial_year}`, v: kwd(b.due) }, { k: 'Total received to date', v: kwd(b.paid) },
    ], { totals: { k: 'Remaining', v: kwd(Math.max(b.remaining, 0)) } });
  }
  const signers = [];
  if (payment?.payment_status === 'verified') {
    const auto = payment.payment_method === 'payment_gateway';
    signers.push({
      role: auto ? 'Payment confirmed by the payment gateway' : `Payment verified by — ${signerRole(payment.verified_by_id, 'Accounts Unit')}`,
      name: auto ? 'KFAS online payment gateway' : payment.verified_by, userId: payment.verified_by_id, at: payment.verified_date, automatic: auto,
    });
  }
  signers.push({ role: `Received and issued by — ${signerRole(v.uploaded_by_id, 'Accounts Unit')}`, name: v.uploaded_by, userId: v.uploaded_by_id, at: v.upload_date || v.created_date });
  t.signature(signers, { seal: true, sealDate: v.upload_date || v.created_date });
  return t.done();
}

// ---------------- Clearance letter ----------------
export async function clearanceLetterPdf(cl) {
  const company = getDoc('Company', cl.company_id) || {};
  const bal = companyBalances(cl.company_id);
  const years = bal.rows.map((r) => r.financial_year);
  const months = Number(String(cl.validity_period || setting('clearance_validity_months', '12')).match(/\d+/)?.[0] || 12);
  const from = cl.clearance_date ? new Date(cl.clearance_date) : new Date(cl.created_date);
  const until = new Date(from); until.setMonth(until.getMonth() + months);
  const t = await themedPdf({
    titleEn: 'Contribution Clearance Letter', titleAr: 'شهادة مخالصة المساهمة', reference: cl.clearance_reference, docType: 'clearance_letter', recordId: cl.id,
    status: until < new Date() ? 'expired' : cl.clearance_status,
    verifyInfo: { company_name: company.company_name_en, company_name_ar: company.company_name_ar, summary: `Clearance valid until ${dateEn(until)}` },
  });
  t.grid([['To', company.company_name_en], ['إلى', company.company_name_ar], ['Commercial registration no.', company.commercial_registration_number], ['COFS file no.', company.cofs_file_number], ['Date', dateEn(from)], ['Valid until', dateEn(until)]]);
  t.section('To whom it may concern', 'إلى من يهمه الأمر');
  t.paragraph(`The ${ORG.en} certifies that ${company.company_name_en} (Commercial Registration No. ${company.commercial_registration_number}) has fulfilled its contribution obligations to the Foundation for the financial years ${years.length ? years.join(', ') : 'on record'}, and that as of ${dateEn(from)} no contribution amounts are outstanding on the company's account.`);
  t.paragraph(`تشهد ${ORG.ar} بأن ${company.company_name_ar || company.company_name_en} قد أوفت بالتزاماتها تجاه المؤسسة عن السنوات المالية ${years.join('، ')} ولا توجد عليها مبالغ مساهمة مستحقة حتى تاريخه.`);
  t.paragraph(`This letter is issued at the company's request and is valid until ${dateEn(until)}. Its authenticity can be confirmed by scanning the QR code or visiting the verification address in the footer.`);
  t.section('Contribution record', 'سجل المساهمات');
  t.table([{ key: 'financial_year', label: 'Financial year', width: 0.18 }, { key: 'reference', label: 'Application', width: 0.3 }, { key: 'due', label: 'Contribution', width: 0.18, align: 'right', format: kwd }, { key: 'paid', label: 'Paid', width: 0.18, align: 'right', format: kwd }, { key: 'st', label: 'Status', width: 0.16 }],
    bal.rows.map((r) => ({ ...r, st: r.remaining <= 0.0005 ? 'Settled' : 'Outstanding' })));
  t.signature([{ role: `Issued by — ${signerRole(cl.uploaded_by_id, 'Contributions Unit')}`, name: cl.uploaded_by, userId: cl.uploaded_by_id, at: cl.upload_date || cl.created_date }], { seal: true, sealDate: cl.upload_date || cl.created_date });
  return t.done();
}

// ---------------- Archive cover ----------------
async function coverPdf(app) {
  const company = getDoc('Company', app.company_id) || {};
  const history = find('ApprovalHistory', { application_id: app.id }).sort((a, b) => a.created_date.localeCompare(b.created_date));
  const bal = applicationBalance(app);
  const t = await themedPdf({ titleEn: 'Application Archive — Summary and History', titleAr: 'أرشيف الطلب — الملخص والسجل', reference: app.application_reference, docType: 'archive_cover', recordId: app.id, status: app.status, verifyInfo: { company_name: company.company_name_en } });
  t.section('Summary', 'الملخص');
  t.grid([['Company', company.company_name_en], ['الشركة', company.company_name_ar], ['Financial year', app.financial_year], ['Assigned officer', app.assigned_officer_name], ['Submitted', dateTimeEn(app.submitted_date)], ['Completed', dateTimeEn(app.completed_date)], ['Contribution due', kwd(bal.due)], ['Paid', kwd(bal.paid)]]);
  t.section('Contents of this archive', 'محتويات الأرشيف');
  t.table([{ key: 'n', label: 'Folder', width: 0.2 }, { key: 'c', label: 'Content', width: 0.8 }], [
    ['01', 'This summary and full history'], ['02', 'Submission confirmation'], ['03', 'Financial statements'], ['04', 'Company calculation working'], ['05', 'Subsidiary documents'],
    ['06', 'Internal calculation sheet'], ['07', 'Payment evidence and payment receipts'], ['08', 'Receipt vouchers'], ['09', 'Clearance letter'], ['10', 'Additional documents'],
  ].map(([n, c]) => ({ n, c })));
  t.section('History', 'السجل');
  t.table([{ key: 'when', label: 'Date', width: 0.2 }, { key: 'act', label: 'Action', width: 0.2 }, { key: 'st', label: 'Status', width: 0.25 }, { key: 'action_by_name', label: 'By', width: 0.15 }, { key: 'comments', label: 'Comments', width: 0.2 }],
    history.map((h) => ({ ...h, when: dateTimeEn(h.action_date || h.created_date), act: label(h.action), st: `${label(h.previous_status)} → ${label(h.new_status)}` })));
  return t.done();
}

// ZIP in the agreed sequence: cover, confirmation, statements, calculation working,
// subsidiaries, internal calculation sheet, payment evidence, receipts, clearance.
export async function streamArchive(app, res) {
  const zip = new ZipArchive({ zlib: { level: 9 } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${app.application_reference}-archive.zip"`);
  zip.pipe(res);
  zip.append(await coverPdf(app), { name: '01_Cover_Summary_and_History.pdf' });
  zip.append(await confirmationPdf(app), { name: '02_Submission_Confirmation.pdf' });
  const docs = applicationDocuments(app);
  const add = (category, folder) => docs.filter((d) => d.category === category).forEach((d, i) => {
    if (fs.existsSync(d.file.path)) zip.append(fs.readFileSync(d.file.path), { name: `${folder}/${String(i + 1).padStart(2, '0')}_${d.file.filename}` });
  });
  add('financial_statement', '03_Financial_Statements');
  add('calculation_working', '04_Calculation_Working');
  add('subsidiary', '05_Subsidiary_Documents');
  const calc = find('ContributionCalculation', { application_id: app.id })[0];
  if (calc) zip.append(await calculationPdf(app, calc), { name: '06_Internal_Calculation_Sheet.pdf' });
  add('payment_evidence', '07_Payment_Evidence');
  for (const p of find('Payment', { application_id: app.id })) zip.append(await paymentReceiptPdf(p), { name: `07_Payment_Evidence/Receipt_${p.payment_reference}.pdf` });
  for (const v of find('ReceiptVoucher', { application_id: app.id })) zip.append(await receiptVoucherPdf(v), { name: `08_Receipt_Vouchers/${v.voucher_number}.pdf` });
  for (const c of find('ClearanceLetter', { application_id: app.id })) zip.append(await clearanceLetterPdf(c), { name: `09_Clearance_Letter/${c.clearance_reference}.pdf` });
  add('additional', '10_Additional_Documents');
  await zip.finalize();
}

export const safeName = (s) => String(s).replace(/[^\w.\-]+/g, '_');
