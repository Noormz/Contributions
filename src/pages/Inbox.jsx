import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDateTime, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import ComposeDialog from '@/components/comms/ComposeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Inbox as InboxIcon, PenSquare, Search, AlertTriangle } from 'lucide-react';

const ALL = 'all';
const STATUSES = ['open', 'awaiting_company', 'replied', 'closed', 'unmatched'];

export default function Inbox() {
  const tr = useTr();
  const { language } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const internal = user?.role && user.role !== 'company_representative';
  const [threads, setThreads] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [company, setCompany] = useState(ALL);
  const [officer, setOfficer] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [compose, setCompose] = useState(false);

  useEffect(() => { const id = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(id); }, [search]);

  useEffect(() => {
    if (!internal) return;
    base44.entities.Company.filter({}, { sort: 'company_name_en', limit: 1000 }).then((r) => setCompanies(r.items || [])).catch(() => {});
    base44.functions.invoke('listOfficers').then((r) => setOfficers(Array.isArray(r) ? r : [])).catch(() => {});
  }, [internal]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = {};
      if (company !== ALL) q.company_id = company;
      if (officer !== ALL) q.assigned_officer_id = officer;
      q.status = status !== ALL ? status : { $ne: 'unmatched' };
      if (debounced) {
        const esc = debounced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        q.$or = ['thread_reference', 'application_reference', 'subject', 'company_name'].map((k) => ({ [k]: { $regex: esc, $options: 'i' } }));
      }
      const res = await base44.entities.CommunicationThread.filter(q, { sort: '-last_activity', limit: 200 });
      setThreads(res.items || []);
      if (internal) {
        const um = await base44.entities.CommunicationThread.filter({ status: 'unmatched' }, { sort: '-last_activity', limit: 50 });
        setUnmatched(um.items || []);
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [company, officer, status, debounced, internal]);

  useEffect(() => { load(); }, [load]);

  const Row = ({ t }) => (
    <tr className={`cursor-pointer transition-colors hover:bg-muted/30 ${t.status === 'replied' ? 'bg-accent/5' : ''}`} onClick={() => navigate(`/inbox/${t.id}`)} data-testid="thread-row">
      <td className="whitespace-nowrap px-4 py-3">
        <Link to={`/inbox/${t.id}`} className={`text-accent hover:underline ${t.status === 'replied' ? 'font-bold' : 'font-medium'}`} onClick={(e) => e.stopPropagation()}>{t.thread_reference}</Link>
      </td>
      <td className="min-w-[14rem] max-w-[22rem] px-4 py-3"><p className={`break-words ${t.status === 'replied' ? 'font-semibold' : ''}`}>{t.subject}</p></td>
      <td className="min-w-[10rem] break-words px-4 py-3">{t.company_name || '—'}</td>
      <td className="whitespace-nowrap px-4 py-3">{t.application_reference || '—'}</td>
      {internal && <td className="min-w-[8rem] break-words px-4 py-3">{t.assigned_officer_name || '—'}</td>}
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDateTime(t.last_activity || t.updated_date)}</td>
      <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={internal ? tr('Communication Inbox', 'صندوق المراسلات') : tr('Messages', 'الرسائل')}
        subtitle={internal ? tr('All emails sent through the portal and company replies, threaded by reference.', 'جميع الرسائل المرسلة عبر البوابة وردود الشركات مرتبة حسب المرجع.') : tr('Messages from the Contributions Unit. Open a thread to reply.', 'رسائل وحدة المساهمات. افتح المحادثة للرد.')}
        crumbs={[{ label: internal ? tr('Communication Inbox', 'صندوق المراسلات') : tr('Messages', 'الرسائل') }]}
        actions={internal && <Button className="gap-1.5" onClick={() => setCompose(true)} data-testid="inbox-compose"><PenSquare className="h-4 w-4" /> {tr('Compose', 'رسالة جديدة')}</Button>}
      />

      {internal && unmatched.length > 0 && status !== 'unmatched' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" data-testid="unmatched-section">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> {tr(`Unmatched emails (${unmatched.length})`, `رسائل غير مطابقة (${unmatched.length})`)}</h2>
          <p className="mb-2 text-xs text-muted-foreground">{tr('These replies had no valid thread reference. Open one to link it to the correct thread.', 'لم تتضمن هذه الردود مرجعاً صحيحاً. افتحها لربطها بالمحادثة الصحيحة.')}</p>
          <ul className="space-y-1">
            {unmatched.map((t) => (
              <li key={t.id}><Link to={`/inbox/${t.id}`} className="text-sm text-foreground hover:underline">{t.subject} — <span className="text-muted-foreground">{t.company_name} · {fmtDateTime(t.last_activity)}</span></Link></li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" placeholder={tr('Search reference, application, subject…', 'ابحث بالمرجع أو الطلب أو الموضوع…')} data-testid="inbox-search" />
        </div>
        {internal && (
          <>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tr('All companies', 'كل الشركات')}</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{language === 'ar' ? c.company_name_ar || c.company_name_en : c.company_name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={officer} onValueChange={setOfficer}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tr('All officers', 'كل الموظفين')}</SelectItem>
                {officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name || o.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="inbox-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr('All statuses', 'كل الحالات')}</SelectItem>
            {STATUSES.filter((s) => internal || s !== 'unmatched').map((s) => <SelectItem key={s} value={s}><StatusBadge value={s} /></SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[tr('Reference', 'المرجع'), tr('Subject', 'الموضوع'), tr('Company', 'الشركة'), tr('Application', 'الطلب'), ...(internal ? [tr('Officer', 'الموظف')] : []), tr('Last activity', 'آخر نشاط'), tr('Status', 'الحالة')].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-start font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="py-16 text-center text-destructive">{error} <Button variant="link" onClick={load}>{tr('Retry', 'إعادة المحاولة')}</Button></td></tr>
              ) : threads.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground"><InboxIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />{tr('No messages found', 'لا توجد رسائل')}</td></tr>
              ) : threads.map((t) => <Row key={t.id} t={t} />)}
            </tbody>
          </table>
        </div>
      </div>

      {internal && <ComposeDialog open={compose} onOpenChange={setCompose} />}
    </div>
  );
}
