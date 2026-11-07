import React from 'react';
import { FileText, Download } from 'lucide-react';
import { useTr } from '@/lib/tr';

export const DOC_CATEGORIES = {
  financial_statement: ['Financial statements', 'البيانات المالية'],
  calculation_working: ['Calculation working', 'ورقة عمل الحساب'],
  payment_evidence: ['Payment evidence', 'مستندات الدفع'],
  additional: ['Additional documents', 'مستندات إضافية'],
  subsidiary: ['Subsidiary documents', 'مستندات الشركات التابعة'],
  other: ['Other', 'أخرى'],
};

export const yearOptions = () => Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 - i));

// Company fields a representative may request to change during an application (FR-06).
export const PROFILE_FIELDS = [
  ['company_name_ar', 'Company name (Arabic)', 'اسم الشركة (عربي)'],
  ['company_name_en', 'Company name (English)', 'اسم الشركة (إنجليزي)'],
  ['previous_company_name', 'Previous company name', 'الاسم السابق للشركة'],
  ['business_license_number', 'Business license no.', 'رقم الترخيص التجاري'],
  ['year_of_establishment', 'Year of establishment', 'سنة التأسيس'],
  ['company_type', 'Company type', 'نوع الشركة'],
  ['is_wll', 'W.L.L.', 'ذات مسؤولية محدودة', 'bool'],
  ['business_sector', 'Business sector', 'قطاع الأعمال'],
  ['capital', 'Capital (KWD)', 'رأس المال (د.ك)', 'number'],
  ['auditor_name', 'Auditor', 'مدقق الحسابات'],
  ['governorate', 'Governorate', 'المحافظة'],
  ['area', 'Area', 'المنطقة'],
  ['street', 'Street', 'الشارع'],
  ['building', 'Building', 'المبنى'],
  ['telephone', 'Telephone', 'الهاتف'],
  ['official_email', 'Official email', 'البريد الرسمي'],
  ['ceo_name_en', 'CEO name (English)', 'اسم الرئيس التنفيذي (إنجليزي)'],
  ['ceo_name_ar', 'CEO name (Arabic)', 'اسم الرئيس التنفيذي (عربي)'],
  ['ceo_job_title', 'CEO job title', 'المسمى الوظيفي للرئيس التنفيذي'],
  ['ceo_email', 'CEO email', 'بريد الرئيس التنفيذي'],
  ['ceo_mobile', 'CEO mobile', 'جوال الرئيس التنفيذي'],
  ['financial_manager_name', 'Financial manager', 'المدير المالي'],
  ['financial_manager_position', 'Financial manager position', 'منصب المدير المالي'],
  ['financial_manager_email', 'Financial manager email', 'بريد المدير المالي'],
  ['financial_manager_telephone', 'Financial manager telephone', 'هاتف المدير المالي'],
  ['financial_manager_mobile', 'Financial manager mobile', 'جوال المدير المالي'],
];

export function DocLink({ url, name, sub }) {
  const tr = useTr();
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <a href={url} target="_blank" rel="noreferrer" className="block text-sm font-medium text-accent hover:underline [overflow-wrap:anywhere]">{name || tr('Document', 'مستند')}</a>
        {sub && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{sub}</p>}
      </div>
      <a href={`${url}?download=1`} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={tr('Download', 'تحميل')}><Download className="h-4 w-4" /></a>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children ?? '—'}</dd>
    </div>
  );
}

export function Card({ title, children, actions, testId }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid={testId}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children, testId }) {
  const cls = {
    info: 'bg-accent/10 text-accent',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-destructive/10 text-destructive',
    success: 'bg-success/10 text-success',
  }[tone];
  return <div data-testid={testId} className={`rounded-lg p-3 text-sm ${cls}`}>{children}</div>;
}
