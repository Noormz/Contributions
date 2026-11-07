import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr } from '@/lib/tr';
import { passwordIssue } from '@/components/company/passwordRules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, ArrowLeft, Languages, Paperclip, X } from 'lucide-react';
import KfasLogo from '@/components/brand/KfasEmblem';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const emptyForm = {
  company_name_ar: '', company_name_en: '', previous_company_name: '', commercial_registration_number: '',
  business_license_number: '', year_of_establishment: '', company_type: '', business_sector: '', is_wll: false,
  capital: '', currency: 'KWD', auditor_name: '', cofs_file_number: '',
  country: 'Kuwait', governorate: '', area: '', street: '', building: '', floor: '', office: '', postal_address: '', postal_code: '',
  telephone: '', official_email: '',
  ceo_name_en: '', ceo_name_ar: '', ceo_job_title: '', ceo_email: '', ceo_telephone: '', ceo_mobile: '',
  financial_manager_name: '', financial_manager_position: '', financial_manager_email: '', financial_manager_telephone: '', financial_manager_mobile: '',
  contact_email: '', password: '', confirm_password: '', confirm: false,
};

// Company fields sent to Company.create (everything except account fields)
const COMPANY_KEYS = Object.keys(emptyForm).filter((k) => !['contact_email', 'password', 'confirm_password', 'confirm'].includes(k));

