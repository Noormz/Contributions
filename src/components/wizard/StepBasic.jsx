import React from 'react';
import { useTr } from '@/lib/tr';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { yearOptions } from '@/components/application/shared';

export default function StepBasic({ data, update, company }) {
  const tr = useTr();
  return (
    <div className="space-y-5" data-testid="step-basic">
      <p className="text-sm text-muted-foreground">
        {tr('Select the financial year this contribution application covers.', 'اختر السنة المالية التي يغطيها طلب المساهمة.')}
      </p>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">{tr('Company', 'الشركة')}: </span>
        <span className="font-semibold">{company?.company_name_ar}</span>
        <span className="text-muted-foreground"> · {company?.company_name_en} · {tr('CR', 'س.ت')} {company?.commercial_registration_number}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{tr('Financial year', 'السنة المالية')} <span className="text-destructive">*</span></Label>
          <Select value={data.financial_year || ''} onValueChange={(v) => update({ financial_year: v })}>
            <SelectTrigger data-testid="wizard-financial-year"><SelectValue placeholder={tr('Select year', 'اختر السنة')} /></SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{tr('Self-calculated contribution amount (KWD, optional)', 'مبلغ المساهمة المحتسب ذاتياً (د.ك، اختياري)')}</Label>
          <Input
            type="number" min="0" step="0.001" data-testid="wizard-declared-amount"
            value={data.declared_amount ?? ''}
            onChange={(e) => update({ declared_amount: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">{tr('The final amount is calculated and approved by the Contributions Unit.', 'يتم احتساب المبلغ النهائي واعتماده من وحدة المساهمات.')}</p>
        </div>
      </div>
    </div>
  );
}
