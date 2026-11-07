import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDateTime } from '@/lib/tr';
import StatusBadge from '@/components/review/StatusBadge';
import ComposeDialog from '@/components/comms/ComposeDialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, PenSquare } from 'lucide-react';

// Lists communication threads for a company and/or application, with Compose for internal users.
export default function ThreadsPanel({ companyId, applicationId }) {
  const tr = useTr();
  const { user } = useAuth();
  const internal = user?.role && user.role !== 'company_representative';
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = applicationId ? { application_id: applicationId } : companyId ? { company_id: companyId } : {};
      const res = await base44.entities.CommunicationThread.filter(q, { sort: '-last_activity', limit: 100 });
      setThreads(res.items || []);
    } catch {
      setThreads([]);
    }
    setLoading(false);
  }, [companyId, applicationId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3" data-testid="threads-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary"><Mail className="h-4 w-4" /> {tr('Communications', 'المراسلات')}</h3>
        {internal && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCompose(true)} data-testid="threads-compose">
            <PenSquare className="h-4 w-4" /> {tr('Compose', 'رسالة جديدة')}
          </Button>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : threads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">{tr('No communications yet', 'لا توجد مراسلات بعد')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {threads.map((t) => (
            <li key={t.id}>
              <Link to={`/inbox/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-muted/40">
                <div className="min-w-[9rem] flex-1">
                  <p className={`text-sm [overflow-wrap:anywhere] ${t.status === 'replied' ? 'font-semibold' : 'font-medium'}`}>{t.subject}</p>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{t.thread_reference} · {t.assigned_officer_name || '—'} · {fmtDateTime(t.last_activity || t.updated_date)}</p>
                </div>
                <StatusBadge value={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {internal && (
        <ComposeDialog open={compose} onOpenChange={setCompose} companyId={companyId} applicationId={applicationId} />
      )}
    </div>
  );
}
