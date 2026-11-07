import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg } from '@/lib/tr';
import { Loader2, Paperclip, UploadCloud, X } from 'lucide-react';

/**
 * Drag-and-drop / click upload. Uploads immediately and calls onUploaded({file_url, filename, size, mime, id}).
 * Pass `value` (a file_url) to show the current file with a remove button.
 */
export default function FileUpload({ onUploaded, value, valueName, onClear, companyId, accept, label, required, disabled, testId }) {
  const tr = useTr();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file, company_id: companyId });
      onUploaded?.(res);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
        <a href={value} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-accent hover:underline [overflow-wrap:anywhere]">{valueName || tr('View file', 'عرض الملف')}</a>
        {onClear && !disabled && (
          <button type="button" onClick={onClear} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={tr('Remove file', 'إزالة الملف')}><X className="h-4 w-4" /></button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        data-testid={testId}
        disabled={busy || disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition-colors ${drag ? 'border-accent bg-accent/5' : 'border-border hover:bg-muted/40'} ${required ? 'border-warning/60' : ''}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 text-muted-foreground" />}
        <span className="text-muted-foreground">{label || tr('Click or drop a file to upload', 'انقر أو اسحب ملفاً للرفع')}</span>
      </button>
      <input ref={input} type="file" className="hidden" accept={accept || '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'} onChange={(e) => handle(e.target.files?.[0])} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
