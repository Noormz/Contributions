import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, errMsg } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import { Sparkles, X, Send, Loader2, Mail, MessageSquare, Check, Ban, ThumbsUp, ThumbsDown, ShieldCheck, Trash2 } from 'lucide-react';

// The record the person is looking at, so "this application" means something to the assistant.
function pageContext(pathname) {
  const m = pathname.match(/^\/(applications|companies|inbox|calculation-review)\/([a-f0-9]{8,64})/)
    || pathname.match(/^\/records\/(\w+)\/([a-f0-9]{8,64})/);
  if (!m) return null;
  const entityName = { applications: 'ContributionApplication', companies: 'Company', inbox: 'CommunicationThread', 'calculation-review': 'ContributionApplication' }[m[1]] || m[1];
  return { entityName, recordId: m[2] };
}

// Only in-app links are rendered as links; images and raw HTML never render.
const mdComponents = {
  a: ({ href, children }) => (href && href.startsWith('/') && !href.startsWith('//')
    ? <Link to={href} className="font-medium text-accent underline underline-offset-2">{children}</Link>
    : <span>{children}</span>),
  img: () => null,
};

function ConfirmCard({ card, onDone }) {
  const tr = useTr();
  const [state, setState] = useState({ busy: false, result: null, error: '' });
  const act = async (action) => {
    setState({ busy: true, result: null, error: '' });
    try {
      const r = await base44.api.post('/api/ai', { action, token: card.token });
      setState({ busy: false, result: action === 'dismiss' ? { message: tr('Cancelled. Nothing was sent.', 'تم الإلغاء. لم يُرسل شيء.') } : r, error: '' });
      onDone?.();
    } catch (e) {
      setState({ busy: false, result: null, error: errMsg(e) });
    }
  };
  const s = card.summary || {};
  const Icon = card.kind === 'email' ? Mail : MessageSquare;
  return (
    <div className="mt-2 rounded-lg border-2 border-accent/40 bg-accent/5 p-3 text-sm" data-testid="ai-confirm-card">
      <p className="mb-2 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 shrink-0 text-accent" /><span className="min-w-0 break-words">{s.title}</span></p>
      <dl className="space-y-1">
        <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">{tr('To', 'إلى')}:</dt><dd className="min-w-0 [overflow-wrap:anywhere]" dir="ltr">{(s.to || []).join(', ')}</dd></div>
        {s.subject && <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">{tr('Subject', 'الموضوع')}:</dt><dd className="min-w-0 break-words">{s.subject}</dd></div>}
        {s.application && <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">{tr('Application', 'الطلب')}:</dt><dd>{s.application}</dd></div>}
      </dl>
      <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-2">{s.body}</p>
      {state.result ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 font-medium text-success" role="status" data-testid="ai-confirm-result">
          <Check className="h-4 w-4" /> {state.result.message}
          {state.result.link && <Link to={state.result.link} className="text-accent underline">{tr('Open', 'فتح')}</Link>}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" disabled={state.busy} onClick={() => act('confirm')} data-testid="ai-confirm">
            {state.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {tr('Confirm and send', 'تأكيد وإرسال')}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={state.busy} onClick={() => act('dismiss')} data-testid="ai-dismiss">
            <Ban className="h-4 w-4" /> {tr('Cancel', 'إلغاء')}
          </Button>
        </div>
      )}
      {state.error && <p className="mt-2 text-destructive" role="alert">{state.error}</p>}
      {!state.result && <p className="mt-2 text-xs text-muted-foreground">{tr('Nothing is sent until you press Confirm. The link expires in 10 minutes.', 'لن يُرسل شيء حتى تضغط تأكيد. تنتهي صلاحية الطلب بعد 10 دقائق.')}</p>}
    </div>
  );
}

function Feedback({ logId }) {
  const [sent, setSent] = useState(null);
  if (!logId) return null;
  const send = (feedback) => { setSent(feedback); base44.api.post('/api/ai', { action: 'feedback', logId, feedback }).catch(() => {}); };
  return (
    <span className="ms-auto flex gap-1 text-muted-foreground">
      <button type="button" aria-label="Helpful" onClick={() => send('helpful')} className={sent === 'helpful' ? 'text-success' : 'hover:text-foreground'}><ThumbsUp className="h-3.5 w-3.5" /></button>
      <button type="button" aria-label="Not helpful" onClick={() => send('not_helpful')} className={sent === 'not_helpful' ? 'text-destructive' : 'hover:text-foreground'}><ThumbsDown className="h-3.5 w-3.5" /></button>
    </span>
  );
}

export default function AiAssistant() {
  const tr = useTr();
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const endRef = useRef(null);
  const internal = user?.role && user.role !== 'company_representative';

  useEffect(() => { if (open) base44.api.get('/api/ai/status').then(setStatus).catch(() => {}); }, [open, messages.length]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  const suggestions = useMemo(() => (internal ? [
    tr('Which applications are pending my approval?', 'ما الطلبات بانتظار اعتمادي؟'),
    tr('What is the balance of Gulf Horizon Investment Co.?', 'ما رصيد شركة أفق الخليج للاستثمار؟'),
    tr('Email Al-Waha Real Estate Co. asking for their 2024 statements', 'أرسل بريداً لشركة الواحة العقارية لطلب بيانات 2024'),
  ] : [
    tr('What is the status of my applications?', 'ما حالة طلباتي؟'),
    tr('How much do we still owe?', 'كم المبلغ المتبقي علينا؟'),
    tr('How do I get a clearance letter?', 'كيف أحصل على شهادة مخالصة؟'),
  ]), [internal, tr]);

  const ask = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput('');
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const r = await base44.api.post('/api/ai', { action: 'assistant', question, history, context: pageContext(location.pathname) });
      setMessages((m) => [...m, { role: 'assistant', text: r.answer, attachments: r.attachments, logId: r.logId }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: errMsg(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} data-testid="ai-open" aria-label={tr('Open the AI assistant', 'فتح المساعد الذكي')}
          className="print:hidden fixed bottom-5 end-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105">
          <Sparkles className="h-5 w-5" /> <span className="hidden sm:inline">{tr('Ask the assistant', 'اسأل المساعد')}</span>
        </button>
      )}
      {open && (
        <div role="dialog" aria-label={tr('AI assistant', 'المساعد الذكي')} data-testid="ai-panel"
          className="print:hidden fixed inset-x-2 bottom-2 z-50 flex h-[min(640px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:end-5 sm:bottom-5 sm:w-[420px]">
          <div className="flex items-center gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <Sparkles className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{tr('KFAS Portal Assistant', 'مساعد بوابة المؤسسة')}</p>
              <p className="text-[11px] opacity-80">
                {status?.provider === 'local' ? tr('Offline mode: answers from portal data', 'وضع دون اتصال: يجيب من بيانات البوابة') : tr('AI assistant', 'مساعد ذكي')}
                {status ? ` · ${status.used_today}/${status.daily_limit} ${tr('today', 'اليوم')}` : ''}
              </p>
            </div>
            {messages.length > 0 && <button type="button" onClick={() => setMessages([])} aria-label={tr('Clear conversation', 'مسح المحادثة')} className="opacity-80 hover:opacity-100"><Trash2 className="h-4 w-4" /></button>}
            <button type="button" onClick={() => setOpen(false)} aria-label={tr('Close', 'إغلاق')} data-testid="ai-close" className="opacity-80 hover:opacity-100"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm" data-testid="ai-messages">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {tr('I can read only what your account can see, and I never send anything myself: emails and messages wait for your Confirm.', 'أقرأ فقط ما يسمح به حسابك، ولا أرسل شيئاً بنفسي: البريد والرسائل تنتظر تأكيدك.')}
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className="rounded-lg border border-border px-3 py-2 text-start hover:bg-muted">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (m.role === 'user' ? (
              <div key={i} className="ms-10 rounded-lg bg-primary px-3 py-2 text-primary-foreground whitespace-pre-wrap break-words">{m.text}</div>
            ) : (
              <div key={i} className={`me-4 rounded-lg border px-3 py-2 ${m.error ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border bg-background'}`} data-testid="ai-answer">
                <div className="break-words leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:ps-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:ps-5 [&_em]:text-muted-foreground">
                  <ReactMarkdown components={mdComponents} skipHtml>{m.text}</ReactMarkdown>
                </div>
                {(m.attachments?.confirm || []).map((c) => <ConfirmCard key={c.token} card={c} />)}
                {!m.error && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {(m.attachments?.links || []).slice(0, 4).map((l) => (
                      <Link key={l.path} to={l.path} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">{l.label}</Link>
                    ))}
                    <Feedback logId={m.logId} />
                  </div>
                )}
              </div>
            )))}
            {busy && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{tr('Checking the portal…', 'جارٍ البحث في البوابة…')}</p>}
            <div ref={endRef} />
          </div>

          <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} maxLength={1000} data-testid="ai-input"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              placeholder={tr('Ask about applications, payments, balances… or ask me to draft an email', 'اسأل عن الطلبات أو المدفوعات أو الأرصدة… أو اطلب صياغة بريد')}
              className="min-h-[2.75rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label={tr('Send', 'إرسال')} data-testid="ai-send"><Send className="h-4 w-4 rtl:-scale-x-100" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
