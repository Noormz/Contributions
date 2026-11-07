import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtMoney, fmtDate, PAYMENT_METHODS, errMsg } from '@/lib/tr';
import StatusBadge from '@/components/review/StatusBadge';
import RecordPaymentDialog from './RecordPaymentDialog';
import PayOnlineDialog from './PayOnlineDialog';
import { isInternalUser } from './data';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, Plus } from 'lucide-react';

const Stat = ({ label, value, tone }) => (
  <div className="rounded-lg border border-border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`mt-1 text-lg font-bold tabular-nums ${tone || ''}`}>{value}</p>
  </div>
);

/**
 * Contribution balances and payments.
 * Internal users: per-year due/paid/remaining, past dues, unallocated credit (FR-11, officers only).
 * Company reps: contribution due on the application and their own payments, with Pay online.
 */
export default function BalancePanel({ companyId, application }) {
  const tr = useTr();
  const { user } = useAuth();
  const internal = isInternalUser(user);
  const cid = companyId || application?.company_id;
  const [bal, setBal] = useState(null);
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const q = application ? { application_id: application.id } : { company_id: cid };
      const [b, p] = await Promise.all([
        internal && cid ? base44.functions.invoke('companyBalances', { company_id: cid }) : null,
        base44.entities.Payment.filter(q, { sort: '-payment_date', limit: 200 }),
      ]);
      setBal(b);
      setPayments(p.items || []);
    } catch (e) {
      setError(errMsg(e));
      setPayments([]);
    }
  }, [cid, application, internal]);
  useEffect(() => { if (cid) load(); }, [load, cid]);

  if (!cid) return null;
  if (payments === null) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const method = (m) => { const x = PAYMENT_METHODS.find((p) => p.value === m); return x ? tr(x.en, x.ar) : m; };
  const appRow = application && bal ? bal.rows.find((r) => r.application_id === application.id) : null;
  const canPayOnline = application ? application.status === 'accounts_processing' : true;
  const canRecord = internal ? ['accounts_unit', 'contributions_officer', 'contributions_manager', 'system_admin'].includes(user.role) : true;

  return (
    <div className="space-y-5" data-testid="balance-panel">
      {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {internal && bal && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {appRow && <Stat label={tr('This application — remaining', 'هذا الطلب — المتبقي')} value={fmtMoney(appRow.remaining)} tone={appRow.remaining > 0 ? 'text-warning' : 'text-success'} />}
            <Stat label={tr('Total due', 'إجمالي المستحق')} value={fmtMoney(bal.total_due)} />
            <Stat label={tr('Total paid (verified)', 'إجمالي المدفوع (مؤكد)')} value={fmtMoney(bal.total_paid)} />
            <Stat label={tr('Remaining balance', 'الرصيد المتبقي')} value={fmtMoney(bal.total_remaining)} tone={bal.total_remaining > 0 ? 'text-warning' : 'text-success'} />
            <Stat label={tr('Past dues', 'المستحقات السابقة')} value={fmtMoney(bal.past_dues)} tone={bal.past_dues > 0 ? 'text-destructive' : ''} />
            {bal.unallocated_credit > 0.0005 && <Stat label={tr('Unallocated credit', 'رصيد غير مخصص')} value={fmtMoney(bal.unallocated_credit)} />}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" data-testid="balance-table">
              <thead className="bg-muted/50">
                <tr>{[tr('Financial year', 'السنة المالية'), tr('Application', 'الطلب'), tr('Status', 'الحالة'), tr('Due', 'المستحق'), tr('Paid', 'المدفوع'), tr('Remaining', 'المتبقي')].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-semibold text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bal.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{tr('No approved contributions yet.', 'لا توجد مساهمات معتمدة بعد.')}</td></tr>
                ) : bal.rows.map((r) => (
                  <tr key={r.application_id} className={application?.id === r.application_id ? 'bg-accent/5 font-medium' : ''}>
                    <td className="px-3 py-2">{r.financial_year}</td>
                    <td className="px-3 py-2"><Link to={`/applications/${r.application_id}`} className="hover:text-accent hover:underline">{r.reference}</Link></td>
                    <td className="px-3 py-2"><StatusBadge value={r.status} /></td>
                    <td className="px-3 py-2 tabular-nums">{fmtMoney(r.due)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtMoney(r.paid)}</td>
                    <td className={`px-3 py-2 tabular-nums ${r.remaining > 0 ? 'text-warning' : 'text-success'}`}>{fmtMoney(r.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!internal && application && (
        <div className="rounded-lg border border-border p-4">
          {application.contribution_due != null ? (
            <p className="text-sm">{tr('Approved contribution for this application', 'المساهمة المعتمدة لهذا الطلب')}: <span className="text-lg font-bold tabular-nums">{fmtMoney(application.contribution_due)}</span></p>
          ) : (
            <p className="text-sm text-muted-foreground">{tr('The contribution amount will be shown here once it has been calculated and approved.', 'سيظهر مبلغ المساهمة هنا بعد احتسابه واعتماده.')}</p>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-primary">{tr('Payments', 'المدفوعات')}</h4>
          <div className="flex flex-wrap gap-2">
            {canRecord && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRecordOpen(true)} data-testid="balance-record-payment"><Plus className="h-4 w-4" /> {tr('Record payment', 'تسجيل دفعة')}</Button>}
            {canPayOnline && <Button size="sm" className="gap-1.5" onClick={() => setPayOpen(true)} data-testid="balance-pay-online"><CreditCard className="h-4 w-4" /> {tr('Pay online', 'الدفع الإلكتروني')}</Button>}
          </div>
        </div>
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No payments recorded.', 'لا توجد مدفوعات مسجلة.')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>{[tr('Reference', 'المرجع'), tr('Method', 'الطريقة'), tr('Date', 'التاريخ'), tr('Amount', 'المبلغ'), tr('Status', 'الحالة')].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-semibold text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2"><Link to={`/records/Payment/${p.id}`} className="font-medium hover:text-accent hover:underline">{p.payment_reference}</Link></td>
                    <td className="px-3 py-2">{method(p.payment_method)}</td>
                    <td className="px-3 py-2">{fmtDate(p.payment_date)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtMoney(p.payment_amount)}</td>
                    <td className="px-3 py-2"><StatusBadge value={p.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} onSaved={load} presetCompanyId={cid} presetApplicationId={application?.id} />
      <PayOnlineDialog open={payOpen} onOpenChange={setPayOpen} presetCompanyId={cid} presetApplicationId={application?.id} presetAmount={internal && appRow ? appRow.remaining : undefined} />
    </div>
  );
}
