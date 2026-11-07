import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDateTime, errMsg } from '@/lib/tr';
import StatusBadge from '@/components/review/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, MessageSquareReply } from 'lucide-react';

const RESPONDERS = ['contributions_officer', 'contributions_manager', 'system_admin'];

// Officer response form for an Inquiry; company users see the response read-only.
export default function InquiryRespond({ record, reload }) {
  const tr = useTr();
  const { user } = useAuth();
  const [response, setResponse] = useState(record.response || '');
  const [close, setClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const canRespond = RESPONDERS.includes(user?.role) && record.status !== 'closed';

  const submit = async () => {
    if (!response.trim()) { setMsg({ kind: 'error', text: tr('Enter a response.', 'أدخل الرد.') }); return; }
    setSaving(true);
    setMsg(null);
    try {
      await base44.functions.invoke('respondInquiry', { inquiry_id: record.id, response: response.trim(), close });
      setMsg({ kind: 'success', text: tr('Response sent to the company.', 'تم إرسال الرد إلى الشركة.') });
      reload?.();
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="inquiry-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
          <MessageSquareReply className="h-4 w-4" /> {tr('Response', 'الرد')}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge value={record.status} />
          {record.response_date && <span>{fmtDateTime(record.response_date)}{record.assigned_officer_name ? ` · ${record.assigned_officer_name}` : ''}</span>}
        </div>
      </div>

      {canRespond ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inq-response">{record.response ? tr('Update response', 'تحديث الرد') : tr('Reply to the company', 'الرد على الشركة')}</Label>
            <Textarea id="inq-response" rows={4} value={response} onChange={(e) => setResponse(e.target.value)} data-testid="inquiry-response" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={close} onCheckedChange={(v) => setClose(!!v)} data-testid="inquiry-close" />
            {tr('Close the inquiry after responding', 'إغلاق الاستفسار بعد الرد')}
          </label>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={saving} className="gap-1.5" data-testid="inquiry-send">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {tr('Send response', 'إرسال الرد')}
            </Button>
          </div>
        </div>
      ) : record.response ? (
        <p className="whitespace-pre-wrap text-sm" data-testid="inquiry-response-text">{record.response}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{tr('The Contributions Unit has not responded yet.', 'لم ترد وحدة المساهمات بعد.')}</p>
      )}
      {msg && <div className={`mt-3 rounded-lg p-3 text-sm ${msg.kind === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{msg.text}</div>}
    </div>
  );
}
