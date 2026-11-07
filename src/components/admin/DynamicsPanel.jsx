import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg, fmtDateTime } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CloudUpload, CheckCircle2, AlertTriangle } from 'lucide-react';

// Shows the Dynamics 365 (Dataverse) connection: queued changes, failures and last sync times.
export default function DynamicsPanel() {
  const tr = useTr();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setS(await base44.api.get('/api/admin/dataverse')); } catch (e) { setMsg(errMsg(e)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const pushAll = async () => {
    setBusy(true); setMsg('');
    try { const r = await base44.api.post('/api/admin/dataverse/push-all'); setMsg(tr(`${r.queued} records queued for Dynamics.`, `تمت جدولة ${r.queued} سجل للإرسال إلى Dynamics.`)); await load(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };

  if (!s) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr('Loading…', 'جارٍ التحميل…')}</div>;

  const Row = ({ label, value }) => (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="font-medium text-end">{value}</span></div>
  );

  return (
    <div className="space-y-4" data-testid="dynamics-panel">
      <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${s.configured ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
        {s.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
        <p>
          {s.configured
            ? tr('Connected to Dynamics. Every portal change is sent automatically; staff actions from the Dynamics apps are run by the portal.', 'متصل بـ Dynamics. تُرسل كل تغييرات البوابة تلقائياً، وتنفذ البوابة الإجراءات التي يطلبها الموظفون من تطبيقات Dynamics.')
            : tr('Dynamics is not connected. Set DATAVERSE_URL, DATAVERSE_TENANT_ID, DATAVERSE_CLIENT_ID and DATAVERSE_CLIENT_SECRET on the server (see docs/DYNAMICS.md).', 'Dynamics غير متصل. اضبط DATAVERSE_URL وDATAVERSE_TENANT_ID وDATAVERSE_CLIENT_ID وDATAVERSE_CLIENT_SECRET على الخادم (راجع docs/DYNAMICS.md).')}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <Row label={tr('Environment', 'البيئة')} value={s.url || '—'} />
        <Row label={tr('Changes waiting to be sent', 'تغييرات بانتظار الإرسال')} value={s.pending} />
        <Row label={tr('Last successful send', 'آخر إرسال ناجح')} value={fmtDateTime(s.lastPushOk)} />
        <Row label={tr('Last check for staff edits', 'آخر فحص لتعديلات الموظفين')} value={fmtDateTime(s.lastPullOk)} />
        {s.lastError && <Row label={tr('Last error', 'آخر خطأ')} value={<span className="text-destructive">{s.lastError}</span>} />}
      </div>
      {s.failing?.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">{tr('Records being retried', 'سجلات قيد إعادة المحاولة')}</h3>
          <ul className="space-y-1 text-xs">
            {s.failing.map((f) => <li key={`${f.entity}-${f.id}`}><span className="font-medium">{f.entity}</span> {f.id} · {tr('attempts', 'محاولات')} {f.attempts} · <span className="text-muted-foreground">{f.last_error}</span></li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={load}><RefreshCw className="me-2 h-4 w-4" />{tr('Refresh', 'تحديث')}</Button>
        <Button onClick={pushAll} disabled={busy}>{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CloudUpload className="me-2 h-4 w-4" />}{tr('Send all records to Dynamics', 'إرسال كل السجلات إلى Dynamics')}</Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground" role="status">{msg}</p>}
    </div>
  );
}
