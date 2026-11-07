import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtMoney, fmtDate, PAYMENT_METHODS, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import KpiCard from '@/components/KpiCard';
import RecordPaymentDialog from '@/components/payments/RecordPaymentDialog';
import PayOnlineDialog from '@/components/payments/PayOnlineDialog';
import KfasBankDetails from '@/components/payments/KfasBankDetails';
import { isInternalUser, loadCompanies } from '@/components/payments/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Inbox, Plus, CreditCard, Clock, Wallet, Search, Download, FileText, CheckCircle2 } from 'lucide-react';

const STATUSES = ['pending', 'verified', 'rejected'];

export default function PaymentsPage() {
  const tr = useTr();
  const { user } = useAuth();
  const internal = isInternalUser(user);
  const [payments, setPayments] = useState([]);
  const [txCount, setTxCount] = useState({ total: 0, completed: 0 });
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const [f, setF] = useState({ status: params.get('status') || 'all', method: params.get('method') || 'all', company: params.get('company') || 'all', from: '', to: '', q: '' });
  const [recordOpen, setRecordOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.entities.Payment.filter({}, { sort: '-created_date', limit: 1000 });
      setPayments(res.items || []);
      if (internal) {
        const [t, c] = await Promise.all([
          base44.entities.PaymentGatewayTransaction.filter({}, { limit: 1000 }).catch(() => ({ items: [] })),
          loadCompanies(),
        ]);
        const items = t.items || [];
        setTxCount({ total: items.length, completed: items.filter((x) => x.status === 'completed').length });
        setCompanies(c);
      }
    } catch (e) {
      setError(errMsg(e));
    }
    setLoading(false);
  }, [internal]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => payments.filter((p) => {
    if (f.status !== 'all' && p.payment_status !== f.status) return false;
    if (f.method !== 'all' && p.payment_method !== f.method) return false;
    if (f.company !== 'all' && p.company_id !== f.company) return false;
    const d = String(p.payment_date || p.created_date).slice(0, 10);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.q) {
      const needle = f.q.toLowerCase();
      return [p.payment_reference, p.company_name, p.contribution_reference, p.transaction_reference, p.cheque_number].some((x) => String(x || '').toLowerCase().includes(needle));
    }
    return true;
  }), [payments, f]);

  const month = new Date().toISOString().slice(0, 7);
  const pendingCount = payments.filter((p) => p.payment_status === 'pending').length;
  const verifiedMonth = payments.filter((p) => p.payment_status === 'verified' && String(p.verified_date || p.payment_date).slice(0, 7) === month).reduce((s, p) => s + Number(p.payment_amount || 0), 0);
  const method = (m) => { const x = PAYMENT_METHODS.find((p) => p.value === m); return x ? tr(x.en, x.ar) : m; };
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const exportCsv = () => {
    const head = ['Reference', 'Company', 'Application', 'Method', 'Amount', 'Date', 'Status', 'Transaction Ref'];
    const lines = rows.map((p) => [p.payment_reference, p.company_name, p.contribution_reference, p.payment_method, p.payment_amount, p.payment_date, p.payment_status, p.transaction_reference].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'payments.csv';
    a.click();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={internal ? tr('Payment Management', 'إدارة المدفوعات') : tr('Payments', 'المدفوعات')}
        subtitle={internal ? tr('Verify payments, manage allocations and track gateway transactions.', 'تحقق من المدفوعات وإدارة التخصيص ومتابعة معاملات البوابة.') : tr('Record bank payments with supporting documents or pay online.', 'سجّل المدفوعات البنكية مع المستندات أو ادفع إلكترونياً.')}
        crumbs={[{ label: tr('Payments', 'المدفوعات') }]}
        actions={(
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPayOpen(true)} data-testid="pay-online"><CreditCard className="h-4 w-4" /> {tr('Pay online', 'الدفع الإلكتروني')}</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setRecordOpen(true)} data-testid="record-payment"><Plus className="h-4 w-4" /> {tr('Record payment', 'تسجيل دفعة')}</Button>
          </>
        )}
      />

      {internal ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard icon={Clock} label={tr('Pending verification', 'بانتظار التحقق')} value={pendingCount} tone="warning" loading={loading} />
          <KpiCard icon={Wallet} label={tr('Verified this month', 'المؤكد هذا الشهر')} value={fmtMoney(verifiedMonth)} tone="success" loading={loading} />
          <KpiCard icon={CreditCard} label={tr('Gateway transactions (completed / total)', 'معاملات البوابة (المكتملة / الكل)')} value={`${txCount.completed} / ${txCount.total}`} tone="accent" loading={loading} />
        </div>
      ) : <KfasBankDetails />}

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={tr('Search reference, company, cheque…', 'ابحث بالمرجع أو الشركة أو الشيك…')} value={f.q} onChange={set('q')} aria-label={tr('Search', 'بحث')} />
        </div>
        <Select value={f.status} onValueChange={set('status')}>
          <SelectTrigger aria-label={tr('Status', 'الحالة')} data-testid="filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All statuses', 'كل الحالات')}</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}><StatusBadge value={s} /></SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.method} onValueChange={set('method')}>
          <SelectTrigger aria-label={tr('Method', 'الطريقة')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All methods', 'كل الطرق')}</SelectItem>
            {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{tr(m.en, m.ar)}</SelectItem>)}
          </SelectContent>
        </Select>
        {internal ? (
          <Select value={f.company} onValueChange={set('company')}>
            <SelectTrigger aria-label={tr('Company', 'الشركة')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All companies', 'كل الشركات')}</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : <div className="hidden xl:block" />}
        <div className="flex min-w-0 gap-2 lg:col-span-2">
          <Input type="date" className="min-w-0" value={f.from} onChange={set('from')} aria-label={tr('From', 'من')} />
          <Input type="date" className="min-w-0" value={f.to} onChange={set('to')} aria-label={tr('To', 'إلى')} />
        </div>
      </div>

      {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error} <Button variant="link" onClick={load}>{tr('Retry', 'إعادة المحاولة')}</Button></div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm" data-testid="payments-table">
            <thead className="bg-muted/50">
              <tr>{[tr('Reference', 'المرجع'), tr('Company', 'الشركة'), tr('Application', 'الطلب'), tr('Method', 'الطريقة'), tr('Amount', 'المبلغ'), tr('Date', 'التاريخ'), tr('Status', 'الحالة')].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>)}<th className="px-4 py-3"><span className="sr-only">{tr('Actions', 'الإجراءات')}</span></th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />{tr('No payments found. Adjust your filters or record a payment.', 'لا توجد مدفوعات. عدّل الفلاتر أو سجّل دفعة.')}</td></tr>
              ) : rows.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3"><Link to={`/records/Payment/${p.id}`} className="font-medium text-accent hover:underline">{p.payment_reference || '—'}</Link></td>
                  <td className="min-w-[10rem] break-words px-4 py-3">{p.company_name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{p.application_id ? <Link to={`/applications/${p.application_id}`} className="hover:text-accent hover:underline">{p.contribution_reference || tr('Application', 'الطلب')}</Link> : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{method(p.payment_method)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{fmtMoney(p.payment_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(p.payment_date)}</td>
                  <td className="px-4 py-3"><StatusBadge value={p.payment_status} /></td>
                  <td className="px-4 py-3 text-end">
                    {internal && p.payment_status === 'pending' && p.payment_method !== 'payment_gateway' ? (
                      <Button asChild size="sm" className="h-8 gap-1.5 whitespace-nowrap"><Link to={`/records/Payment/${p.id}`} aria-label={tr(`Verify payment ${p.payment_reference}`, `تأكيد الدفعة ${p.payment_reference}`)} data-testid="payments-open"><CheckCircle2 className="h-4 w-4" />{tr('Verify', 'تأكيد')}</Link></Button>
                    ) : (
                      <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 whitespace-nowrap"><Link to={`/records/Payment/${p.id}`} aria-label={tr(`Open payment ${p.payment_reference}`, `فتح الدفعة ${p.payment_reference}`)} data-testid="payments-open"><FileText className="h-4 w-4" />{tr('Open', 'فتح')}</Link></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} onSaved={load} />
      <PayOnlineDialog open={payOpen} onOpenChange={setPayOpen} />
    </div>
  );
}
