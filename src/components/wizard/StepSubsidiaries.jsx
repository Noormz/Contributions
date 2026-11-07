import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg, fmtDate } from '@/lib/tr';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import FileUpload from '@/components/common/FileUpload';
import { Notice } from '@/components/application/shared';
import { Plus, Trash2, Loader2 } from 'lucide-react';

const blank = (year) => ({ subsidiary_name: '', ownership_percentage: '', financial_year: year || '', financial_statement_end_date: '', income_statement_page: '', supporting_document: '', filename: '', statement_incomplete: false, statement_incomplete_reason: '' });

export default function StepSubsidiaries({ appId, company, financialYear, subsidiaries, reload }) {
  const tr = useTr();
  const [form, setForm] = useState(blank(financialYear));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async () => {
    setError('');
    const pct = Number(form.ownership_percentage);
    if (!form.subsidiary_name.trim() || form.ownership_percentage === '' || !(pct > 0 && pct <= 100)) {
      setError(tr('Subsidiary name and an ownership percentage between 0 and 100 are required.', 'اسم الشركة التابعة ونسبة ملكية بين 0 و100 مطلوبة.'));
      return;
    }
    if (!form.financial_year) { setError(tr('Financial year is required.', 'السنة المالية مطلوبة.')); return; }
    if (form.statement_incomplete && !form.statement_incomplete_reason.trim()) {
      setError(tr('Explain why the subsidiary financial statement is incomplete or unavailable.', 'وضح سبب عدم اكتمال أو توفر البيان المالي للشركة التابعة.'));
      return;
    }
    if (!form.statement_incomplete && !form.financial_statement_end_date) {
      setError(tr('Statement end date is required (or tick that the statement is not yet available).', 'تاريخ نهاية البيان مطلوب (أو حدد أن البيان غير متوفر بعد).'));
      return;
    }
    setSaving(true);
    try {
      await base44.entities.SubsidiaryDeclaration.create({
        application_id: appId, company_id: company.id, subsidiary_name: form.subsidiary_name.trim(), ownership_percentage: pct,
        financial_year: form.financial_year, financial_statement_end_date: form.financial_statement_end_date || undefined,
        income_statement_page: form.income_statement_page, supporting_document: form.supporting_document,
        statement_incomplete: !!form.statement_incomplete, statement_incomplete_reason: form.statement_incomplete_reason,
      });
      setForm(blank(financialYear));
      await reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    try { await base44.entities.SubsidiaryDeclaration.delete(s.id); await reload(); } catch (e) { setError(errMsg(e)); }
  };

  const partial = subsidiaries.some((s) => s.statement_incomplete);

  return (
    <div className="space-y-5" data-testid="step-subsidiaries">
      <p className="text-sm text-muted-foreground">
        {tr('Declare shareholding subsidiaries included in the financial statements. Skip this step if not applicable.', 'صرّح بالشركات التابعة المدرجة في البيانات المالية. تجاوز هذه الخطوة إن لم تنطبق.')}
      </p>

      {subsidiaries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-testid="subsidiary-list">
            <thead className="bg-muted/50">
              <tr>
                {[tr('Subsidiary', 'الشركة التابعة'), tr('Ownership', 'الملكية'), tr('FY', 'س.م'), tr('Statement end', 'نهاية البيان'), tr('Income stmt. page', 'صفحة قائمة الدخل'), tr('Document', 'المستند'), ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-start font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subsidiaries.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2">
                    {s.subsidiary_name}
                    {s.statement_incomplete && <span className="ms-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{tr('Statement incomplete', 'البيان غير مكتمل')}</span>}
                  </td>
                  <td className="px-3 py-2">{s.ownership_percentage}%</td>
                  <td className="px-3 py-2">{s.financial_year || '—'}</td>
                  <td className="px-3 py-2">{fmtDate(s.financial_statement_end_date)}</td>
                  <td className="px-3 py-2">{s.income_statement_page || '—'}</td>
                  <td className="px-3 py-2">{s.supporting_document ? <a href={s.supporting_document} target="_blank" rel="noreferrer" className="text-accent hover:underline">{tr('View', 'عرض')}</a> : '—'}</td>
                  <td className="px-3 py-2 text-end">
                    <button type="button" onClick={() => remove(s)} className="text-destructive hover:opacity-70" aria-label={tr('Remove', 'إزالة')}><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {partial && (
        <Notice tone="warning" testId="partial-notice">
          {tr('One or more subsidiary statements are incomplete. The contribution will be calculated as a partial calculation and updated when the documents are available.', 'بيان أو أكثر من بيانات الشركات التابعة غير مكتمل. سيتم احتساب المساهمة بشكل جزئي وتحديثها عند توفر المستندات.')}
        </Notice>
      )}

      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-semibold">{tr('Add a subsidiary', 'إضافة شركة تابعة')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tr('Subsidiary name', 'اسم الشركة التابعة')} *</Label>
            <Input value={form.subsidiary_name} onChange={set('subsidiary_name')} data-testid="sub-name" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Ownership %', 'نسبة الملكية %')} *</Label>
            <Input type="number" min="0" max="100" step="0.01" value={form.ownership_percentage} onChange={set('ownership_percentage')} data-testid="sub-pct" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Financial year', 'السنة المالية')} *</Label>
            <Input value={form.financial_year} onChange={set('financial_year')} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Statement end date', 'تاريخ نهاية البيان')}</Label>
            <Input type="date" value={form.financial_statement_end_date} onChange={set('financial_statement_end_date')} data-testid="sub-end" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Income statement page', 'صفحة قائمة الدخل')}</Label>
            <Input value={form.income_statement_page} onChange={set('income_statement_page')} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Supporting document', 'مستند داعم')}</Label>
            <FileUpload value={form.supporting_document} valueName={form.filename} onClear={() => setForm({ ...form, supporting_document: '', filename: '' })} onUploaded={(r) => setForm((f) => ({ ...f, supporting_document: r.file_url, filename: r.filename }))} />
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox checked={form.statement_incomplete} onCheckedChange={(v) => setForm({ ...form, statement_incomplete: !!v })} data-testid="sub-incomplete" />
          <span className="text-sm">{tr('Subsidiary financial statement is incomplete / not yet available', 'البيان المالي للشركة التابعة غير مكتمل / غير متوفر بعد')}</span>
        </label>
        {form.statement_incomplete && (
          <Input placeholder={tr('Reason and expected availability date', 'السبب والتاريخ المتوقع للتوفر')} value={form.statement_incomplete_reason} onChange={set('statement_incomplete_reason')} data-testid="sub-incomplete-reason" />
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={saving} className="gap-1.5" data-testid="sub-add">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {tr('Add subsidiary', 'إضافة الشركة التابعة')}
        </Button>
      </div>
    </div>
  );
}
