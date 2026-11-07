import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDate, fmtMoney, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import { loadCompanies, loadCompanyApps } from '@/components/payments/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, Plus, Download, Search } from 'lucide-react';

const CONFIG = {
  voucher: {
    entity: 'ReceiptVoucher', title: ['Receipt Vouchers', 'سندات القبض'], issue: ['Issue receipt voucher', 'إصدار سند قبض'],
    number: (r) => r.voucher_number, date: (r) => r.voucher_date, status: (r) => r.status, pdf: (r) => `/api/receipt-vouchers/${r.id}/voucher.pdf?download=1`,
    roles: ['accounts_unit', 'system_admin'], statuses: ['pending', 'issued', 'cancelled'],
  },
  clearance: {
    entity: 'ClearanceLetter', title: ['Clearance Letters', 'شهادات المخالصة'], issue: ['Issue clearance letter', 'إصدار شهادة مخالصة'],
    number: (r) => r.clearance_reference, date: (r) => r.clearance_date, status: (r) => r.clearance_status, pdf: (r) => `/api/clearance-letters/${r.id}/letter.pdf?download=1`,
    roles: ['accounts_unit', 'contributions_manager', 'system_admin'], statuses: ['pending', 'issued', 'expired', 'revoked'],
  },
};

export default function IssuedDocuments({ kind = 'voucher' }) {
  const tr = useTr();
  const { user } = useAuth();
  const cfg = CONFIG[kind];
  const canIssue = cfg.roles.includes(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.entities[cfg.entity].filter({}, { sort: '-created_date', limit: 1000 });
      setRows(res.items || []);
    } catch (e) { setError(errMsg(e)); }
    setLoading(false);
  }, [cfg.entity]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => rows.filter((r) => {
    if (status !== 'all' && cfg.status(r) !== status) return false;
    if (!q) return true;
    const n = q.toLowerCase();
    return [cfg.number(r), r.company_name, r.application_reference].some((x) => String(x || '').toLowerCase().includes(n));
  }), [rows, status, q, cfg]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr(...cfg.title)}
        subtitle={kind === 'voucher' ? tr('Receipt vouchers issued by the Accounts Unit against verified payments.', 'سندات القبض الصادرة من وحدة الحسابات مقابل المدفوعات المؤكدة.') : tr('Clearance letters issued to companies with no outstanding contributions.', 'شهادات المخالصة الصادرة للشركات التي لا توجد عليها مستحقات.')}
        crumbs={[{ label: tr(...cfg.title) }]}
        actions={canIssue && <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)} data-testid="issue-document"><Plus className="h-4 w-4" /> {tr(...cfg.issue)}</Button>}
      />
      {flash && <div className="rounded-lg bg-success/10 p-3 text-sm text-success" role="status">{flash}</div>}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search number, company or application', 'ابحث بالرقم أو الشركة أو الطلب')} aria-label={tr('Search', 'بحث')} />
        </div>
        <div className="sm:w-56">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label={tr('Status', 'الحالة')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All statuses', 'كل الحالات')}</SelectItem>
              {cfg.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm" data-testid="issued-table">
            <thead className="bg-muted/50">
              <tr>{[tr('Number', 'الرقم'), tr('Company', 'الشركة'), tr('Application', 'الطلب'), tr('Date', 'التاريخ'), ...(kind === 'clearance' ? [tr('Validity', 'الصلاحية')] : []), tr('Status', 'الحالة'), tr('Uploaded by', 'رفعها'), tr('Document', 'المستند')].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{tr('No records found', 'لا توجد سجلات')}</td></tr>
              ) : shown.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3"><Link to={`/records/${cfg.entity}/${r.id}`} className="font-medium hover:text-accent hover:underline">{cfg.number(r) || '—'}</Link></td>
                  <td className="min-w-[10rem] break-words px-4 py-3">{r.company_name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.application_id ? <Link to={`/applications/${r.application_id}`} className="hover:text-accent hover:underline">{r.application_reference || tr('Application', 'الطلب')}</Link> : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(cfg.date(r))}</td>
                  {kind === 'clearance' && <td className="whitespace-nowrap px-4 py-3">{r.validity_period || '—'}</td>}
                  <td className="px-4 py-3"><StatusBadge value={cfg.status(r)} /></td>
                  <td className="min-w-[8rem] break-words px-4 py-3">{r.uploaded_by || '—'}<span className="block text-xs text-muted-foreground">{fmtDate(r.upload_date)}</span></td>
                  <td className="px-4 py-3"><div className="flex flex-col gap-1">
                    <a href={cfg.pdf(r)} className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline" data-testid="issued-pdf"><Download className="h-4 w-4" /> {tr('Signed PDF', 'المستند الموقّع PDF')}</a>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canIssue && <IssueDialog kind={kind} open={open} onOpenChange={setOpen} onSaved={(rec) => { setFlash(tr(`${cfg.number(rec)} issued. The company has been notified.`, `تم إصدار ${cfg.number(rec)} وإشعار الشركة.`)); load(); }} />}
    </div>
  );
}

