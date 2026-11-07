import React, { useEffect, useState } from 'react';
import { base44, downloadAuthed } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useTr, errMsg, STATUS_LABELS } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import ReportChart from '@/components/reports/ReportChart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileSpreadsheet, FileText, Play, Lock, BarChart3 } from 'lucide-react';

const ALL = 'all';
const TITLES_AR = {
  contributions: 'ملخص المساهمات حسب الشركة والسنة', pending_contributions: 'المساهمات المعلقة', payments_by_method: 'المدفوعات حسب الطريقة شهرياً',
  payments: 'سجل المدفوعات', gateway_transactions: 'معاملات بوابة الدفع', receipts_clearances: 'حالة سندات القبض وشهادات المخالصة',
  officer_workload: 'عبء عمل الموظفين وحالة سير العمل', dues_aging: 'أعمار المستحقات', applications: 'الطلبات حسب الحالة', email_activity: 'نشاط المراسلات',
};
const APP_STATUSES = ['submitted', 'assigned', 'under_review', 'pending_manager_approval', 'accounts_processing', 'completed', 'returned', 'draft'];
const PAY_STATUSES = ['pending', 'verified', 'rejected'];

export default function Reports() {
  const tr = useTr();
  const { language } = useTranslation();
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [companies, setCompanies] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [f, setF] = useState({ from: '', to: '', financial_year: '', company_id: ALL, officer_id: ALL, status: ALL, anonymize: false });
  const [password, setPassword] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const internal = user?.role && user.role !== 'company_representative';

  useEffect(() => {
    if (!internal) return;
    base44.api.get('/api/reports').then((r) => { setList(r); if (r[0]) setName(r[0].name); }).catch((e) => setError(errMsg(e)));
    base44.entities.Company.filter({}, { sort: 'company_name_en', limit: 1000 }).then((r) => setCompanies(r.items || [])).catch(() => {});
    base44.functions.invoke('listOfficers').then((r) => setOfficers(Array.isArray(r) ? r : [])).catch(() => {});
  }, [internal]);

  const params = (extra = {}) => {
    const p = { ...f, ...extra };
    const q = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => {
      if (v === ALL || v === '' || v === false || v === undefined) return;
      q.set(k, String(v));
    });
    return q.toString();
  };

  const run = async (n = name) => {
    if (!n) return;
    setLoading(true);
    setError('');
    try {
      setReport(await base44.api.get(`/api/reports/${n}?${params()}`));
    } catch (e) {
      setReport(null);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (name) run(name); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [name]);

  const exportAs = async (format) => {
    setBusy(format);
    setError('');
    try {
      const extra = { format, ...(format === 'pdf' && password ? { password } : {}) };
      await downloadAuthed(`/api/reports/${name}?${params(extra)}`, `${name}${f.anonymize ? '_anonymised' : ''}.${format}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  if (!internal) return <p className="py-16 text-center text-muted-foreground">{tr('You do not have permission to view reports.', 'ليست لديك صلاحية عرض التقارير.')}</p>;

  const statusOptions = ['payments'].includes(name) ? PAY_STATUSES : APP_STATUSES;
  const title = (r) => (language === 'ar' && TITLES_AR[r.name] ? TITLES_AR[r.name] : r.title);
  const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : (STATUS_LABELS[v] ? tr(...STATUS_LABELS[v]) : String(v ?? '')));

  return (
    <div className="space-y-5">
      <PageHeader title={tr('Reports & Analytics', 'التقارير والتحليلات')} crumbs={[{ label: tr('Reports & Analytics', 'التقارير والتحليلات') }]} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[16rem,1fr]">
        <nav className="space-y-1 rounded-xl border border-border bg-card p-2 shadow-sm" aria-label={tr('Reports', 'التقارير')}>
          {list.map((r) => (
            <button key={r.name} type="button" onClick={() => setName(r.name)} data-testid={`report-${r.name}`}
              className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors ${name === r.name ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{title(r)}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label={tr('From', 'من')}><Input type="date" data-testid="report-from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
              <Field label={tr('To', 'إلى')}><Input type="date" data-testid="report-to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
              <Field label={tr('Financial year', 'السنة المالية')}><Input value={f.financial_year} onChange={(e) => setF({ ...f, financial_year: e.target.value })} placeholder="2024" data-testid="report-year" /></Field>
              <Field label={tr('Status', 'الحالة')}>
                <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                  <SelectTrigger data-testid="report-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{tr('All', 'الكل')}</SelectItem>
                    {statusOptions.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ? tr(...STATUS_LABELS[s]) : s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={tr('Company', 'الشركة')}>
                <Select value={f.company_id} onValueChange={(v) => setF({ ...f, company_id: v })}>
                  <SelectTrigger data-testid="report-company"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{tr('All companies', 'كل الشركات')}</SelectItem>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{language === 'ar' ? c.company_name_ar || c.company_name_en : c.company_name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={tr('Officer', 'الموظف')}>
                <Select value={f.officer_id} onValueChange={(v) => setF({ ...f, officer_id: v })}>
                  <SelectTrigger data-testid="report-officer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{tr('All officers', 'كل الموظفين')}</SelectItem>
                    {officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name || o.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={tr('Password-protect PDF', 'حماية ملف PDF بكلمة مرور')}>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr('Optional', 'اختياري')} data-testid="report-pdf-password" />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Checkbox checked={f.anonymize} onCheckedChange={(v) => setF({ ...f, anonymize: !!v })} data-testid="report-anonymize" />
                <span>{tr('Anonymise company names', 'إخفاء أسماء الشركات')}</span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run()} disabled={loading || !name} className="gap-1.5" data-testid="report-run">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 rtl:-scale-x-100" />} {tr('Run report', 'تشغيل التقرير')}</Button>
              <Button variant="outline" onClick={() => exportAs('xlsx')} disabled={!!busy || !name} className="gap-1.5" data-testid="report-xlsx">{busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} {tr('Export Excel', 'تصدير Excel')}</Button>
              <Button variant="outline" onClick={() => exportAs('pdf')} disabled={!!busy || !name} className="gap-1.5" data-testid="report-pdf">{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} {tr('Export PDF', 'تصدير PDF')}</Button>
              {password && <span className="inline-flex items-center gap-1 text-xs text-success"><Lock className="h-3.5 w-3.5" /> {tr('The PDF will be encrypted and require this password to open.', 'سيتم تشفير ملف PDF ويتطلب كلمة المرور هذه لفتحه.')}</span>}
              {f.anonymize && <span className="text-xs text-muted-foreground">{tr('Company names are replaced with codes in the view and exports.', 'تُستبدل أسماء الشركات برموز في العرض والتصدير.')}</span>}
            </div>
          </div>

          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}

          {report && (
            <>
              <div>
                <h2 className="text-lg font-semibold" data-testid="report-title">{title(report)}</h2>
                <p className="text-xs text-muted-foreground">{tr(`${report.rows.length} rows`, `${report.rows.length} صف`)}</p>
              </div>
              <ReportChart report={report} />
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-sm" data-testid="report-table">
                    <thead className="bg-muted/50">
                      <tr>{report.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{c.label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.rows.length === 0 ? (
                        <tr><td colSpan={report.columns.length} className="py-12 text-center text-muted-foreground">{tr('No records for the selected filters.', 'لا توجد سجلات للمرشحات المحددة.')}</td></tr>
                      ) : report.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">{report.columns.map((c) => <td key={c.key} className={`px-4 py-2.5 ${typeof r[c.key] === 'number' ? 'whitespace-nowrap tabular-nums' : 'min-w-[8rem] break-words'}`}>{fmt(r[c.key])}</td>)}</tr>
                      ))}
                    </tbody>
                    {report.totals && report.rows.length > 0 && (
                      <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                        <tr>{report.columns.map((c, i) => <td key={c.key} className="whitespace-nowrap px-4 py-2.5">{i === 0 ? tr('Total', 'الإجمالي') : report.totals[c.key] != null ? fmt(report.totals[c.key]) : ''}</td>)}</tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
