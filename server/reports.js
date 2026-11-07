// Report datasets and their Excel/PDF exports.
import ExcelJS from 'exceljs';
import { allDocs } from './db.js';
import { allCompanyBalances } from './functions.js';
import { usersByRole } from './services.js';
import { themedPdf, dateTimeEn, label } from './pdfkit-theme.js';

const inRange = (d, f) => {
  if (!d) return !f.from && !f.to;
  const v = String(d).slice(0, 10);
  return (!f.from || v >= f.from) && (!f.to || v <= f.to);
};
const money = (n) => Math.round(Number(n || 0) * 1000) / 1000;

function companyFilter(f) {
  return (row) => (!f.company_id || row.company_id === f.company_id);
}

// Anonymised names are stable per company (C-0001…) so cross-report joins still work.
function anonymizer(enabled) {
  if (!enabled) return (name) => name;
  const ids = {};
  allDocs('Company').sort((a, b) => a.created_date.localeCompare(b.created_date)).forEach((c, i) => {
    ids[c.company_name_en] = `Company C-${String(i + 1).padStart(4, '0')}`;
    if (c.company_name_ar) ids[c.company_name_ar] = ids[c.company_name_en];
  });
  return (name) => ids[name] || (name ? 'Company (redacted)' : name);
}

export const REPORTS = {
  contributions: {
    title: 'Contributions Summary by Company and Year',
    columns: [['company_name', 'Company'], ['financial_year', 'Financial Year'], ['reference', 'Application'], ['status', 'Status'], ['due', 'Contribution Due (KWD)'], ['paid', 'Paid (KWD)'], ['remaining', 'Remaining (KWD)']],
    rows(f) {
      const out = [];
      const bal = allCompanyBalances();
      allDocs('Company').filter((c) => !f.company_id || c.id === f.company_id).forEach((c) => {
        (bal[c.id]?.rows || []).forEach((r) => {
          if (f.financial_year && r.financial_year !== f.financial_year) return;
          out.push({ company_id: c.id, company_name: c.company_name_en, ...r });
        });
      });
      return out;
    },
    totals: ['due', 'paid', 'remaining'],
  },
  pending_contributions: {
    title: 'Pending Contributions (applications not yet completed)',
    columns: [['application_reference', 'Application'], ['company_name', 'Company'], ['financial_year', 'Financial Year'], ['status', 'Status'], ['assigned_officer_name', 'Officer'], ['submitted_date', 'Submitted']],
    rows(f) {
      return allDocs('ContributionApplication').filter((a) => !['completed', 'draft'].includes(a.status))
        .filter(companyFilter(f)).filter((a) => !f.financial_year || a.financial_year === f.financial_year)
        .filter((a) => !f.officer_id || a.assigned_officer_id === f.officer_id)
        .map((a) => ({ ...a, submitted_date: (a.submitted_date || '').slice(0, 10) }));
    },
  },
  payments_by_method: {
    title: 'Payments by Method per Month (verified)',
    columns: [['month', 'Month'], ['cheque', 'Cheque'], ['bank_transfer', 'Bank Transfer'], ['bank_deposit', 'Bank Deposit'], ['payment_gateway', 'Payment Gateway'], ['total', 'Total (KWD)'], ['cumulative', 'Cumulative (KWD)']],
    rows(f) {
      const by = {};
      allDocs('Payment').filter((p) => p.payment_status === 'verified').filter(companyFilter(f)).filter((p) => inRange(p.payment_date, f))
        .forEach((p) => {
          const m = String(p.payment_date || p.created_date).slice(0, 7);
          by[m] = by[m] || { month: m, cheque: 0, bank_transfer: 0, bank_deposit: 0, payment_gateway: 0, total: 0 };
          by[m][p.payment_method] = money(by[m][p.payment_method] + Number(p.payment_amount || 0));
          by[m].total = money(by[m].total + Number(p.payment_amount || 0));
        });
      let cum = 0;
      return Object.values(by).sort((a, b) => a.month.localeCompare(b.month)).map((r) => { cum = money(cum + r.total); return { ...r, cumulative: cum }; });
    },
    totals: ['cheque', 'bank_transfer', 'bank_deposit', 'payment_gateway', 'total'],
  },
  payments: {
    title: 'Payments Register',
    columns: [['payment_reference', 'Reference'], ['company_name', 'Company'], ['payment_method', 'Method'], ['payment_date', 'Date'], ['payment_amount', 'Amount (KWD)'], ['payment_status', 'Status'], ['transaction_reference', 'Transaction Ref.']],
    rows: (f) => allDocs('Payment').filter(companyFilter(f)).filter((p) => inRange(p.payment_date, f)).filter((p) => !f.status || p.payment_status === f.status),
    totals: ['payment_amount'],
  },
  gateway_transactions: {
    title: 'Payment Gateway Transactions',
    columns: [['gateway_reference', 'Gateway Ref.'], ['company_name', 'Company'], ['amount', 'Amount (KWD)'], ['status', 'Status'], ['initiated_date', 'Initiated'], ['completed_date', 'Completed']],
    rows(f) {
      const names = Object.fromEntries(allDocs('Company').map((c) => [c.id, c.company_name_en]));
      return allDocs('PaymentGatewayTransaction').filter(companyFilter(f)).filter((t) => inRange(t.initiated_date, f))
        .map((t) => ({ ...t, company_name: names[t.company_id] || '', initiated_date: (t.initiated_date || '').slice(0, 16).replace('T', ' '), completed_date: (t.completed_date || '').slice(0, 16).replace('T', ' ') }));
    },
    totals: ['amount'],
  },
  receipts_clearances: {
    title: 'Receipt Voucher and Clearance Status',
    columns: [['type', 'Type'], ['reference', 'Reference'], ['company_name', 'Company'], ['application_reference', 'Application'], ['date', 'Date'], ['status', 'Status'], ['uploaded_by', 'Uploaded By']],
    rows(f) {
      const v = allDocs('ReceiptVoucher').map((r) => ({ ...r, type: 'Receipt Voucher', reference: r.voucher_number, date: r.voucher_date }));
      const c = allDocs('ClearanceLetter').map((r) => ({ ...r, type: 'Clearance Letter', reference: r.clearance_reference, date: r.clearance_date, status: r.clearance_status }));
      return [...v, ...c].filter(companyFilter(f)).filter((r) => inRange(r.date, f));
    },
  },
  officer_workload: {
    title: 'Officer Workload and Workflow Status',
    columns: [['officer', 'Officer'], ['assigned', 'Assigned'], ['under_review', 'Under Review'], ['pending_manager_approval', 'Pending Approval'], ['accounts_processing', 'Accounts'], ['completed', 'Completed'], ['returned', 'Returned'], ['open', 'Open Total']],
    rows(f) {
      const apps = allDocs('ContributionApplication').filter((a) => a.status !== 'draft' && inRange(a.submitted_date || a.created_date, f));
      return usersByRole('contributions_officer').filter((o) => !f.officer_id || o.id === f.officer_id).map((o) => {
        const mine = apps.filter((a) => a.assigned_officer_id === o.id);
        const c = (s) => mine.filter((a) => a.status === s).length;
        return { officer: o.full_name || o.email, assigned: c('assigned'), under_review: c('under_review'), pending_manager_approval: c('pending_manager_approval'), accounts_processing: c('accounts_processing'), completed: c('completed'), returned: c('returned'), open: mine.filter((a) => ['assigned', 'under_review', 'pending_manager_approval', 'submitted'].includes(a.status)).length };
      });
    },
    noCompany: true,
  },
  dues_aging: {
    title: 'Outstanding Dues Aging',
    columns: [['company_name', 'Company'], ['reference', 'Application'], ['financial_year', 'Financial Year'], ['approved_date', 'Approved'], ['days', 'Days Outstanding'], ['bucket', 'Aging Bucket'], ['remaining', 'Remaining (KWD)']],
    rows(f) {
      const out = [];
      const approvals = {};
      allDocs('ApprovalHistory').filter((h) => h.action === 'approve').forEach((h) => { approvals[h.application_id] = approvals[h.application_id] || h; });
      const bal = allCompanyBalances();
      allDocs('Company').filter((c) => !f.company_id || c.id === f.company_id).forEach((c) => {
        (bal[c.id]?.rows || []).filter((r) => r.remaining > 0.0005).forEach((r) => {
          const ap = approvals[r.application_id];
          const since = ap?.action_date || ap?.created_date;
          const days = since ? Math.floor((Date.now() - new Date(since)) / 86400000) : 0;
          const bucket = days <= 30 ? '0-30' : days <= 90 ? '31-90' : days <= 180 ? '91-180' : '180+';
          out.push({ company_id: c.id, company_name: c.company_name_en, ...r, approved_date: since ? since.slice(0, 10) : '', days, bucket });
        });
      });
      return out.sort((a, b) => b.days - a.days);
    },
    totals: ['remaining'],
  },
  applications: {
    title: 'Applications by Status',
    columns: [['application_reference', 'Reference'], ['company_name', 'Company'], ['financial_year', 'Financial Year'], ['status', 'Status'], ['assigned_officer_name', 'Officer'], ['submitted_date', 'Submitted'], ['partial', 'Partial Calc.']],
    rows: (f) => allDocs('ContributionApplication').filter((a) => a.status !== 'draft').filter(companyFilter(f))
      .filter((a) => !f.status || a.status === f.status).filter((a) => !f.financial_year || a.financial_year === f.financial_year)
      .filter((a) => !f.officer_id || a.assigned_officer_id === f.officer_id).filter((a) => inRange(a.submitted_date || a.created_date, f))
      .map((a) => ({ ...a, submitted_date: (a.submitted_date || '').slice(0, 10), partial: a.partial_calculation ? 'Yes' : 'No' })),
  },
  email_activity: {
    title: 'Email Communication Activity',
    columns: [['thread_reference', 'Thread Ref.'], ['company_name', 'Company'], ['application_reference', 'Application'], ['officer', 'Officer'], ['outbound', 'Sent'], ['inbound', 'Received'], ['status', 'Status'], ['last_activity', 'Last Activity']],
    rows(f) {
      const msgs = allDocs('CommunicationMessage').filter((m) => inRange(m.sent_date || m.created_date, f));
      return allDocs('CommunicationThread').filter(companyFilter(f)).filter((t) => !f.officer_id || t.assigned_officer_id === f.officer_id).map((t) => {
        const mine = msgs.filter((m) => m.thread_id === t.id);
        return { ...t, officer: t.assigned_officer_name || '', outbound: mine.filter((m) => m.direction === 'outbound').length, inbound: mine.filter((m) => m.direction === 'inbound').length, last_activity: (t.last_activity || '').slice(0, 16).replace('T', ' ') };
      }).filter((r) => r.outbound + r.inbound > 0 || (!f.from && !f.to));
    },
    totals: ['outbound', 'inbound'],
  },
};

