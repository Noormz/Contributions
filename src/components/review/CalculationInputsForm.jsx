import React from 'react';
import { useTranslation } from '@/lib/i18n';
import { useTr } from '@/lib/tr';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const computeContribution = (form) =>
  ((Number(form.net_profit || 0) + Number(form.subsidiary_share || 0)) * Number(form.contribution_rate || 0)) / 100 + Number(form.adjustments || 0);

export default function CalculationInputsForm({ form, setForm, calculated, readOnly }) {
  const { t } = useTranslation();
  const tr = useTr();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const num = (k, label, extra = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`calc-${k}`}>{label}</Label>
      <Input id={`calc-${k}`} data-testid={`calc-${k}`} type="number" step="any" value={form[k] ?? ''} onChange={set(k)} disabled={readOnly} {...extra} />
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-primary">{t('rv_inputs')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {num('net_profit', `${t('rv_net_profit')} (KWD) *`)}
        {num('subsidiary_share', tr('Share of subsidiaries\' profit (KWD)', 'حصة أرباح الشركات التابعة (د.ك)'))}
        {num('contribution_rate', `${t('rv_contribution_rate')} *`, { min: 0, max: 100 })}
        {num('adjustments', `${t('rv_adjustments')} (KWD)`)}
        {num('previous_contribution', `${t('rv_previous_contribution')} (KWD)`)}
        {num('outstanding_balance', `${t('rv_outstanding_balance')} (KWD)`)}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="calc-basis">{t('rv_calc_basis')}</Label>
          <Input id="calc-basis" value={form.calculation_basis ?? ''} onChange={set('calculation_basis')} disabled={readOnly} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="calc-comments">{t('rv_officer_comments')}</Label>
        <Textarea id="calc-comments" rows={3} value={form.officer_comments ?? ''} onChange={set('officer_comments')} disabled={readOnly} />
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">{t('rv_calculated')}</span>
        <span className="text-lg font-bold tabular-nums" data-testid="calc-result">
          {Number.isFinite(calculated) ? calculated.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0.000'} KWD
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{tr('Formula: (net profit + subsidiaries share) × rate ÷ 100 + adjustments', 'المعادلة: (صافي الربح + حصة التابعة) × النسبة ÷ 100 + التسويات')}</p>
    </div>
  );
}
