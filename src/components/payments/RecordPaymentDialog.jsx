import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, PAYMENT_METHODS, errMsg } from '@/lib/tr';
import FileUpload from '@/components/common/FileUpload';
import KfasBankDetails from './KfasBankDetails';
import { loadCompanies, loadCompanyApps, isInternalUser } from './data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

const blank = { company_id: '', application_id: 'none', payment_method: '', payment_amount: '', payment_date: new Date().toISOString().slice(0, 10), cheque_number: '', bank_name: '', transfer_reference: '', deposit_reference: '', internal_notes: '', payment_evidence_attachment: '', evidence_name: '' };

export default function RecordPaymentDialog({ open, onOpenChange, onSaved, presetCompanyId, presetApplicationId }) {
  const tr = useTr();
  const { user } = useAuth();
  const internal = isInternalUser(user);
  const [form, setForm] = useState(blank);
  const [companies, setCompanies] = useState([]);
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ ...blank, company_id: presetCompanyId || (internal ? '' : user?.company_id || ''), application_id: presetApplicationId || 'none' });
    if (internal) loadCompanies().then(setCompanies);
  }, [open, internal, presetCompanyId, presetApplicationId, user?.company_id]);

  useEffect(() => { loadCompanyApps(form.company_id).then(setApps); }, [form.company_id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const methods = PAYMENT_METHODS.filter((m) => m.value !== 'payment_gateway');

  const save = async () => {
    setError('');
    if (!form.company_id) return setError(tr('Select a company.', 'اختر الشركة.'));
    if (!form.payment_method) return setError(tr('Select a payment method.', 'اختر طريقة الدفع.'));
    if (!(Number(form.payment_amount) > 0)) return setError(tr('Enter an amount greater than zero.', 'أدخل مبلغاً أكبر من صفر.'));
    if (form.payment_method === 'cheque' && !form.cheque_number.trim()) return setError(tr('Cheque number is required.', 'رقم الشيك مطلوب.'));
    if (!form.payment_evidence_attachment) return setError(tr('Upload the supporting payment document.', 'ارفع مستند الدفع الداعم.'));
    setBusy(true);
    try {
      const { evidence_name, ...rest } = form;
      const p = await base44.functions.invoke('recordPayment', { ...rest, application_id: form.application_id === 'none' ? '' : form.application_id, payment_amount: Number(form.payment_amount) });
      onOpenChange(false);
      onSaved?.(p);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{tr('Record payment', 'تسجيل دفعة')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {internal && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{tr('Company', 'الشركة')} *</Label>
                <Select value={form.company_id} onValueChange={(v) => setForm((f) => ({ ...f, company_id: v, application_id: 'none' }))}>
                  <SelectTrigger data-testid="pay-company"><SelectValue placeholder={tr('Select company', 'اختر الشركة')} /></SelectTrigger>
                  <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name_en}{c.company_name_ar ? ` — ${c.company_name_ar}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{tr('Application / financial year', 'الطلب / السنة المالية')}</Label>
              <Select value={form.application_id} onValueChange={set('application_id')} disabled={!form.company_id}>
                <SelectTrigger data-testid="pay-application"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr('Not linked — allocate to oldest dues', 'غير مرتبط — يخصص لأقدم مستحقات')}</SelectItem>
                  {apps.map((a) => <SelectItem key={a.id} value={a.id}>{a.application_reference} · {tr('FY', 'سنة')} {a.financial_year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Payment method', 'طريقة الدفع')} *</Label>
              <Select value={form.payment_method} onValueChange={set('payment_method')}>
                <SelectTrigger data-testid="pay-method"><SelectValue placeholder={tr('Select', 'اختر')} /></SelectTrigger>
                <SelectContent>{methods.map((m) => <SelectItem key={m.value} value={m.value}>{tr(m.en, m.ar)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">{tr('Amount (KWD)', 'المبلغ (د.ك)')} *</Label>
              <Input id="pay-amount" data-testid="pay-amount" type="number" min="0" step="0.001" value={form.payment_amount} onChange={set('payment_amount')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">{tr('Payment date', 'تاريخ الدفع')}</Label>
              <Input id="pay-date" type="date" value={form.payment_date} onChange={set('payment_date')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-bank">{tr('Bank', 'البنك')}</Label>
              <Input id="pay-bank" value={form.bank_name} onChange={set('bank_name')} />
            </div>
            {form.payment_method === 'cheque' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-cheque">{tr('Cheque number', 'رقم الشيك')} *</Label>
                <Input id="pay-cheque" data-testid="pay-cheque" value={form.cheque_number} onChange={set('cheque_number')} />
              </div>
            )}
            {form.payment_method === 'bank_transfer' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-trf">{tr('Transfer reference', 'مرجع التحويل')}</Label>
                <Input id="pay-trf" value={form.transfer_reference} onChange={set('transfer_reference')} />
              </div>
            )}
            {form.payment_method === 'bank_deposit' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-dep">{tr('Deposit reference', 'مرجع الإيداع')}</Label>
                <Input id="pay-dep" value={form.deposit_reference} onChange={set('deposit_reference')} />
              </div>
            )}
          </div>
          {['bank_transfer', 'bank_deposit'].includes(form.payment_method) && <KfasBankDetails compact />}
          <div className="space-y-1.5">
            <Label>{tr('Supporting payment document (transfer slip, cheque copy, deposit slip)', 'مستند الدفع (إيصال التحويل، صورة الشيك، إيصال الإيداع)')} *</Label>
            <FileUpload
              testId="pay-evidence"
              companyId={form.company_id}
              value={form.payment_evidence_attachment}
              valueName={form.evidence_name}
              onUploaded={(r) => setForm((f) => ({ ...f, payment_evidence_attachment: r.file_url, evidence_name: r.filename }))}
              onClear={() => setForm((f) => ({ ...f, payment_evidence_attachment: '', evidence_name: '' }))}
              required
            />
          </div>
          {internal && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">{tr('Internal notes', 'ملاحظات داخلية')}</Label>
              <Textarea id="pay-notes" rows={2} value={form.internal_notes} onChange={set('internal_notes')} />
            </div>
          )}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={busy} onClick={save} data-testid="pay-save">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr('Record payment', 'تسجيل الدفعة')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
