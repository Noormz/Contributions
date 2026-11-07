import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { Loader2, History } from 'lucide-react';

export default function ActivityTimeline({ entityName, recordId }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const entries = [];
    try {
      const audit = await base44.entities.AuditLog.filter(
        { entity_type: entityName, record_id: recordId },
        { sort: '-created_date', limit: 50 }
      );
      (audit.items || []).forEach((a) => {
        entries.push({
          id: a.id, date: a.created_date,
          label: a.action,
          detail: [a.previous_value, a.new_value].filter(Boolean).join(' → '),
          by: a.user_email || a.user_id || '',
        });
      });
    } catch (e) { /* permission-limited roles simply see no audit rows */ }
    try {
      const hist = await base44.entities.ApprovalHistory.filter(
        { application_id: recordId },
        { sort: '-created_date', limit: 50 }
      );
      (hist.items || []).forEach((h) => {
        entries.push({
          id: `ah-${h.id}`, date: h.created_date,
          label: h.action,
          detail: [h.previous_status, h.new_status].filter(Boolean).join(' → ') + (h.comments ? ` — ${h.comments}` : ''),
          by: h.action_by_name || '',
        });
      });
    } catch (e) { /* ignore */ }
    entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    setEvents(entries);
    setLoading(false);
  }, [entityName, recordId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <p className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></p>;
  }
  if (events.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <History className="h-4 w-4 opacity-50" /> {t('rec_history_empty')}
      </p>
    );
  }
  return (
    <ol className="relative space-y-4 border-s border-border ps-5">
      {events.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -start-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary/70" />
          <p className="text-sm font-semibold capitalize">{String(ev.label || '').replace(/_/g, ' ')}</p>
          {ev.detail && <p className="text-xs text-muted-foreground">{ev.detail}</p>}
          <p className="text-xs text-muted-foreground">
            {ev.date ? new Date(ev.date).toLocaleString('en-GB') : ''}{ev.by ? ` · ${ev.by}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}