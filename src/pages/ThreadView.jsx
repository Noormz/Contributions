import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, fmtDateTime, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import FileUpload from '@/components/common/FileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2, AlertTriangle, ArrowDownLeft, ArrowUpRight, Paperclip, Send, EyeOff, MailPlus, Link2, Lock, Unlock, ChevronLeft,
} from 'lucide-react';

const splitEmails = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export default function ThreadView() {
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const { id } = useParams();
  const tr = useTr();
  const navigate = useNavigate();
  const { user } = useAuth();
  const internal = user?.role && user.role !== 'company_representative';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [simOpen, setSimOpen] = useState(false);
  const [sim, setSim] = useState({ from: '', subject: '', body: '' });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getThread', { thread_id: id });
      setData(res);
      const lastInbound = [...res.messages].reverse().find((m) => m.direction === 'inbound');
      setReplyTo(lastInbound?.from_address && lastInbound.from_address.includes('@') ? lastInbound.from_address : (res.company_contacts[0] || ''));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!linkOpen) return;
    const term = linkSearch.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = { status: { $ne: 'unmatched' }, ...(term ? { $or: [{ thread_reference: { $regex: term, $options: 'i' } }, { subject: { $regex: term, $options: 'i' } }, { company_name: { $regex: term, $options: 'i' } }] } : {}) };
    const h = setTimeout(() => base44.entities.CommunicationThread.filter(q, { sort: '-last_activity', limit: 20 }).then((r) => setLinkResults(r.items || [])).catch(() => setLinkResults([])), 250);
    return () => clearTimeout(h);
  }, [linkOpen, linkSearch]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertTriangle className="h-10 w-10 text-warning" />
        <p className="font-semibold">{error || tr('The requested conversation could not be found.', 'تعذر العثور على المحادثة.')}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/inbox')}>{tr('Back to inbox', 'العودة إلى الصندوق')}</Button>
      </div>
    );
  }

  const { thread, messages } = data;
  const unmatched = thread.status === 'unmatched';

  const send = async () => {
    if (!reply.trim()) return setReplyError(tr('Message is required.', 'الرسالة مطلوبة.'));
    const to = splitEmails(replyTo);
    const bad = to.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (internal && bad) return setReplyError(tr(`Invalid email address: ${bad}`, `بريد إلكتروني غير صالح: ${bad}`));
    setSending(true);
    setReplyError('');
    try {
      await base44.functions.invoke('sendThreadMessage', { thread_id: thread.id, body: reply, attachments: files.map((f) => f.id), to: internal ? to : [] });
      setReply('');
      setFiles([]);
      setFlash(tr('Message sent.', 'تم إرسال الرسالة.'));
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(''), 4000);
      await load();
    } catch (e) {
      setReplyError(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const openSim = () => {
    setSim({ from: data.company_contacts[0] || '', subject: `RE: ${thread.subject} [Ref: ${thread.thread_reference}]`, body: '' });
    setSimOpen(true);
  };
  const runSim = async () => {
    setBusy(true);
    try {
      const r = await base44.functions.invoke('simulateInboundEmail', sim);
      setSimOpen(false);
      if (r.thread_id && r.thread_id !== thread.id) navigate(`/inbox/${r.thread_id}`);
      else await load();
      setFlash(r.matched ? tr('Reply received and linked to this thread.', 'تم استلام الرد وربطه بهذه المحادثة.') : tr('No reference found — stored as an unmatched email.', 'لم يُعثر على مرجع — حُفظت كرسالة غير مطابقة.'));
    } catch (e) {
      setFlash(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try { await base44.entities.CommunicationThread.update(thread.id, { status }); await load(); } catch (e) { setFlash(errMsg(e)); } finally { setBusy(false); }
  };

  const linkTo = async (target) => {
    setBusy(true);
    try {
      for (const m of messages) await base44.functions.invoke('linkUnmatchedMessage', { message_id: m.id, thread_id: target.id });
      setLinkOpen(false);
      navigate(`/inbox/${target.id}`, { replace: true });
    } catch (e) {
      setFlash(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={thread.subject}
        crumbs={[{ label: internal ? tr('Communication Inbox', 'صندوق المراسلات') : tr('Messages', 'الرسائل'), to: '/inbox' }, { label: thread.thread_reference }]}
        actions={(
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/inbox')} className="gap-1"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {tr('Inbox', 'الصندوق')}</Button>
            {internal && !unmatched && <Button variant="outline" size="sm" className="gap-1.5" onClick={openSim} data-testid="simulate-reply"><MailPlus className="h-4 w-4" /> {tr('Simulate company reply by email', 'محاكاة رد الشركة بالبريد')}</Button>}
            {internal && unmatched && <Button size="sm" className="gap-1.5" onClick={() => { setLinkSearch(''); setLinkOpen(true); }} data-testid="link-thread"><Link2 className="h-4 w-4" /> {tr('Link to thread', 'ربط بمحادثة')}</Button>}
            {internal && !unmatched && (thread.status === 'closed'
              ? <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => setStatus('open')} data-testid="reopen-thread"><Unlock className="h-4 w-4" /> {tr('Reopen', 'إعادة فتح')}</Button>
              : <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => setStatus('closed')} data-testid="close-thread"><Lock className="h-4 w-4" /> {tr('Close thread', 'إغلاق المحادثة')}</Button>)}
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-sm sm:grid-cols-5">
        <Info label={tr('Reference', 'المرجع')} value={<span className="font-mono" data-testid="thread-reference">{thread.thread_reference}</span>} />
        <Info label={tr('Company', 'الشركة')} value={thread.company_id ? <Link className="text-accent hover:underline" to={internal ? `/companies/${thread.company_id}` : '/company-profile'}>{thread.company_name}</Link> : thread.company_name || '—'} />
        <Info label={tr('Application', 'الطلب')} value={thread.application_id ? <Link className="text-accent hover:underline" to={`/applications/${thread.application_id}`}>{thread.application_reference || tr('Open', 'فتح')}</Link> : '—'} />
        <Info label={tr('Officer', 'الموظف')} value={thread.assigned_officer_name || '—'} />
        <Info label={tr('Status', 'الحالة')} value={<StatusBadge value={thread.status} />} />
      </div>

      {flash && <div className="rounded-lg bg-success/10 p-3 text-sm text-success" role="status">{flash}</div>}

      <ol className="space-y-3" data-testid="thread-messages">
        {messages.map((m) => {
          const inbound = m.direction === 'inbound';
          return (
            <li key={m.id} className={`rounded-xl border p-4 shadow-sm ${inbound ? 'border-accent/30 bg-accent/5 sm:me-12' : 'border-border bg-card sm:ms-12'}`} data-testid="thread-message" data-direction={m.direction}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className={`inline-flex items-center gap-1 font-semibold ${inbound ? 'text-accent' : 'text-primary'}`}>
                  {inbound ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                  {inbound ? tr('Received', 'وارد') : tr('Sent', 'صادر')}
                </span>
                <span>{fmtDateTime(m.sent_date || m.created_date)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5">{m.channel === 'email' ? tr('via email', 'عبر البريد') : tr('via portal', 'عبر البوابة')}</span>
                {m.bcc_copy_sent && internal && <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-success" data-testid="bcc-indicator"><EyeOff className="h-3 w-3" /> {tr('BCC copy sent to officer', 'أرسلت نسخة مخفية للموظف')}</span>}
              </div>
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 text-xs">
                <dt className="text-muted-foreground">{tr('From', 'من')}:</dt><dd className="break-all">{m.sender_name && m.sender_name !== m.from_address ? `${m.sender_name} <${m.from_address}>` : m.from_address}</dd>
                {m.to_addresses && <><dt className="text-muted-foreground">{tr('To', 'إلى')}:</dt><dd className="break-all">{m.to_addresses}</dd></>}
                {m.cc_addresses && <><dt className="text-muted-foreground">CC:</dt><dd className="break-all">{m.cc_addresses}</dd></>}
                {internal && m.bcc_addresses && <><dt className="text-muted-foreground">BCC:</dt><dd className="break-all">{m.bcc_addresses}</dd></>}
                <dt className="text-muted-foreground">{tr('Subject', 'الموضوع')}:</dt><dd>{m.subject}</dd>
              </dl>
              <p className="mt-3 whitespace-pre-wrap text-sm">{m.body}</p>
              {m.attachments?.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={`${a.file_url}?download=1`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted" data-testid="message-attachment">
                        <Paperclip className="h-3.5 w-3.5" /> {a.filename}{a.file_size ? ` (${Math.ceil(a.file_size / 1024)} KB)` : ''}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {!unmatched && thread.status !== 'closed' && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">{tr('Reply', 'رد')}</h2>
          {internal && (
            <div className="space-y-1.5">
              <Label>{tr('To', 'إلى')}</Label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder={tr('Defaults to the company official email', 'افتراضياً البريد الرسمي للشركة')} data-testid="reply-to" />
            </div>
          )}
          <Textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tr('Write your reply…', 'اكتب ردك…')} data-testid="reply-body" />
          <div className="space-y-1.5">
            {files.map((f) => <FileUpload key={f.id} value={f.file_url} valueName={f.filename} onClear={() => setFiles((x) => x.filter((y) => y.id !== f.id))} />)}
            <FileUpload companyId={thread.company_id} onUploaded={(f) => setFiles((x) => [...x, f])} label={tr('Attach a file', 'إرفاق ملف')} />
          </div>
          {internal && <p className="text-xs text-muted-foreground">{tr(`The reference [Ref: ${thread.thread_reference}] is kept in the subject and a BCC copy is sent to you.`, `يبقى المرجع [Ref: ${thread.thread_reference}] في الموضوع وتُرسل لك نسخة مخفية.`)}</p>}
          {replyError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{replyError}</div>}
          <div className="flex justify-end">
            <Button onClick={send} disabled={sending} className="gap-1.5" data-testid="reply-send">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />} {tr('Send reply', 'إرسال الرد')}
            </Button>
          </div>
        </div>
      )}
      {thread.status === 'closed' && <p className="text-center text-sm text-muted-foreground">{tr('This conversation is closed.', 'هذه المحادثة مغلقة.')}</p>}

      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{tr('Simulate company reply by email', 'محاكاة رد الشركة بالبريد')}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{tr('Sends an email through the inbound reply path. The thread is matched by the [Ref: THR-…] token — remove it to test unmatched handling.', 'ترسل رسالة عبر مسار الردود الواردة. تتم المطابقة عبر الرمز [Ref: THR-…] — احذفه لاختبار الرسائل غير المطابقة.')}</p>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>{tr('From', 'من')}</Label><Input value={sim.from} onChange={(e) => setSim({ ...sim, from: e.target.value })} data-testid="sim-from" /></div>
            <div className="space-y-1.5"><Label>{tr('Subject', 'الموضوع')}</Label><Input value={sim.subject} onChange={(e) => setSim({ ...sim, subject: e.target.value })} data-testid="sim-subject" /></div>
            <div className="space-y-1.5"><Label>{tr('Body', 'النص')}</Label><Textarea rows={5} value={sim.body} onChange={(e) => setSim({ ...sim, body: e.target.value })} data-testid="sim-body" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={runSim} disabled={busy || !sim.from || !sim.body.trim()} data-testid="sim-send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Deliver reply', 'تسليم الرد')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{tr('Link email to a thread', 'ربط الرسالة بمحادثة')}</DialogTitle></DialogHeader>
          <Input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder={tr('Search by reference, subject or company', 'ابحث بالمرجع أو الموضوع أو الشركة')} data-testid="link-search" />
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {linkResults.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">{tr('No threads found', 'لا توجد محادثات')}</li>}
            {linkResults.map((t) => (
              <li key={t.id}>
                <button type="button" disabled={busy} onClick={() => linkTo(t)} className="w-full px-3 py-2 text-start text-sm hover:bg-muted/40" data-testid="link-candidate">
                  <span className="font-mono text-xs">{t.thread_reference}</span> · {t.subject}
                  <span className="block text-xs text-muted-foreground">{t.company_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium [overflow-wrap:anywhere]">{value}</div>
    </div>
  );
}
