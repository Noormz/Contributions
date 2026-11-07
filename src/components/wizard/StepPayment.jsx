import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg, PAYMENT_METHODS } from '@/lib/tr';
import { Checkbox } from '@/components/ui/checkbox';
import FileUpload from '@/components/common/FileUpload';
import { Notice } from '@/components/application/shared';
import { addAppDocument, DocRows } from '@/components/wizard/StepDocuments';
import KfasBankDetails from '@/components/payments/KfasBankDetails';

export default function StepPayment({ appId, company, docs, reload, data, update }) {
  const tr = useTr();
  const [error, setError] = useState('');
  const methods = data.payment_methods || [];
  const evidence = docs.filter((d) => d.category === 'payment_evidence');

  const toggle = (m, on) => {
    const next = on ? [...methods, m] : methods.filter((x) => x !== m);
    update({ payment_methods: next, payment_method: next[0] || '' });
  };
  const add = async (method, file) => {
    setError('');
    try {
      await addAppDocument({ appId, company, category: 'payment_evidence', file, payment_method: method, description: `${PAYMENT_METHODS.find((p) => p.value === method)?.en} — ${file.filename}` });
      await reload();
    } catch (e) { setError(errMsg(e)); }
  };
  const remove = async (d) => {
    try { await base44.entities.ApplicationDocument.delete(d.id); await reload(); } catch (e) { setError(errMsg(e)); }
  };
  const showBank = methods.some((m) => ['bank_transfer', 'bank_deposit'].includes(m));
  const label = (m) => { const p = PAYMENT_METHODS.find((x) => x.value === m); return p ? tr(p.en, p.ar) : m; };

  return (
    <div className="space-y-5" data-testid="step-payment">
      <p className="text-sm text-muted-foreground">
        {tr('Select every payment method used. A supporting document is mandatory for each cheque, transfer or deposit method.', 'اختر جميع طرق الدفع المستخدمة. يلزم إرفاق مستند داعم لكل طريقة دفع بشيك أو تحويل أو إيداع.')}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PAYMENT_METHODS.map((m) => (
          <label key={m.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${methods.includes(m.value) ? 'border-accent bg-accent/5' : 'border-border'}`}>
            <Checkbox checked={methods.includes(m.value)} onCheckedChange={(v) => toggle(m.value, !!v)} data-testid={`pm-${m.value}`} />
            <span className="text-sm font-medium">{tr(m.en, m.ar)}</span>
          </label>
        ))}
      </div>

      {showBank && <KfasBankDetails />}

      {methods.filter((m) => m !== 'payment_gateway').map((m) => {
        const mine = evidence.filter((d) => d.payment_method === m);
        return (
          <div key={m} className="space-y-2 rounded-lg border border-border p-4" data-testid={`evidence-${m}`}>
            <p className="text-sm font-semibold">{tr('Supporting document', 'المستند الداعم')}: {label(m)} <span className="text-destructive">*</span></p>
            <DocRows docs={mine} onRemove={remove} />
            {mine.length === 0 && <Notice tone="warning">{tr('Required — upload the slip, cheque copy or deposit receipt.', 'مطلوب — ارفع إيصال التحويل أو صورة الشيك أو إيصال الإيداع.')}</Notice>}
            <FileUpload testId={`evidence-upload-${m}`} required={mine.length === 0} onUploaded={(f) => add(m, f)} label={tr('Upload payment document', 'رفع مستند الدفع')} />
          </div>
        );
      })}

      {methods.includes('payment_gateway') && (
        <Notice tone="info">{tr('Online payment through the payment gateway is made after the Contributions Unit approves the contribution amount, from the application page or the Payments section.', 'يتم الدفع الإلكتروني عبر بوابة الدفع بعد اعتماد مبلغ المساهمة من وحدة المساهمات، من صفحة الطلب أو قسم المدفوعات.')}</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
