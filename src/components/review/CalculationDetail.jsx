import React from 'react';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtMoney, fmtDateTime } from '@/lib/tr';
import StatusBadge from '@/components/review/StatusBadge';

export const parseInputs = (calc) => {
  try { return JSON.parse(calc?.financial_inputs || '{}'); } catch { return {}; }
};

export default function CalculationDetail({ calc }) {
  const { t } = useTranslation();
  const tr = useTr();
  const inputs = parseInputs(calc);

  const rows = [
    [t('rv_calc_ref'), calc.calculation_reference],
    [t('rv_net_profit'), inputs.net_profit != null ? fmtMoney(inputs.net_profit) : ''],
    [tr('Subsidiaries share', 'حصة الشركات التابعة'), fmtMoney(inputs.subsidiary_share || 0)],
    [t('rv_contribution_rate'), inputs.contribution_rate != null ? `${inputs.contribution_rate}%` : ''],
    [t('rv_adjustments'), fmtMoney(calc.adjustments)],
    [t('rv_previous_contribution'), fmtMoney(calc.previous_contribution)],
    [t('rv_outstanding_balance'), fmtMoney(calc.outstanding_balance)],
    [t('rv_calc_basis'), calc.calculation_basis],
    [t('rv_calculated'), fmtMoney(calc.calculated_contribution)],
    [t('rv_officer_comments'), calc.officer_comments],
    [tr('Reviewed by', 'راجعها'), calc.reviewed_by],
    [tr('Approved by', 'اعتمدها'), calc.approved_by ? `${calc.approved_by} · ${fmtDateTime(calc.approval_date)}` : ''],
    [tr('Version', 'الإصدار'), calc.version],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('status')}:</span>
        <StatusBadge value={calc.status} />
        {calc.is_partial && <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">{tr('Partial calculation', 'حساب جزئي')}</span>}
      </div>
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-1 gap-0.5 px-4 py-2.5 sm:grid-cols-3 sm:gap-2">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm sm:col-span-2">{value === 0 ? '0' : value || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
