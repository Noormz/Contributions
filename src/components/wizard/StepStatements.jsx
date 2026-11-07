import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg, fmtDate } from '@/lib/tr';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FileUpload from '@/components/common/FileUpload';
import { DocLink, Notice } from '@/components/application/shared';
import { Plus, Trash2, Loader2 } from 'lucide-react';

const blank = (year) => ({ document_name: '', document_type: 'Audited', financial_year: year || '', statement_start_date: year ? `${year}-01-01` : '', statement_end_date: year ? `${year}-12-31` : '', file_url: '', filename: '' });

export default function StepStatements({ appId, company, financialYear, statements, reload }) {
  const tr = useTr();
  const [form, setForm] = useState(blank(financialYear));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async () => {
    setError('');
    if (!form.document_name.trim() || !form.financial_year || !form.statement_end_date || !form.file_url) {
      setError(tr('Document name, financial year, statement end date and the file are required.', 'اسم المستند والسنة المالية وتاريخ نهاية البيان والملف مطلوبة.'));
      return;
    }
    if (form.statement_start_date && form.statement_start_date > form.statement_end_date) {
      setError(tr('The statement start date must be before the end date.', 'يجب أن يكون تاريخ بداية البيان قبل تاريخ نهايته.'));
      return;
    }
    setSaving(true);
    try {
      await base44.entities.FinancialStatement.create({
        application_id: appId, company_id: company.id, financial_year: form.financial_year,
        statement_start_date: form.statement_start_date || undefined, statement_end_date: form.statement_end_date,
        document_name: form.document_name.trim(), document_type: form.document_type, file_url: form.file_url, review_status: 'pending',
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
    try { await base44.entities.FinancialStatement.delete(s.id); await reload(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="space-y-5" data-testid="step-statements">
      <p className="text-sm text-muted-foreground">
        {tr('Upload one or more financial statements. Each statement needs its financial year and statement end date.', 'ارفع بياناً مالياً واحداً أو أكثر. يجب تحديد السنة المالية وتاريخ نهاية البيان لكل بيان.')}
      </p>

      {statements.length === 0 ? (
        <Notice tone="warning">{tr('No financial statements uploaded yet. At least one is required.', 'لم يتم رفع أي بيانات مالية بعد. مطلوب بيان واحد على الأقل.')}</Notice>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border px-4" data-testid="statement-list">
          {statements.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <DocLink url={s.file_url} name={s.document_name} sub={`${tr('FY', 'س.م')} ${s.financial_year} · ${fmtDate(s.statement_start_date)} → ${fmtDate(s.statement_end_date)}${s.document_type ? ` · ${s.document_type}` : ''}`} />
              </div>
              <button type="button" onClick={() => remove(s)} className="text-destructive hover:opacity-70" aria-label={tr('Remove', 'إزالة')}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-semibold">{tr('Add a financial statement', 'إضافة بيان مالي')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tr('Document name', 'اسم المستند')} *</Label>
            <Input value={form.document_name} onChange={set('document_name')} data-testid="fs-name" placeholder={tr('e.g. Audited financial statements 2024', 'مثال: البيانات المالية المدققة 2024')} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Financial year', 'السنة المالية')} *</Label>
            <Input value={form.financial_year} onChange={set('financial_year')} data-testid="fs-year" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Statement start date', 'تاريخ بداية البيان')}</Label>
            <Input type="date" value={form.statement_start_date} onChange={set('statement_start_date')} data-testid="fs-start" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Statement end date', 'تاريخ نهاية البيان')} *</Label>
            <Input type="date" value={form.statement_end_date} onChange={set('statement_end_date')} data-testid="fs-end" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Statement type', 'نوع البيان')}</Label>
            <Input value={form.document_type} onChange={set('document_type')} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('File', 'الملف')} *</Label>
            <FileUpload testId="fs-file" value={form.file_url} valueName={form.filename} onClear={() => setForm({ ...form, file_url: '', filename: '' })} onUploaded={(r) => setForm((f) => ({ ...f, file_url: r.file_url, filename: r.filename, document_name: f.document_name || r.filename.replace(/\.[^.]+$/, '') }))} />
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={saving} className="gap-1.5" data-testid="fs-add">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {tr('Add statement', 'إضافة البيان')}
        </Button>
      </div>
    </div>
  );
}
