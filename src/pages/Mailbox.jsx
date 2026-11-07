import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTr, fmtDateTime, humanize, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Search } from 'lucide-react';

// Highlights 6-digit verification codes in the message body.
function Body({ text }) {
  const parts = String(text || '').split(/(\b\d{6}\b)/);
  return (
    <p className="whitespace-pre-wrap text-sm">
      {parts.map((p, i) => (/^\d{6}$/.test(p)
        ? <mark key={i} className="rounded bg-warning/20 px-1 font-mono text-base font-bold text-foreground" data-testid="mail-code">{p}</mark>
        : <React.Fragment key={i}>{p}</React.Fragment>))}
    </p>
  );
}

const join = (v) => (Array.isArray(v) ? v.join(', ') : v || '');

export default function Mailbox({ devMode = false }) {
  const tr = useTr();
  const [mails, setMails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState({});

  useEffect(() => { const id = setTimeout(() => setDebounced(filter.trim()), 300); return () => clearTimeout(id); }, [filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let list;
      if (devMode) {
        const res = await fetch(`/api/dev/mailbox${debounced.includes('@') ? `?to=${encodeURIComponent(debounced)}` : ''}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Mailbox unavailable');
        list = data;
      } else {
        list = await base44.api.get('/api/mailbox');
      }
      const term = debounced.toLowerCase();
      setMails(term && !(devMode && term.includes('@'))
        ? list.filter((m) => [m.subject, m.from_address, join(m.to_addresses), join(m.cc_addresses), join(m.bcc_addresses), m.category].join(' ').toLowerCase().includes(term))
        : list);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [devMode, debounced]);

  useEffect(() => { load(); }, [load]);

  const content = (
    <div className="space-y-5">
      {devMode ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4" role="note">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
            <div>
              <p className="text-lg font-bold">{tr('Development mailbox — disabled in production', 'صندوق بريد التطوير — معطل في بيئة الإنتاج')}</p>
              <p className="text-sm text-muted-foreground">{tr('Every email the portal sends locally (verification codes, notifications, officer emails) appears here. Filter by recipient email to find your code.', 'تظهر هنا كل الرسائل التي ترسلها البوابة محلياً (رموز التحقق والإشعارات ورسائل الموظفين). صفِّ حسب البريد للعثور على رمزك.')}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{tr('Dev Mailbox', 'صندوق بريد التطوير')}</h1>
            <Link to="/login" className="text-sm text-accent hover:underline">{tr('Back to login', 'العودة لتسجيل الدخول')}</Link>
          </div>
        </div>
      ) : (
        <PageHeader
          title={tr('Sent Email Log', 'سجل البريد المرسل')}
          subtitle={tr('Emails sent by the portal. Officers see the messages they were sent or copied on; managers and administrators see all.', 'الرسائل المرسلة من البوابة. يرى الموظفون ما أُرسل إليهم أو نُسخوا عليه؛ ويرى المديرون الكل.')}
          crumbs={[{ label: tr('Sent Email Log', 'سجل البريد المرسل') }]}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} className="ps-9" placeholder={devMode ? tr('Recipient email (e.g. you@company.com)', 'بريد المستلم') : tr('Search subject, address, category…', 'ابحث في الموضوع أو العنوان أو الفئة…')} data-testid="mailbox-filter" />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={load} data-testid="mailbox-refresh"><RefreshCw className="h-4 w-4" /> {tr('Refresh', 'تحديث')}</Button>
        <span className="text-sm text-muted-foreground">{loading ? '' : tr(`${mails.length} messages`, `${mails.length} رسالة`)}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="py-16 text-center text-destructive">{error}</p>
        ) : mails.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-16 text-muted-foreground"><Mail className="h-8 w-8 opacity-40" />{tr('No emails', 'لا توجد رسائل')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {mails.map((m) => (
              <li key={m.id} data-testid="mail-row">
                <button type="button" className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-start hover:bg-muted/30" onClick={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}>
                  {open[m.id] ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 rtl:rotate-180" />}
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{m.subject}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {tr('To', 'إلى')}: {join(m.to_addresses)}{join(m.cc_addresses) && ` · CC: ${join(m.cc_addresses)}`}{join(m.bcc_addresses) && ` · BCC: ${join(m.bcc_addresses)}`}
                    </p>
                  </div>
                  <div className="ms-auto shrink-0 text-end text-xs text-muted-foreground">
                    <p>{fmtDateTime(m.sent_date || m.created_date)}</p>
                    <p className="mt-0.5 rounded bg-muted px-1.5 py-0.5">{humanize(String(m.category || '').replace(':', ' '))}</p>
                  </div>
                </button>
                {open[m.id] && (
                  <div className="space-y-2 border-t border-border bg-muted/20 px-11 py-3">
                    <p className="text-xs text-muted-foreground">{tr('From', 'من')}: {m.from_address} · {tr('Delivery', 'التسليم')}: {m.delivery}</p>
                    <Body text={m.body} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  if (devMode) return <div className="min-h-screen bg-background p-4 sm:p-8"><div className="mx-auto max-w-5xl">{content}</div></div>;
  return content;
}
