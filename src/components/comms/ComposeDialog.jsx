import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTr, errMsg } from '@/lib/tr';
import { useTranslation } from '@/lib/i18n';
import FileUpload from '@/components/common/FileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Send, Info } from 'lucide-react';

const splitEmails = (s) => String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const NONE = '__none__';

export default function ComposeDialog({ open, onOpenChange, companyId, applicationId, onSent }) {
  const tr = useTr();
  const { language } = useTranslation();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [cid, setCid] = useState(companyId || '');
  const [company, setCompany] = useState(null);
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState(applicationId || NONE);
  const [templates, setTemplates] = useState([]);
  const [templateKey, setTemplateKey] = useState(NONE);
  const [selected, setSelected] = useState([]);
  const [extraTo, setExtraTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCid(companyId || ''); setAppId(applicationId || NONE); setTemplateKey(NONE);
    setSelected([]); setExtraTo(''); setCc(''); setSubject(''); setBody(''); setFiles([]); setError('');
    base44.entities.Company.filter({}, { sort: 'company_name_en', limit: 1000 }).then((r) => setCompanies(r.items || [])).catch(() => setCompanies([]));
    base44.entities.EmailTemplate.filter({ is_active: true }, { sort: 'template_name', limit: 200 }).then((r) => setTemplates(r.items || [])).catch(() => setTemplates([]));
  }, [open, companyId, applicationId]);

  useEffect(() => {
    if (!cid) { setCompany(null); setApps([]); return; }
    base44.entities.Company.get(cid).then((c) => {
      setCompany(c);
      setSelected([c.official_email || c.financial_manager_email].filter(Boolean));
    }).catch(() => setCompany(null));
    base44.entities.ContributionApplication.filter({ company_id: cid }, { sort: '-created_date', limit: 100 }).then((r) => setApps((r.items || []).filter((a) => a.application_reference))).catch(() => setApps([]));
  }, [cid]);

  const contacts = useMemo(() => {
    if (!company) return [];
    const list = [
      [company.official_email, tr('Official email', 'البريد الرسمي')],
      [company.ceo_email, `${tr('CEO', 'الرئيس التنفيذي')}${company.ceo_name_en ? ` — ${company.ceo_name_en}` : ''}`],
      [company.financial_manager_email, `${tr('Financial manager', 'المدير المالي')}${company.financial_manager_name ? ` — ${company.financial_manager_name}` : ''}`],
    ].filter(([e]) => e);
    const seen = new Set();
    return list.filter(([e]) => (seen.has(e) ? false : seen.add(e)));
  }, [company, tr]);

  const fillTemplate = (key) => {
    const tpl = templates.find((t) => t.template_key === key);
    if (!tpl) return;
    const co = company?.id === cid ? company : companies.find((c) => c.id === cid);
    const app = apps.find((a) => a.id === appId);
    const vars = { company: co?.company_name_en || '', reference: app?.application_reference || '', name: co?.financial_manager_name || '', link: '' };
    const fill = (s) => String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    const ar = language === 'ar';
    setSubject(fill(ar ? tpl.subject_ar || tpl.subject_en : tpl.subject_en));
    setBody(fill(ar ? tpl.body_ar || tpl.body_en : tpl.body_en));
  };

  const applyTemplate = (key) => {
    setTemplateKey(key);
    if (key !== NONE) fillTemplate(key);
  };

  // Re-fill placeholders when the company/application context arrives after a template was chosen.
  useEffect(() => {
    if (templateKey !== NONE) fillTemplate(templateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, appId, apps]);

  const toggle = (email) => setSelected((s) => (s.includes(email) ? s.filter((x) => x !== email) : [...s, email]));

  const send = async () => {
    const to = Array.from(new Set([...selected, ...splitEmails(extraTo)]));
    if (!cid) return setError(tr('Select a company.', 'اختر الشركة.'));
    if (!to.length) return setError(tr('Select at least one recipient.', 'اختر مستلماً واحداً على الأقل.'));
    const bad = [...to, ...splitEmails(cc)].find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad) return setError(tr(`Invalid email address: ${bad}`, `بريد إلكتروني غير صالح: ${bad}`));
    if (!subject.trim() || !body.trim()) return setError(tr('Subject and message are required.', 'الموضوع والرسالة مطلوبان.'));
    setSending(true);
    setError('');
    try {
      const res = await base44.functions.invoke('sendThreadMessage', {
        company_id: cid, application_id: appId === NONE ? '' : appId, to, cc: splitEmails(cc), subject, body,
        attachments: files.map((f) => f.id), template_key: templateKey === NONE ? '' : templateKey,
      });
      onOpenChange(false);
      if (onSent) onSent(res.thread);
      else navigate(`/inbox/${res.thread.id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{tr('New email to company', 'رسالة جديدة إلى الشركة')}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{tr('Company', 'الشركة')} *</Label>
              <Select value={cid || undefined} onValueChange={(v) => { setCid(v); setAppId(NONE); }} disabled={!!companyId}>
                <SelectTrigger data-testid="compose-company"><SelectValue placeholder={tr('Select company', 'اختر الشركة')} /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{language === 'ar' ? c.company_name_ar || c.company_name_en : c.company_name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Related application', 'الطلب المرتبط')}</Label>
              <Select value={appId} onValueChange={setAppId} disabled={!cid}>
                <SelectTrigger data-testid="compose-application"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{tr('None (company-level)', 'لا يوجد (على مستوى الشركة)')}</SelectItem>
                  {apps.map((a) => <SelectItem key={a.id} value={a.id}>{a.application_reference} · {a.financial_year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{tr('To', 'إلى')} *</Label>
            {cid && contacts.length === 0 && <p className="text-xs text-muted-foreground">{tr('No contact emails on the company profile — add recipients below.', 'لا توجد عناوين بريد في ملف الشركة — أضف المستلمين أدناه.')}</p>}
            <div className="space-y-1.5">
              {contacts.map(([email, label]) => (
                <label key={email} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={selected.includes(email)} onCheckedChange={() => toggle(email)} data-testid={`compose-contact-${email}`} />
                  <span className="font-medium">{email}</span>
                  <span className="text-muted-foreground">({label})</span>
                </label>
              ))}
            </div>
            <Input value={extraTo} onChange={(e) => setExtraTo(e.target.value)} placeholder={tr('Additional recipients, comma separated', 'مستلمون إضافيون، مفصولون بفاصلة')} data-testid="compose-extra-to" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('CC', 'نسخة إلى')}</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder={tr('Copy recipients, comma separated', 'مستلمو النسخة، مفصولون بفاصلة')} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Template', 'القالب')}</Label>
            <Select value={templateKey} onValueChange={applyTemplate}>
              <SelectTrigger data-testid="compose-template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{tr('No template', 'بدون قالب')}</SelectItem>
                {[...templates].sort((a, b) => (b.category === 'correspondence') - (a.category === 'correspondence')).map((t) => <SelectItem key={t.id} value={t.template_key}>{t.template_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Subject', 'الموضوع')} *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="compose-subject" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Message', 'الرسالة')} *</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} data-testid="compose-body" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Attachments', 'المرفقات')}</Label>
            {files.map((f) => (
              <FileUpload key={f.id} value={f.file_url} valueName={f.filename} onClear={() => setFiles((x) => x.filter((y) => y.id !== f.id))} />
            ))}
            <FileUpload companyId={cid} onUploaded={(f) => setFiles((x) => [...x, f])} />
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-accent/5 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            {tr('A unique reference (THR-…) is added to the subject so replies are linked to this thread. A BCC copy will be sent to you.', 'يضاف مرجع فريد (THR-…) إلى الموضوع لربط الردود بهذه المحادثة. سترسل لك نسخة مخفية.')}
          </p>
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={send} disabled={sending} className="gap-1.5" data-testid="compose-send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />} {tr('Send', 'إرسال')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
