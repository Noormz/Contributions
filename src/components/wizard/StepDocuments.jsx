import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg } from '@/lib/tr';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import FileUpload from '@/components/common/FileUpload';
import { DocLink, Notice } from '@/components/application/shared';
import { Trash2 } from 'lucide-react';

export async function addAppDocument({ appId, company, category, file, description, payment_method }) {
  return base44.entities.ApplicationDocument.create({
    application_id: appId, company_id: company.id, category, description: description || file.filename,
    filename: file.filename, file_url: file.file_url, file_size: file.size, mime: file.mime, payment_method: payment_method || '',
  });
}

export function DocRows({ docs, onRemove }) {
  const tr = useTr();
  if (!docs.length) return null;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border px-4">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><DocLink url={d.file_url} name={d.description || d.filename} sub={d.filename} /></div>
          {onRemove && <button type="button" onClick={() => onRemove(d)} className="text-destructive hover:opacity-70" aria-label={tr('Remove', 'إزالة')}><Trash2 className="h-4 w-4" /></button>}
        </li>
      ))}
    </ul>
  );
}

export default function StepDocuments({ appId, company, docs, reload, data, update }) {
  const tr = useTr();
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const working = docs.filter((d) => d.category === 'calculation_working');
  const extra = docs.filter((d) => d.category === 'additional');

  const add = async (category, file, description) => {
    setError('');
    try {
      await addAppDocument({ appId, company, category, file, description });
      if (category === 'additional') setDesc('');
      await reload();
    } catch (e) { setError(errMsg(e)); }
  };
  const remove = async (d) => {
    try { await base44.entities.ApplicationDocument.delete(d.id); await reload(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="space-y-6" data-testid="step-documents">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{tr('Calculation working (optional)', 'ورقة عمل الحساب (اختياري)')}</h3>
        <p className="text-xs text-muted-foreground">{tr('Attach your own contribution calculation working if available.', 'أرفق ورقة عمل احتساب المساهمة الخاصة بكم إن وجدت.')}</p>
        <DocRows docs={working} onRemove={remove} />
        <FileUpload testId="calc-working-upload" onUploaded={(f) => add('calculation_working', f, tr('Calculation working', 'ورقة عمل الحساب'))} label={tr('Upload calculation working', 'رفع ورقة عمل الحساب')} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{tr('Additional attachments', 'مرفقات إضافية')}</h3>
        <DocRows docs={extra} onRemove={remove} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr]">
          <Input placeholder={tr('Description of the document', 'وصف المستند')} value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="extra-desc" />
          <FileUpload testId="extra-upload" onUploaded={(f) => add('additional', f, desc)} label={tr('Upload attachment', 'رفع مرفق')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{tr('Additional information / explanations', 'معلومات أو إيضاحات إضافية')}</Label>
        <Textarea rows={5} value={data.additional_comments || ''} onChange={(e) => update({ additional_comments: e.target.value })} data-testid="additional-comments" />
        <p className="text-xs text-muted-foreground">{tr('Visible to the Contributions Unit reviewers.', 'تظهر لمراجعي وحدة المساهمات.')}</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