export function runReport(name, filters = {}) {
  const r = REPORTS[name];
  if (!r) return null;
  const anon = anonymizer(filters.anonymize === true || filters.anonymize === 'true');
  const rows = r.rows(filters).map((row) => ({ ...row, company_name: anon(row.company_name) }));
  const totals = r.totals ? Object.fromEntries(r.totals.map((k) => [k, money(rows.reduce((s, x) => s + Number(x[k] || 0), 0))])) : null;
  return { name, title: r.title, columns: r.columns.map(([key, label]) => ({ key, label })), rows: rows.map((x) => Object.fromEntries(r.columns.map(([k]) => [k, x[k] ?? '']))), totals, generated: new Date().toISOString() };
}

export async function reportXlsx(report) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([report.title]).font = { bold: true, size: 14 };
  ws.addRow([`Generated ${report.generated.slice(0, 16).replace('T', ' ')}`]);
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
  report.rows.forEach((r) => ws.addRow(report.columns.map((c) => r[c.key])));
  if (report.totals) {
    const t = ws.addRow(report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals[c.key] ?? '')));
    t.font = { bold: true };
  }
  report.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(14, c.label.length + 4); });
  return wb.xlsx.writeBuffer();
}

const FILTER_LABELS = { from: 'From', to: 'To', financial_year: 'Financial year', company_id: 'Company', officer_id: 'Officer', status: 'Status', anonymize: 'Company names' };

