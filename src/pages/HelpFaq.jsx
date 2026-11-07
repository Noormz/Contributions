import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtDate, fmtDateTime, errMsg } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import FileUpload from '@/components/common/FileUpload';
import StatusBadge from '@/components/review/StatusBadge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, Clock, ShieldCheck, ShieldX, HelpCircle, Send, CheckCircle2 } from 'lucide-react';

export default function HelpFaq() {
  const tr = useTr();
  const { language } = useTranslation();
  const { user } = useAuth();
  const isRep = user?.role === 'company_representative';
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ inquiry_category: '', subject: '', description: '', attachment: '', attachmentName: '' });
  const [formErr, setFormErr] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [submitError, setSubmitError] = useState('');

  const loadInquiries = useCallback(async () => {
    const q = isRep ? {} : { created_by_id: user?.id };
    const r = await base44.entities.Inquiry.filter(q, { sort: '-created_date', limit: 50 }).catch(() => ({ items: [] }));
    setInquiries(r.items || []);
  }, [isRep, user?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [f, c] = await Promise.all([
        base44.entities.FaqEntry.filter({ is_active: true }, { sort: 'sort_order', limit: 100 }).catch(() => ({ items: [] })),
        base44.entities.LookupValue.filter({ category: 'inquiry_category', is_active: true }, { sort: 'sort_order', limit: 50 }).catch(() => ({ items: [] })),
      ]);
      setFaqs(f.items || []);
      setCategories(c.items || []);
      await loadInquiries();
      if (isRep && user?.company_id) {
        try {
          setStatus(await base44.functions.invoke('companyHelpStatus', { company_id: user.company_id }));
        } catch (e) {
          setStatusError(errMsg(e));
        }
      }
      setLoading(false);
    })();
  }, [isRep, user?.company_id, loadInquiries]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.inquiry_category) errs.inquiry_category = tr('Select a category.', 'اختر الفئة.');
    if (!form.subject.trim()) errs.subject = tr('Subject is required.', 'الموضوع مطلوب.');
    if (!form.description.trim()) errs.description = tr('Describe your question.', 'اكتب سؤالك.');
    setFormErr(errs);
    if (Object.keys(errs).length) return;
    setSending(true);
    setSubmitError('');
    try {
      const rec = await base44.entities.Inquiry.create({
        inquiry_category: form.inquiry_category, subject: form.subject.trim(), description: form.description.trim(),
        attachment: form.attachment || undefined, company_id: user?.company_id || undefined,
      });
      setSent(rec);
      setForm({ inquiry_category: '', subject: '', description: '', attachment: '', attachmentName: '' });
      loadInquiries();
    } catch (e2) {
      setSubmitError(errMsg(e2));
    } finally {
      setSending(false);
    }
  };

  const L = (o, en, ar) => (language === 'ar' && o[ar] ? o[ar] : o[en]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr('Help & Inquiries', 'المساعدة والاستفسارات')}
        subtitle={tr('Check your status, read common questions, or ask the Contributions Unit.', 'تحقق من وضعك واطلع على الأسئلة الشائعة أو راسل وحدة المساهمات.')}
        crumbs={[{ label: tr('Help & Inquiries', 'المساعدة والاستفسارات') }]}
      />

      {isRep && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="guided-status">
          <h2 className="mb-4 font-semibold">{tr('Quick answers about your company', 'إجابات سريعة عن شركتك')}</h2>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : statusError ? (
            <p className="text-sm text-destructive">{statusError}</p>
          ) : status && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Guided icon={FileText} q={tr('When did we last submit financial statements?', 'متى قدمنا آخر بيانات مالية؟')}>
                {status.last_statement
                  ? tr(`Financial year ${status.last_statement.financial_year} (period ending ${fmtDate(status.last_statement.statement_end_date)}), uploaded ${fmtDate(status.last_statement.upload_date)}.`,
                    `السنة المالية ${status.last_statement.financial_year} (نهاية الفترة ${fmtDate(status.last_statement.statement_end_date)})، رفعت بتاريخ ${fmtDate(status.last_statement.upload_date)}.`)
                  : tr('No financial statements have been submitted yet.', 'لم يتم تقديم أي بيانات مالية بعد.')}
              </Guided>
              <Guided icon={Clock} q={tr('Do we have a pending contribution?', 'هل لدينا مساهمة معلقة؟')}>
                {status.pending_applications.length === 0 && !status.has_outstanding
                  ? tr('No. There are no applications in progress and no outstanding contributions.', 'لا. لا توجد طلبات قيد المعالجة ولا مساهمات مستحقة.')
                  : (
                    <span className="space-y-1">
                      {status.pending_applications.length > 0 && (
                        <span className="block">{tr(`You have ${status.pending_applications.length} application(s) in progress:`, `لديكم ${status.pending_applications.length} طلب/طلبات قيد المعالجة:`)}</span>
                      )}
                      {status.pending_applications.map((a) => (
                        <Link key={a.id} to={`/applications/${a.id}`} className="flex items-center gap-2 text-accent hover:underline">
                          {a.reference || tr('Draft', 'مسودة')} · {a.financial_year} <StatusBadge value={a.status} />
                        </Link>
                      ))}
                      {status.has_outstanding && <span className="block">{tr('There are outstanding contributions on your account. See Payments for details or contact the unit.', 'توجد مساهمات مستحقة على حسابكم. راجع المدفوعات أو تواصل مع الوحدة.')}</span>}
                    </span>
                  )}
              </Guided>
              <Guided icon={status.clearance_eligible ? ShieldCheck : ShieldX} q={tr('Are we eligible for a clearance letter?', 'هل نحن مؤهلون لشهادة مخالصة؟')}>
                <span className={status.clearance_eligible ? 'font-semibold text-success' : 'font-semibold text-destructive'} data-testid="clearance-eligibility">
                  {status.clearance_eligible ? tr('Yes, you appear eligible.', 'نعم، يبدو أنكم مؤهلون.') : tr('Not yet.', 'ليس بعد.')}
                </span>
                {(status.clearance_reasons || []).map((r, i) => <span key={i} className="block text-muted-foreground">{tr(r.en, r.ar)}</span>)}
                {status.latest_clearance && (
                  <span className="block text-muted-foreground">
                    {tr('Latest clearance letter', 'آخر شهادة مخالصة')}: {status.latest_clearance.reference} ({fmtDate(status.latest_clearance.date)})
                  </span>
                )}
              </Guided>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4 text-primary" /> {tr('Frequently asked questions', 'الأسئلة الشائعة')}</h2>
        {faqs.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">{tr('No FAQ entries yet.', 'لا توجد أسئلة شائعة بعد.')}</p>
        ) : (
          <Accordion type="single" collapsible>
            {faqs.map((f) => (
              <AccordionItem key={f.id} value={f.id}>
                <AccordionTrigger className="text-start">{L(f, 'question_en', 'question_ar')}</AccordionTrigger>
                <AccordionContent className="whitespace-pre-wrap text-muted-foreground">{L(f, 'answer_en', 'answer_ar')}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">{tr('Ask a question', 'اطرح سؤالاً')}</h2>
          {sent && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-success/10 p-3 text-sm text-success" data-testid="inquiry-sent">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{tr(`Your inquiry ${sent.inquiry_reference} was sent. The Contributions Unit will respond soon.`, `تم إرسال استفساركم ${sent.inquiry_reference}. سترد وحدة المساهمات قريباً.`)}</span>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="inq-cat">{tr('Category', 'الفئة')} *</Label>
              <select id="inq-cat" data-testid="inquiry-category" value={form.inquiry_category} onChange={(e) => setForm({ ...form, inquiry_category: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{tr('Select…', 'اختر…')}</option>
                {categories.map((c) => <option key={c.id} value={c.value_en}>{language === 'ar' ? c.value_ar || c.value_en : c.value_en}</option>)}
                {categories.length === 0 && <option value="Other">{tr('Other', 'أخرى')}</option>}
              </select>
              {formErr.inquiry_category && <p className="text-xs text-destructive">{formErr.inquiry_category}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-subject">{tr('Subject', 'الموضوع')} *</Label>
              <Input id="inq-subject" data-testid="inquiry-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              {formErr.subject && <p className="text-xs text-destructive">{formErr.subject}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-desc">{tr('Your question', 'سؤالك')} *</Label>
              <Textarea id="inq-desc" data-testid="inquiry-description" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              {formErr.description && <p className="text-xs text-destructive">{formErr.description}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Attachment (optional)', 'مرفق (اختياري)')}</Label>
              <FileUpload value={form.attachment} valueName={form.attachmentName}
                onUploaded={(f) => setForm((s) => ({ ...s, attachment: f.file_url, attachmentName: f.filename }))}
                onClear={() => setForm((s) => ({ ...s, attachment: '', attachmentName: '' }))} />
            </div>
            {submitError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{submitError}</p>}
            <Button type="submit" disabled={sending} className="gap-1.5" data-testid="inquiry-submit">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:rotate-180" />} {tr('Send inquiry', 'إرسال الاستفسار')}
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">{isRep ? tr('My inquiries', 'استفساراتي') : tr('Inquiries I raised', 'الاستفسارات التي أرسلتها')}</h2>
          {inquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr('No inquiries yet.', 'لا توجد استفسارات بعد.')}</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="my-inquiries">
              {inquiries.map((q) => (
                <li key={q.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/records/Inquiry/${q.id}`} className="min-w-0 [overflow-wrap:anywhere] font-medium text-accent hover:underline">{q.inquiry_reference} · {q.subject}</Link>
                    <StatusBadge value={q.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{q.inquiry_category} · {fmtDateTime(q.submission_date || q.created_date)}</p>
                  {q.response && <p className="mt-1.5 rounded-md bg-muted/40 p-2 text-sm"><span className="font-medium">{tr('Response', 'الرد')}: </span>{q.response}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Guided({ icon: Icon, q, children }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="mb-2 flex items-start gap-2 text-sm font-semibold"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{q}</p>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}
