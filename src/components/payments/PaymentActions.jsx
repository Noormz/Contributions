import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtMoney, fmtDateTime, fmtDate, errMsg } from '@/lib/tr';
import StatusBadge from '@/components/review/StatusBadge';
import AllocationEditor, { toAllocations } from './AllocationEditor';
import { INTERNAL_FINANCE } from './data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, SlidersHorizontal, Loader2, Receipt, CreditCard, FileDown, AlertTriangle } from 'lucide-react';

/** Entity panel for /records/Payment/:id — verification, allocation and linked documents. */
export default function PaymentActions({ record, reload }) {
  const tr = useTr();
  const { user } = useAuth();
  const internal = INTERNAL_FINANCE.includes(user?.role);
  const [allocs, setAllocs] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [txs, setTxs] = useState([]);
  const [dialog, setDialog] = useState(null); // verify | reject | allocate
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [a, v, t] = await Promise.all([
      internal ? base44.entities.PaymentAllocation.filter({ payment_id: record.id }, { limit: 100 }).catch(() => ({ items: [] })) : { items: [] },
      base44.entities.ReceiptVoucher.filter({ related_payment_id: record.id }, { limit: 50 }).catch(() => ({ items: [] })),
      record.payment_method === 'payment_gateway' ? base44.entities.PaymentGatewayTransaction.filter({ payment_id: record.id }, { limit: 10 }).catch(() => ({ items: [] })) : { items: [] },
    ]);
    setAllocs(a.items || []);
    setVouchers(v.items || []);
    setTxs(t.items || []);
  }, [record.id, record.payment_method, internal]);
  useEffect(() => { load(); }, [load]);

  const openDialog = (d) => {
    setDialog(d);
    setText('');
    setMsg(null);
    setManual(d === 'allocate');
    setAlloc(d === 'allocate' ? Object.fromEntries(allocs.map((a) => [a.application_id, String(a.allocated_amount)])) : {});
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (dialog === 'verify') {
        await base44.functions.invoke('verifyPayment', { payment_id: record.id, decision: 'verified', notes: text, allocations: manual ? toAllocations(alloc) : undefined });
        setMsg({ ok: true, text: tr('Payment verified and allocated.', 'تم تأكيد الدفعة وتخصيصها.') });
      } else if (dialog === 'reject') {
        await base44.functions.invoke('verifyPayment', { payment_id: record.id, decision: 'rejected', notes: text });
        setMsg({ ok: true, text: tr('Payment rejected. The company has been notified.', 'تم رفض الدفعة وإشعار الشركة.') });
      } else {
        await base44.functions.invoke('allocatePayment', { payment_id: record.id, allocations: toAllocations(alloc), reason: text });
        setMsg({ ok: true, text: tr('Allocation updated.', 'تم تحديث التخصيص.') });
      }
      setDialog(null);
      await load();
      reload?.();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const pending = record.payment_status === 'pending';
  const verified = record.payment_status === 'verified';
  const needsText = dialog === 'reject' || dialog === 'allocate';
  const overAlloc = toAllocations(alloc).reduce((s, a) => s + a.amount, 0) > Number(record.payment_amount) + 0.0005;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="payment-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge value={record.payment_status} />
          <span className="text-lg font-bold tabular-nums">{fmtMoney(record.payment_amount)}</span>
          {record.verified_by && <span className="text-xs text-muted-foreground">{tr('by', 'بواسطة')} {record.verified_by} · {fmtDateTime(record.verified_date)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/payments/${record.id}/receipt.pdf?download=1`} data-testid="payment-receipt-pdf">
            <Button size="sm" variant="outline" className="gap-1.5"><FileDown className="h-4 w-4" /> {tr('Payment receipt (PDF)', 'إيصال الدفع (PDF)')}</Button>
          </a>
          {internal && pending && record.payment_method !== 'payment_gateway' && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => openDialog('reject')} data-testid="payment-reject"><XCircle className="h-4 w-4" /> {tr('Reject', 'رفض')}</Button>
                <Button size="sm" className="gap-1.5" onClick={() => openDialog('verify')} data-testid="payment-verify"><CheckCircle2 className="h-4 w-4" /> {tr('Verify', 'تأكيد')}</Button>
              </>
            )}
          {internal && verified && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openDialog('allocate')} data-testid="payment-override"><SlidersHorizontal className="h-4 w-4" /> {tr('Override allocation', 'تعديل التخصيص')}</Button>}
        </div>
      </div>
      {!internal && pending && <p className="text-sm text-muted-foreground">{tr('Your payment is awaiting verification by the Contributions Unit.', 'دفعتكم بانتظار التحقق من وحدة المساهمات.')}</p>}
      {!internal && record.payment_status === 'rejected' && <p className="text-sm text-destructive">{tr('This payment was rejected. Please check your notifications for the reason and record a new payment.', 'تم رفض هذه الدفعة. راجع الإشعارات لمعرفة السبب وسجّل دفعة جديدة.')}</p>}
      {msg && <div className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`} role="status">{msg.text}</div>}

      {internal && verified && (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{tr('Allocation to financial years', 'التخصيص للسنوات المالية')}</h4>
          {allocs.length === 0 ? <p className="text-sm text-muted-foreground">{tr('Not allocated (held as company credit).', 'غير مخصص (رصيد دائن للشركة).')}</p> : (
            <table className="w-full text-sm" data-testid="allocations">
              <tbody className="divide-y divide-border">
                {allocs.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">{tr('FY', 'سنة')} {a.financial_year}</td>
                    <td className="py-2"><Link className="hover:text-accent hover:underline" to={`/applications/${a.application_id}`}>{tr('Application', 'الطلب')}</Link></td>
                    <td className="py-2 text-xs text-muted-foreground">{a.manual ? tr('Manual', 'يدوي') : tr('Automatic', 'تلقائي')} · {a.allocated_by}</td>
                    <td className="py-2 text-end tabular-nums">{fmtMoney(a.allocated_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {vouchers.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">{tr('Receipt vouchers', 'سندات القبض')}</h4>
          <ul className="space-y-1 text-sm">
            {vouchers.map((v) => (
              <li key={v.id} className="flex items-center gap-2"><Receipt className="h-4 w-4 text-muted-foreground" /><Link to={`/records/ReceiptVoucher/${v.id}`} className="hover:text-accent hover:underline">{v.voucher_number}</Link> · {fmtDate(v.voucher_date)} <StatusBadge value={v.status} /></li>
            ))}
          </ul>
        </div>
      )}

      {txs.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary"><CreditCard className="h-3.5 w-3.5" /> {tr('Payment gateway transaction', 'معاملة بوابة الدفع')}</h4>
          {txs.map((t) => {
            let resp = {};
            try { resp = JSON.parse(t.gateway_response || '{}'); } catch { /* ignore */ }
            return (
              <dl key={t.id} className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                <div><dt className="inline text-muted-foreground">{tr('Gateway ref.', 'مرجع البوابة')}: </dt><dd className="inline font-medium">{t.gateway_reference}</dd></div>
                <div><dt className="inline text-muted-foreground">{tr('Status', 'الحالة')}: </dt><dd className="inline"><StatusBadge value={t.status} /></dd></div>
                <div><dt className="inline text-muted-foreground">{tr('Transaction ref.', 'مرجع المعاملة')}: </dt><dd className="inline">{resp.transaction_reference || record.transaction_reference || '—'}</dd></div>
                <div><dt className="inline text-muted-foreground">{tr('Provider', 'المزود')}: </dt><dd className="inline">{t.provider || '—'}{t.test_mode ? ' (test)' : ''}</dd></div>
                <div><dt className="inline text-muted-foreground">{tr('Initiated', 'بدأت')}: </dt><dd className="inline">{fmtDateTime(t.initiated_date)}</dd></div>
                <div><dt className="inline text-muted-foreground">{tr('Completed', 'اكتملت')}: </dt><dd className="inline">{fmtDateTime(t.completed_date)}</dd></div>
              </dl>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{dialog === 'verify' ? tr('Verify payment', 'تأكيد الدفعة') : dialog === 'reject' ? tr('Reject payment', 'رفض الدفعة') : tr('Override allocation', 'تعديل التخصيص')} — {record.payment_reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {dialog === 'verify' && (
              <>
                {record.payment_evidence_attachment && <a href={record.payment_evidence_attachment} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">{tr('Open payment evidence', 'فتح مستند الدفع')}</a>}
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={manual} onCheckedChange={setManual} data-testid="manual-allocation" />
                  {tr('Allocate manually (otherwise the oldest outstanding financial year is paid first)', 'تخصيص يدوي (وإلا تُسدد أقدم سنة مستحقة أولاً)')}
                </label>
              </>
            )}
            {(dialog === 'allocate' || (dialog === 'verify' && manual)) && <AllocationEditor payment={record} value={alloc} onChange={setAlloc} existing={dialog === 'allocate' ? allocs : []} />}
            <div className="space-y-1.5">
              <Label htmlFor="pa-text">{dialog === 'reject' ? tr('Rejection reason', 'سبب الرفض') : dialog === 'allocate' ? tr('Reason for override', 'سبب التعديل') : tr('Notes (optional)', 'ملاحظات (اختياري)')}{needsText ? ' *' : ''}</Label>
              <Textarea id="pa-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} data-testid="payment-dialog-text" />
              {needsText && !text.trim() && (
                <p className="flex items-center gap-1.5 text-xs text-warning" data-testid="payment-dialog-hint">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {dialog === 'reject' ? tr('Write the rejection reason to continue. The company will see it.', 'اكتب سبب الرفض للمتابعة. ستراه الشركة.') : tr('Write the reason for the override to continue. It is kept in the audit log.', 'اكتب سبب التعديل للمتابعة. يُحفظ في سجل التدقيق.')}
                </p>
              )}
            </div>
            {msg && !msg.ok && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{msg.text}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button variant={dialog === 'reject' ? 'destructive' : 'default'} disabled={busy || (needsText && !text.trim()) || overAlloc} onClick={submit} data-testid="payment-dialog-confirm">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr('Confirm', 'تأكيد')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
