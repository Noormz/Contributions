import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, errMsg, fmtMoney } from '@/lib/tr';
import { loadCompanies, loadCompanyApps, isInternalUser } from './data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CreditCard, Loader2 } from 'lucide-react';

/** Starts a (simulated, test-mode) payment gateway checkout and redirects to it. */
export default function PayOnlineDialog({ open, onOpenChange, presetCompanyId, presetApplicationId, presetAmount }) {
  const tr = useTr();
  const navigate = useNavigate();
  const { user } = useAuth();
  const internal = isInternalUser(user);
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState([]);
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState('none');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setCompanyId(presetCompanyId || (internal ? '' : user?.company_id || ''));
    setAppId(presetApplicationId || 'none');
    setAmount(presetAmount ? String(presetAmount) : '');
    if (internal) loadCompanies().then(setCompanies);
  }, [open, internal, presetCompanyId, presetApplicationId, presetAmount, user?.company_id]);

  useEffect(() => { loadCompanyApps(companyId).then(setApps); }, [companyId]);

  useEffect(() => {
    const a = apps.find((x) => x.id === appId);
    if (a?.contribution_due && !presetAmount) setAmount(String(a.contribution_due));
  }, [appId, apps, presetAmount]);

  const start = async () => {
    setError('');
    if (!companyId) return setError(tr('Select a company.', 'اختر الشركة.'));
    if (!(Number(amount) > 0)) return setError(tr('Enter an amount greater than zero.', 'أدخل مبلغاً أكبر من صفر.'));
    setBusy(true);
    try {
      const r = await base44.functions.invoke('startGatewayPayment', { company_id: companyId, application_id: appId === 'none' ? '' : appId, amount: Number(amount) });
      onOpenChange(false);
      navigate(r.checkout_url);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> {tr('Pay online', 'الدفع الإلكتروني')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {internal && (
            <div className="space-y-1.5">
              <Label>{tr('Company', 'الشركة')} *</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setAppId('none'); }}>
                <SelectTrigger><SelectValue placeholder={tr('Select company', 'اختر الشركة')} /></SelectTrigger>
                <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{tr('Application', 'الطلب')}</Label>
            <Select value={appId} onValueChange={setAppId} disabled={!companyId}>
              <SelectTrigger data-testid="payonline-application"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr('Not linked — allocate to oldest dues', 'غير مرتبط — يخصص لأقدم مستحقات')}</SelectItem>
                {apps.map((a) => <SelectItem key={a.id} value={a.id}>{a.application_reference} · {tr('FY', 'سنة')} {a.financial_year}{a.contribution_due ? ` · ${fmtMoney(a.contribution_due)}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payonline-amount">{tr('Amount (KWD)', 'المبلغ (د.ك)')} *</Label>
            <Input id="payonline-amount" data-testid="payonline-amount" type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{tr('You will be redirected to the payment gateway (test mode). The transaction reference and status are recorded automatically.', 'سيتم تحويلك إلى بوابة الدفع (وضع تجريبي). يتم تسجيل مرجع المعاملة وحالتها تلقائياً.')}</p>
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={busy} onClick={start} data-testid="payonline-start">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr('Continue to payment', 'متابعة الدفع')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