function IssueDialog({ kind, open, onOpenChange, onSaved }) {
  const tr = useTr();
  const cfg = CONFIG[kind];
  const [companies, setCompanies] = useState([]);
  const [apps, setApps] = useState([]);
  const [payments, setPayments] = useState([]);
  const blank = { company_id: '', application_id: 'none', related_payment_id: 'none', date: new Date().toISOString().slice(0, 10), validity_period: '12 months', document_type: kind === 'voucher' ? 'Receipt Voucher' : 'Clearance Letter' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(blank);
    setError('');
    loadCompanies().then(setCompanies);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!form.company_id) { setApps([]); setPayments([]); return; }
    loadCompanyApps(form.company_id).then((a) => setApps(kind === 'voucher' ? [...a].sort((x, y) => (y.status === 'accounts_processing') - (x.status === 'accounts_processing')) : a));
    if (kind === 'voucher') base44.entities.Payment.filter({ company_id: form.company_id, payment_status: 'verified' }, { sort: '-payment_date', limit: 200 }).then((r) => setPayments(r.items || [])).catch(() => setPayments([]));
  }, [form.company_id, kind]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    setError('');
    if (!form.company_id) return setError(tr('Select a company.', 'اختر الشركة.'));
    setBusy(true);
    try {
      const rec = await base44.functions.invoke('issueDocument', {
        kind, company_id: form.company_id, application_id: form.application_id === 'none' ? '' : form.application_id,
        related_payment_id: form.related_payment_id === 'none' ? '' : form.related_payment_id, date: form.date,
        validity_period: form.validity_period, document_type: form.document_type,
      });
      onOpenChange(false);
      onSaved?.(rec);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{tr(...cfg.issue)}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{tr('Company', 'الشركة')} *</Label>
            <Select value={form.company_id} onValueChange={(v) => setForm((f) => ({ ...f, company_id: v, application_id: 'none', related_payment_id: 'none' }))}>
              <SelectTrigger data-testid="issue-company"><SelectValue placeholder={tr('Select company', 'اختر الشركة')} /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name_en}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Application', 'الطلب')}</Label>
            <Select value={form.application_id} onValueChange={set('application_id')} disabled={!form.company_id}>
              <SelectTrigger data-testid="issue-application"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr('Not linked to an application', 'غير مرتبط بطلب')}</SelectItem>
                {apps.map((a) => <SelectItem key={a.id} value={a.id}>{a.application_reference} · {tr('FY', 'سنة')} {a.financial_year} · {a.status.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {kind === 'voucher' && (
            <div className="space-y-1.5">
              <Label>{tr('Related payment', 'الدفعة المرتبطة')}</Label>
              <Select value={form.related_payment_id} onValueChange={set('related_payment_id')} disabled={!form.company_id}>
                <SelectTrigger data-testid="issue-payment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr('None', 'لا يوجد')}</SelectItem>
                  {payments.map((p) => <SelectItem key={p.id} value={p.id}>{p.payment_reference} · {fmtMoney(p.payment_amount)} · {fmtDate(p.payment_date)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="issue-date">{tr('Date', 'التاريخ')}</Label>
              <Input id="issue-date" type="date" value={form.date} onChange={set('date')} />
            </div>
            {kind === 'clearance' ? (
              <div className="space-y-1.5">
                <Label htmlFor="issue-validity">{tr('Validity period', 'مدة الصلاحية')}</Label>
                <Input id="issue-validity" value={form.validity_period} onChange={set('validity_period')} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="issue-type">{tr('Document type', 'نوع المستند')}</Label>
                <Input id="issue-type" value={form.document_type} onChange={set('document_type')} />
              </div>
            )}
          </div>
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground" data-testid="issue-signed-note">
            {tr('The portal produces the official PDF, signed electronically in your name with the KFAS seal and a QR verification code. Nothing needs to be uploaded.', 'تُصدر البوابة المستند الرسمي PDF موقّعاً إلكترونياً باسمك مع ختم المؤسسة ورمز تحقق QR. لا حاجة لرفع أي ملف.')}
          </p>
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={busy} onClick={save} data-testid="issue-save">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr('Issue', 'إصدار')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
