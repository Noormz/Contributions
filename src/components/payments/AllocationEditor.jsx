import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, fmtMoney } from '@/lib/tr';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

/**
 * Per-financial-year allocation inputs for one payment.
 * value: { [application_id]: amount }, onChange(next). Shows due/paid/remaining per year (excluding this payment's current allocation).
 */
export default function AllocationEditor({ payment, value, onChange, existing = [] }) {
  const tr = useTr();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    base44.functions.invoke('companyBalances', { company_id: payment.company_id })
      .then((b) => setRows(b.rows || []))
      .catch(() => setRows([]));
  }, [payment.company_id]);

  if (!rows) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">{tr('This company has no approved contributions to allocate to yet.', 'لا توجد مساهمات معتمدة لهذه الشركة للتخصيص.')}</p>;

  const mine = Object.fromEntries(existing.map((a) => [a.application_id, Number(a.allocated_amount || 0)]));
  const total = Object.values(value).reduce((s, v) => s + Number(v || 0), 0);
  const over = total > Number(payment.payment_amount) + 0.0005;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 text-start font-medium">{tr('Financial year', 'السنة المالية')}</th>
              <th className="py-2 text-start font-medium">{tr('Application', 'الطلب')}</th>
              <th className="py-2 text-end font-medium">{tr('Remaining before this payment', 'المتبقي قبل هذه الدفعة')}</th>
              <th className="w-40 py-2 text-end font-medium">{tr('Allocate (KWD)', 'تخصيص (د.ك)')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.application_id}>
                <td className="py-2">{r.financial_year}</td>
                <td className="py-2">{r.reference}</td>
                <td className="py-2 text-end tabular-nums">{fmtMoney(r.remaining + (mine[r.application_id] || 0))}</td>
                <td className="py-2">
                  <Input type="number" min="0" step="0.001" className="h-8 text-end" data-testid={`alloc-${r.financial_year}`} value={value[r.application_id] ?? ''} onChange={(e) => onChange({ ...value, [r.application_id]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-end text-sm ${over ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
        {tr('Allocated', 'المخصص')}: {fmtMoney(total)} / {fmtMoney(payment.payment_amount)}{over ? ` — ${tr('exceeds the payment amount', 'يتجاوز مبلغ الدفعة')}` : ''}
      </p>
    </div>
  );
}

export const toAllocations = (value) => Object.entries(value).filter(([, v]) => v !== '' && Number(v) > 0).map(([application_id, amount]) => ({ application_id, amount: Number(amount) }));