export default function CompanyRegistration() {
  const tr = useTr();
  const { language, toggleLanguage } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState({ business_license: null, moci_proof: null });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('form'); // form | otp | done
  const [otp, setOtp] = useState('');
  const [info, setInfo] = useState('');
  const [lookups, setLookups] = useState({});
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // Public endpoint (no session needed); falls back to free-text inputs on failure.
    base44.api.get('/api/public/lookups')
      .then((rows) => {
        const by = {};
        (rows || []).forEach((l) => { (by[l.category] = by[l.category] || []).push(l); });
        setLookups(by);
      })
      .catch(() => setLookups({}));
  }, []);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    const req = tr('This field is required.', 'هذا الحقل مطلوب.');
    if (!form.company_name_ar.trim()) e.company_name_ar = req;
    if (!form.company_name_en.trim()) e.company_name_en = req;
    if (!form.commercial_registration_number.trim()) e.commercial_registration_number = req;
    else if (!/^[A-Za-z0-9-]{3,20}$/.test(form.commercial_registration_number.trim())) e.commercial_registration_number = tr('Enter a valid CR number.', 'أدخل رقم سجل تجاري صحيح.');
    if (form.year_of_establishment && !/^(18|19|20)\d{2}$/.test(form.year_of_establishment)) e.year_of_establishment = tr('Enter a valid year.', 'أدخل سنة صحيحة.');
    if (form.year_of_establishment && Number(form.year_of_establishment) > new Date().getFullYear()) e.year_of_establishment = tr('Year cannot be in the future.', 'لا يمكن أن تكون السنة في المستقبل.');
    if (form.capital && !(Number(form.capital) >= 0)) e.capital = tr('Enter a valid amount.', 'أدخل مبلغاً صحيحاً.');
    ['official_email', 'ceo_email', 'financial_manager_email'].forEach((k) => {
      if (form[k] && !EMAIL_RE.test(form[k])) e[k] = tr('Enter a valid email address.', 'أدخل بريداً إلكترونياً صحيحاً.');
    });
    if (!form.official_email) e.official_email = req;
    if (!form.financial_manager_name.trim()) e.financial_manager_name = req;
    if (!form.financial_manager_email) e.financial_manager_email = req;
    if (!EMAIL_RE.test(form.contact_email)) e.contact_email = tr('Enter a valid email address.', 'أدخل بريداً إلكترونياً صحيحاً.');
    const pw = passwordIssue(form.password, tr);
    if (pw) e.password = pw;
    if (form.password !== form.confirm_password) e.confirm_password = tr('Passwords do not match.', 'كلمتا المرور غير متطابقتين.');
    if (!form.confirm) e.confirm = tr('You must confirm the information is accurate.', 'يجب تأكيد صحة المعلومات.');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setError('');
    if (!validate()) {
      setError(tr('Please correct the highlighted fields.', 'يرجى تصحيح الحقول المحددة.'));
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setLoading(true);
    try {
      if (verified) {
        // Account already verified (e.g. user corrected a duplicate CR); just create the company.
        await createCompany();
        setStage('done');
        return;
      }
      await base44.auth.register({ email: form.contact_email.trim(), password: form.password, full_name: form.financial_manager_name || form.company_name_en });
      setStage('otp');
    } catch (err) {
      setError(err.message || tr('Registration failed.', 'فشل التسجيل.'));
    } finally {
      setLoading(false);
    }
  };

  const createCompany = async () => {
    const urls = {};
    for (const [key, file] of Object.entries(files)) {
      if (file) urls[key] = (await base44.integrations.Core.UploadPrivateFile({ file })).file_url;
    }
    const data = {};
    COMPANY_KEYS.forEach((k) => {
      const v = form[k];
      if (v !== '' && v !== null && v !== undefined) data[k] = typeof v === 'string' ? v.trim() : v;
    });
    if (data.capital) data.capital = Number(data.capital);
    if (urls.business_license) data.business_license_attachment = urls.business_license;
    if (urls.moci_proof) data.moci_registration_proof = urls.moci_proof;
    const company = await base44.entities.Company.create(data);
    await base44.auth.updateMe({
      company_id: company.id,
      full_name: form.financial_manager_name || form.company_name_en,
      phone: form.financial_manager_mobile || form.financial_manager_telephone || form.telephone,
      job_title: form.financial_manager_position,
    });
  };

  const handleVerify = async (ev) => {
    ev.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (!verified) {
        const res = await base44.auth.verifyOtp({ email: form.contact_email.trim(), otpCode: otp.trim() });
        base44.auth.setToken(res.access_token);
        setVerified(true);
      }
      await createCompany();
      setStage('done');
    } catch (err) {
      // e.g. duplicate CR after verification: the account exists, let the user fix and retry.
      setError(err.message || tr('Verification failed.', 'فشل التحقق.'));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    await base44.auth.resendOtp(form.contact_email.trim()).catch(() => {});
    setInfo(tr('A new code has been sent.', 'تم إرسال رمز جديد.'));
  };

  const langBtn = (
    <Button type="button" variant="ghost" size="sm" onClick={toggleLanguage} className="gap-1.5">
      <Languages className="h-4 w-4" /> {language === 'en' ? 'العربية' : 'English'}
    </Button>
  );

  if (stage === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm" data-testid="registration-done">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-xl font-bold">{tr('Registration complete', 'اكتمل التسجيل')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr('Your company has been registered and your email verified. The Contributions Unit has been notified.', 'تم تسجيل شركتك والتحقق من بريدك الإلكتروني، وتم إشعار وحدة المساهمات.')}
          </p>
          <Button className="mt-6 w-full" onClick={() => { window.location.href = '/'; }} data-testid="registration-continue">
            {tr('Go to dashboard', 'الذهاب إلى لوحة التحكم')}
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'otp') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <form onSubmit={handleVerify} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5"><KfasLogo className="h-8 w-auto shrink-0" /><span className="font-bold">{tr('Contributions E-Portal', 'بوابة المساهمات الإلكترونية')}</span></div>
            {langBtn}
          </div>
          <h1 className="text-xl font-bold">{verified ? tr('Complete registration', 'إكمال التسجيل') : tr('Verify your email', 'تحقق من بريدك الإلكتروني')}</h1>
          {!verified && (
            <p className="text-sm text-muted-foreground">
              {tr('We sent a 6-digit verification code to', 'أرسلنا رمز تحقق مكوناً من 6 أرقام إلى')} <span className="font-medium text-foreground">{form.contact_email}</span>
            </p>
          )}
          {import.meta.env.DEV && (
            <p className="text-xs text-muted-foreground">
              {tr('Development: read the code in the', 'بيئة التطوير: اقرأ الرمز في')} <a href={`/dev/mailbox?to=${encodeURIComponent(form.contact_email)}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{tr('development mailbox', 'صندوق البريد التجريبي')}</a>
            </p>
          )}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="otp-error">{error}</div>}
          {info && <div className="rounded-lg bg-success/10 p-3 text-sm text-success">{info}</div>}
          {!verified && (
            <div className="space-y-2">
              <Label htmlFor="otp">{tr('Verification code', 'رمز التحقق')}</Label>
              <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} required data-testid="otp-input" />
            </div>
          )}
          {verified && error && (
            <Button type="button" variant="outline" className="w-full" onClick={() => { setStage('form'); setError(''); }}>
              {tr('Edit company details', 'تعديل بيانات الشركة')}
            </Button>
          )}
          <Button type="submit" className="w-full" disabled={loading || (!verified && otp.length !== 6)} data-testid="otp-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : verified ? tr('Retry', 'إعادة المحاولة') : tr('Verify and register', 'تحقق وسجّل')}
          </Button>
          {!verified && (
            <Button type="button" variant="ghost" className="w-full" onClick={resend}>{tr('Resend code', 'إعادة إرسال الرمز')}</Button>
          )}
        </form>
      </div>
    );
  }

  const field = (key, en, ar, opts = {}) => (
    <Field key={key} id={key} label={tr(en, ar)} value={form[key]} onChange={(v) => set(key, v)} error={errors[key]} {...opts} />
  );
  const lookupField = (key, category, en, ar) => {
    const options = lookups[category];
    if (!options?.length) return field(key, en, ar);
    return (
      <div className="space-y-1.5" key={key}>
        <Label htmlFor={key}>{tr(en, ar)}</Label>
        <select id={key} value={form[key]} onChange={(e) => set(key, e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">{tr('Select…', 'اختر…')}</option>
          {options.map((o) => <option key={o.code || o.value_en} value={o.value_en}>{language === 'ar' ? o.value_ar || o.value_en : o.value_en}</option>)}
        </select>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <KfasLogo className="h-10 w-auto shrink-0" />
            <div>
              <h1 className="text-xl font-bold">{tr('Company Registration', 'تسجيل شركة')}</h1>
              <p className="text-xs text-muted-foreground">{tr('Contributions E-Portal', 'بوابة المساهمات الإلكترونية')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {langBtn}
            <Link to="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr('Log in', 'تسجيل الدخول')}
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate data-testid="registration-form">
          <Section title={tr('A. Company information', 'أ. بيانات الشركة')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('company_name_ar', 'Company name (Arabic)', 'اسم الشركة (عربي)', { required: true, dir: 'rtl', hint: tr('Used to match your company in COFS.', 'يستخدم لمطابقة شركتك في نظام COFS.') })}
              {field('company_name_en', 'Company name (English)', 'اسم الشركة (إنجليزي)', { required: true })}
              {field('previous_company_name', 'Previous company name', 'الاسم السابق للشركة')}
              {field('commercial_registration_number', 'Commercial registration (CR) no.', 'رقم السجل التجاري', { required: true })}
              {field('business_license_number', 'Business licence no.', 'رقم الترخيص التجاري')}
              {field('year_of_establishment', 'Year of establishment', 'سنة التأسيس', { type: 'number' })}
              {lookupField('company_type', 'company_type', 'Company type', 'نوع الشركة')}
              {lookupField('business_sector', 'business_sector', 'Business sector', 'قطاع الأعمال')}
              {field('capital', 'Capital (KWD)', 'رأس المال (د.ك)', { type: 'number' })}
              {field('auditor_name', 'Auditor', 'مدقق الحسابات')}
              {field('cofs_file_number', 'COFS file no. (if known)', 'رقم ملف COFS (إن وجد)')}
              <label className="flex items-center gap-3 self-end rounded-lg border border-border px-3 py-2.5">
                <Checkbox checked={form.is_wll} onCheckedChange={(v) => set('is_wll', !!v)} data-testid="is-wll" />
                <span className="text-sm">{tr('W.L.L. (limited liability company)', 'ذات مسؤولية محدودة (ذ.م.م)')}</span>
              </label>
              <FilePick label={tr('Business licence attachment', 'مرفق الترخيص التجاري')} file={files.business_license} onChange={(f) => setFiles((s) => ({ ...s, business_license: f }))} />
              <FilePick label={tr('MOCI registration proof', 'إثبات التسجيل في وزارة التجارة')} file={files.moci_proof} onChange={(f) => setFiles((s) => ({ ...s, moci_proof: f }))} />
            </div>
          </Section>

          <Section title={tr('B. Address and contact', 'ب. العنوان والاتصال')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('country', 'Country', 'الدولة')}
              {lookupField('governorate', 'governorate', 'Governorate', 'المحافظة')}
              {field('area', 'Area', 'المنطقة')}
              {field('street', 'Street', 'الشارع')}
              {field('building', 'Building', 'المبنى')}
              {field('floor', 'Floor', 'الطابق')}
              {field('office', 'Office', 'المكتب')}
              {field('postal_address', 'P.O. Box', 'صندوق البريد')}
              {field('postal_code', 'Postal code', 'الرمز البريدي')}
              {field('telephone', 'Telephone', 'الهاتف', { type: 'tel' })}
              {field('official_email', 'Official email', 'البريد الرسمي', { type: 'email', required: true })}
            </div>
          </Section>

          <Section title={tr('C. Chief Executive Officer', 'ج. الرئيس التنفيذي')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('ceo_name_en', 'Name (English)', 'الاسم (إنجليزي)')}
              {field('ceo_name_ar', 'Name (Arabic)', 'الاسم (عربي)', { dir: 'rtl' })}
              {field('ceo_job_title', 'Job title', 'المسمى الوظيفي')}
              {field('ceo_email', 'Email', 'البريد الإلكتروني', { type: 'email' })}
              {field('ceo_telephone', 'Telephone', 'الهاتف', { type: 'tel' })}
              {field('ceo_mobile', 'Mobile', 'الجوال', { type: 'tel' })}
            </div>
          </Section>

          <Section title={tr('D. Financial manager / accountant', 'د. المدير المالي / المحاسب')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('financial_manager_name', 'Name', 'الاسم', { required: true })}
              {field('financial_manager_position', 'Position', 'المنصب')}
              {field('financial_manager_email', 'Email', 'البريد الإلكتروني', { type: 'email', required: true })}
              {field('financial_manager_telephone', 'Telephone', 'الهاتف', { type: 'tel' })}
              {field('financial_manager_mobile', 'Mobile', 'الجوال', { type: 'tel' })}
            </div>
          </Section>

          <Section title={tr('E. Portal login account (point of contact)', 'هـ. حساب الدخول للبوابة (جهة الاتصال)')}>
            <p className="mb-3 text-xs text-muted-foreground">{tr('A verification code will be sent to this email. Password: at least 8 characters with letters and numbers.', 'سيتم إرسال رمز تحقق إلى هذا البريد. كلمة المرور: 8 أحرف على الأقل تتضمن أحرفاً وأرقاماً.')}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('contact_email', 'Contact email', 'بريد جهة الاتصال', { type: 'email', required: true })}
              <div className="hidden sm:block" />
              {field('password', 'Password', 'كلمة المرور', { type: 'password', required: true, autoComplete: 'new-password' })}
              {field('confirm_password', 'Confirm password', 'تأكيد كلمة المرور', { type: 'password', required: true, autoComplete: 'new-password' })}
            </div>
          </Section>

          <div>
            <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <Checkbox checked={form.confirm} onCheckedChange={(v) => set('confirm', !!v)} data-testid="reg-confirm" aria-invalid={!!errors.confirm} />
              <span className="text-sm">{tr('I confirm that the information provided is accurate and complete.', 'أقر بأن المعلومات المقدمة صحيحة وكاملة.')}</span>
            </label>
            {errors.confirm && <p className="mt-1 text-xs text-destructive">{errors.confirm}</p>}
          </div>

          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="reg-error">{error}</div>}

          <Button type="submit" className="w-full" size="lg" disabled={loading} data-testid="reg-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tr('Register and send verification code', 'تسجيل وإرسال رمز التحقق')}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-primary">{title}</h2>
      {children}
    </div>
  );
}

function Field({ id, label, value, onChange, type = 'text', required, error, dir, hint, autoComplete }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input id={id} name={id} data-testid={`reg-${id}`} type={type} dir={dir} value={value} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className={error ? 'border-destructive' : ''} />
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function FilePick({ label, file, onChange }) {
  const ref = React.useRef(null);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{file.name}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <Input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      )}
    </div>
  );
}
