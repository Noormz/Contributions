import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTr, fmtMoney, errMsg } from '@/lib/tr';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, CheckCircle2, XCircle, Lock, AlertTriangle } from 'lucide-react';

/** Simulated payment gateway checkout (test mode). No real card data is collected. */
export default function GatewayCheckout() {
  const { id } = useParams();
  const tr = useTr();
  const { language, toggleLanguage } = useTranslation();
  const navigate = useNavigate();
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    base44.entities.PaymentGatewayTransaction.get(id).then(setTx).catch((e) => setError(errMsg(e)));
  }, [id]);

  const finish = async (outcome) => {
    setBusy(true);
    setError('');
    try {
      const u = await base44.functions.invoke('completeGatewayPayment', { transaction_id: id, outcome });
      let resp = {};
      try { resp = JSON.parse(u.gateway_response || '{}'); } catch { /* ignore */ }
      setResult({ outcome, reference: resp.transaction_reference, tx: u });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const done = tx && !['initiated', 'pending'].includes(tx.status);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between bg-[#0b3d6e] px-5 py-4 text-white">
          <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span className="font-semibold">{tr('Secure Payment', 'دفع آمن')}</span></div>
          <button onClick={toggleLanguage} className="text-xs underline">{language === 'en' ? 'العربية' : 'English'}</button>
        </div>
        <div className="bg-amber-100 px-5 py-2 text-center text-xs font-bold tracking-wide text-amber-900" data-testid="test-mode-banner">{tr('TEST MODE — no real payment will be taken', 'وضع تجريبي — لن يتم خصم أي مبلغ فعلي')}</div>

        {!tx && !error && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
        {error && !tx && <div className="flex flex-col items-center gap-3 p-8 text-center"><AlertTriangle className="h-8 w-8 text-amber-500" /><p>{error}</p><Button variant="outline" onClick={() => navigate('/payments')}>{tr('Back to payments', 'العودة للمدفوعات')}</Button></div>}

        {tx && !result && (
          <div className="space-y-5 p-6">
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{tr('Merchant', 'التاجر')}</span><span className="font-medium">KFAS Contributions</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">{tr('Reference', 'المرجع')}</span><span className="font-mono text-xs" data-testid="gateway-ref">{tx.gateway_reference}</span></div>
              <div className="mt-3 flex items-end justify-between"><span className="text-slate-500">{tr('Amount', 'المبلغ')}</span><span className="text-2xl font-bold" data-testid="checkout-amount">{fmtMoney(tx.amount)}</span></div>
            </div>
            {done ? (
              <div className="space-y-3 text-center">
                <p className="text-sm">{tr('This transaction has already been processed', 'تمت معالجة هذه المعاملة')}: <strong>{tx.status}</strong></p>
                <Button className="w-full" onClick={() => navigate(`/records/Payment/${tx.payment_id}`)}>{tr('View payment', 'عرض الدفعة')}</Button>
              </div>
            ) : (
              <>
                <fieldset disabled className="space-y-3 opacity-70">
                  <div className="space-y-1.5"><Label>{tr('Card number', 'رقم البطاقة')}</Label><Input placeholder="•••• •••• •••• ••••" aria-label="demo card number" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>{tr('Expiry', 'الانتهاء')}</Label><Input placeholder="MM/YY" aria-label="demo expiry" /></div>
                    <div className="space-y-1.5"><Label>PIN / CVV</Label><Input placeholder="•••" aria-label="demo pin" /></div>
                  </div>
                  <p className="text-xs text-slate-500">{tr('Card fields are disabled in test mode. Use the buttons below to simulate the gateway response.', 'حقول البطاقة معطلة في الوضع التجريبي. استخدم الأزرار أدناه لمحاكاة رد البوابة.')}</p>
                </fieldset>
                {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                <div className="space-y-2">
                  <Button className="w-full gap-2 bg-[#0b3d6e] hover:bg-[#0b3d6e]/90" disabled={busy} onClick={() => finish('completed')} data-testid="gateway-pay">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {tr('Pay', 'ادفع')} {fmtMoney(tx.amount)} ({tr('simulate success', 'محاكاة النجاح')})
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => finish('failed')} data-testid="gateway-fail">{tr('Simulate failure', 'محاكاة الفشل')}</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => finish('cancelled')} data-testid="gateway-cancel">{tr('Cancel', 'إلغاء')}</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4 p-8 text-center" data-testid="gateway-result">
            {result.outcome === 'completed'
              ? <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
              : <XCircle className="mx-auto h-14 w-14 text-red-600" />}
            <h1 className="text-xl font-bold">{result.outcome === 'completed' ? tr('Payment successful', 'تم الدفع بنجاح') : result.outcome === 'failed' ? tr('Payment failed', 'فشلت عملية الدفع') : tr('Payment cancelled', 'تم إلغاء الدفع')}</h1>
            <p className="text-sm text-slate-600">{tr('Transaction reference', 'مرجع المعاملة')}: <span className="font-mono" data-testid="txn-ref">{result.reference || '—'}</span></p>
            <p className="text-sm text-slate-600">{tr('Gateway reference', 'مرجع البوابة')}: <span className="font-mono">{tx.gateway_reference}</span></p>
            <Button className="w-full" onClick={() => navigate(`/records/Payment/${tx.payment_id}`)} data-testid="gateway-back">{tr('Return to the portal', 'العودة إلى البوابة')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