export async function reportPdf(report, password, filters = {}) {
  const t = await themedPdf({ titleEn: report.title, titleAr: REPORT_AR[report.name] || 'تقرير', reference: `RPT-${report.name.toUpperCase()}`, landscape: true, password: password || undefined });
  const names = Object.fromEntries(allDocs('Company').map((c) => [c.id, c.company_name_en]));
  const officers = Object.fromEntries(usersByRole('contributions_officer').map((u) => [u.id, u.full_name || u.email]));
  const applied = Object.entries(filters).filter(([k, v]) => FILTER_LABELS[k] && v !== '' && v !== undefined && v !== 'false').map(([k, v]) => [FILTER_LABELS[k],
    k === 'company_id' ? (filters.anonymize === 'true' ? 'Selected company (redacted)' : names[v] || v) : k === 'officer_id' ? officers[v] || v : k === 'anonymize' ? 'Anonymised' : label(v)]);
  t.grid([['Generated', dateTimeEn(report.generated)], ['Records', String(report.rows.length)], ...applied, ['Protection', password ? 'Password-protected PDF' : 'None']], 4);
  const numeric = new Set(report.columns.filter((c) => report.rows.some((r) => typeof r[c.key] === 'number')).map((c) => c.key));
  t.table(
    report.columns.map((c) => ({ key: c.key, label: c.label, width: 1 / report.columns.length, align: numeric.has(c.key) ? 'right' : undefined, format: (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : /^[a-z]+(_[a-z]+)*$/.test(String(v)) ? label(v) : v) })),
    report.rows,
    { empty: 'No records for the selected filters.', totals: report.totals ? Object.fromEntries(report.columns.map((c, i) => [c.key, i === 0 ? 'Total' : report.totals[c.key] != null ? report.totals[c.key].toLocaleString('en-US', { maximumFractionDigits: 3 }) : ''])) : undefined },
  );
  return t.done();
}

const REPORT_AR = {
  contributions: 'ملخص المساهمات حسب الشركة والسنة', pending_contributions: 'المساهمات المعلقة', payments_by_method: 'المدفوعات حسب الطريقة شهرياً',
  payments: 'سجل المدفوعات', gateway_transactions: 'معاملات بوابة الدفع', receipts_clearances: 'حالة سندات القبض وشهادات المخالصة',
  officer_workload: 'عبء عمل الموظفين وحالة سير العمل', dues_aging: 'أعمار المستحقات', applications: 'الطلبات حسب الحالة', email_activity: 'نشاط المراسلات',
};
