import React from 'react';
import { useTr, fmtMoney, fmtDate, PAYMENT_METHODS } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PROFILE_FIELDS, Notice } from '@/components/application/shared';
import { Pencil, FileText } from 'lucide-react';

function Section({ title, step, goTo, children }) {
  const tr = useTr();
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
        <span className="text-sm font-semibold">{title}</span>
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-accent" onClick={() => goTo(step)}><Pencil className="h-3.5 w-3.5" /> {tr('Edit', 'تعديل')}</Button>
      </div>
      <div className="px-4 py-3 text-sm">{children}</div>
    </div>
  );
}

export default function StepReview({ data, update, company, statements, subsidiaries, docs, goTo, issues }) {
  const tr = useTr();
  const acks = data.acknowledgements || {};
  const setAck = (k, v) => update({ acknowledgements: { ...acks, [k]: v } });
  const changes = data.profile_changes || {};
  const pm = (m) => { const p = PAYMENT_METHODS.find((x) => x.value === m); return p ? tr(p.en, p.ar) : m; };
  const list = (items) => (items.length ? (
    <ul className="space-y-1">{items.map((d) => <li key={d.id} className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{d.label}</li>)}</ul>
  ) : <span className="text-muted-foreground">—</span>);

  return (
    <div className="space-y-4" data-testid="step-review">
      <p className="text-sm text-muted-foreground">{tr('Review your application before submitting.', 'راجع طلبك قبل الإرسال.')}</p>
      {issues.length > 0 && (
        <Notice tone="error" testId="review-issues">
          <p className="font-semibold">{tr('Please complete the following before submitting:', 'يرجى استكمال ما يلي قبل الإرسال:')}</p>
          <ul className="ms-5 list-disc">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </Notice>
      )}
      <Section title={tr('Basic information', 'المعلومات الأساسية')} step={0} goTo={goTo}>
        <p>{tr('Financial year', 'السنة المالية')}: <strong>{data.financial_year || '—'}</strong></p>
        <p>{tr('Self-calculated amount', 'المبلغ المحتسب ذاتياً')}: {data.declared_amount ? fmtMoney(data.declared_amount) : '—'}</p>
      </Section>
      <Section title={tr('Financial statements', 'البيانات المالية')} step={1} goTo={goTo}>
        {list(statements.map((s) => ({ id: s.id, label: `${s.document_name} — ${tr('FY', 'س.م')} ${s.financial_year}, ${tr('ends', 'ينتهي')} ${fmtDate(s.statement_end_date)}` })))}
      </Section>
      <Section title={tr('Company profile', 'ملف الشركة')} step={2} goTo={goTo}>
        <p>{company.company_name_ar} · {company.company_name_en}</p>
        {Object.keys(changes).length > 0 ? (
          <ul className="mt-2 space-y-1">
            {Object.entries(changes).map(([k, v]) => {
              const f = PROFILE_FIELDS.find((x) => x[0] === k);
              return <li key={k}>{f ? tr(f[1], f[2]) : k}: <span className="text-muted-foreground line-through">{String(company[k] ?? '—')}</span> → <strong>{String(v)}</strong></li>;
            })}
          </ul>
        ) : <p className="text-muted-foreground">{tr('No changes requested.', 'لا توجد تعديلات مطلوبة.')}</p>}
        <p className="mt-2">{data.profile_confirmed ? tr('✓ Profile confirmed as up to date', '✓ تم تأكيد أن الملف محدث') : tr('✗ Profile not yet confirmed', '✗ لم يتم تأكيد الملف بعد')}</p>
      </Section>
      <Section title={tr('Subsidiaries', 'الشركات التابعة')} step={3} goTo={goTo}>
        {subsidiaries.length ? subsidiaries.map((s) => <p key={s.id}>{s.subsidiary_name} · {s.ownership_percentage}%{s.statement_incomplete ? ` · ${tr('statement incomplete', 'البيان غير مكتمل')}` : ''}</p>) : <span className="text-muted-foreground">{tr('None declared', 'لا يوجد')}</span>}
        {data.partial_calculation && <p className="mt-2 text-warning">{tr('Partial calculation will apply.', 'سيتم تطبيق احتساب جزئي.')}</p>}
      </Section>
      <Section title={tr('Documents & additional information', 'المستندات والمعلومات الإضافية')} step={4} goTo={goTo}>
        {list(docs.filter((d) => ['calculation_working', 'additional'].includes(d.category)).map((d) => ({ id: d.id, label: d.description || d.filename })))}
        {data.additional_comments && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{data.additional_comments}</p>}
      </Section>
      <Section title={tr('Payment', 'الدفع')} step={5} goTo={goTo}>
        <p>{(data.payment_methods || []).map(pm).join(tr(', ', '، ')) || '—'}</p>
        {list(docs.filter((d) => d.category === 'payment_evidence').map((d) => ({ id: d.id, label: `${pm(d.payment_method)}: ${d.filename}` })))}
      </Section>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox checked={!!acks.accuracy} onCheckedChange={(v) => setAck('accuracy', !!v)} data-testid="ack-accuracy" />
          <span className="text-sm">{tr('I confirm that all information and documents provided are true, complete and accurate.', 'أؤكد أن جميع المعلومات والمستندات المقدمة صحيحة وكاملة ودقيقة.')} <span className="text-destructive">*</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox checked={!!acks.terms} onCheckedChange={(v) => setAck('terms', !!v)} data-testid="ack-terms" />
          <span className="text-sm">{tr('I acknowledge that the contribution will be calculated by the Contributions Unit and that payment must be settled according to the applicable regulations.', 'أقر بأن المساهمة ستُحتسب من قبل وحدة المساهمات وأن السداد يجب أن يتم وفق اللوائح المعمول بها.')} <span className="text-destructive">*</span></span>
        </label>
      </div>
    </div>
  );
}
