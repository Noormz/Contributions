import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useTr, errMsg } from '@/lib/tr';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/common/PageHeader';
import LookupsPanel, { RestrictedNotice } from '@/components/admin/LookupsPanel';
import SettingsPanel from '@/components/admin/SettingsPanel';
import UsersPanel from '@/components/admin/UsersPanel';
import CrudPanel from '@/components/admin/CrudPanel';
import DynamicsPanel from '@/components/admin/DynamicsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, BellRing, AlertTriangle } from 'lucide-react';
import { loadSettingsMap, KFAS_KEYS, bankDetailsConfigured } from '@/components/payments/data';

const CURRENCY_KEYS = ['default_currency', 'enabled_currencies', 'currency_symbol_position', 'amount_decimals', 'exchange_rate_usd'];

// Reminds administrators to enter KFAS's bank account; until then companies are asked to request it.
function BankSetupNotice() {
  const tr = useTr();
  const [missing, setMissing] = useState(false);
  useEffect(() => { loadSettingsMap(KFAS_KEYS).then((s) => setMissing(!bankDetailsConfigured(s))); }, []);
  if (!missing) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" role="note" data-testid="bank-setup-notice">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p>
        <span className="font-semibold">{tr('KFAS bank account not set.', 'لم يتم إدخال الحساب البنكي للمؤسسة.')}</span>{' '}
        {tr('Enter the bank name, account number and IBAN under Settings (kfas_bank_name, kfas_account_number, kfas_iban). Until then, companies paying by transfer or deposit are asked to contact KFAS for the account details.',
          'أدخل اسم البنك ورقم الحساب والآيبان في الإعدادات (kfas_bank_name وkfas_account_number وkfas_iban). وحتى ذلك الحين، يُطلب من الشركات التي تدفع بالتحويل أو الإيداع التواصل مع المؤسسة للحصول على تفاصيل الحساب.')}
      </p>
    </div>
  );
}

function RemindersPanel() {
  const tr = useTr();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const run = async () => {
    setBusy(true);
    setResult('');
    try {
      const r = await base44.functions.invoke('runReminders');
      setResult(tr(`${r.sent} reminder(s) sent.`, `تم إرسال ${r.sent} تذكير.`));
    } catch (e) {
      setResult(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <p className="text-sm text-muted-foreground">{tr('Officers are reminded automatically every hour about applications assigned or under review longer than the configured number of days (setting “pending_review_reminder_days”). Each application is reminded at most once per day.', 'يتم تذكير الموظفين تلقائياً كل ساعة بالطلبات المسندة أو قيد المراجعة لفترة أطول من عدد الأيام المحدد (الإعداد pending_review_reminder_days). يُذكَّر بكل طلب مرة واحدة يومياً كحد أقصى.')}</p>
      <Button onClick={run} disabled={busy} className="gap-1.5" data-testid="run-reminders">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} {tr('Run pending-review reminders now', 'تشغيل تذكيرات المراجعة الآن')}</Button>
      {result && <p className="text-sm font-medium" role="status" data-testid="reminders-result">{result}</p>}
    </div>
  );
}

export default function Administration() {
  const { t } = useTranslation();
  const tr = useTr();
  const { user } = useAuth();
  const isAdmin = user?.role === 'system_admin';

  const templateFields = [
    { key: 'template_key', label: tr('Key', 'المفتاح'), required: true, list: true, lockOnEdit: true },
    { key: 'template_name', label: tr('Name', 'الاسم'), required: true, list: true },
    { key: 'category', label: tr('Category', 'الفئة'), list: true },
    { key: 'is_active', label: tr('Active', 'نشط'), type: 'switch', list: true },
    { key: 'subject_en', label: tr('Subject (English)', 'الموضوع (إنجليزي)'), required: true, full: true },
    { key: 'subject_ar', label: tr('Subject (Arabic)', 'الموضوع (عربي)'), rtl: true, full: true },
    { key: 'body_en', label: tr('Body (English)', 'النص (إنجليزي)'), type: 'textarea', required: true },
    { key: 'body_ar', label: tr('Body (Arabic)', 'النص (عربي)'), type: 'textarea', rtl: true },
  ];
  const faqFields = [
    { key: 'question_en', label: tr('Question (English)', 'السؤال (إنجليزي)'), required: true, list: true, full: true },
    { key: 'question_ar', label: tr('Question (Arabic)', 'السؤال (عربي)'), rtl: true, list: true, full: true },
    { key: 'answer_en', label: tr('Answer (English)', 'الإجابة (إنجليزي)'), type: 'textarea', required: true },
    { key: 'answer_ar', label: tr('Answer (Arabic)', 'الإجابة (عربي)'), type: 'textarea', rtl: true },
    { key: 'sort_order', label: tr('Sort order', 'الترتيب'), type: 'number', list: true },
    { key: 'is_active', label: tr('Active', 'نشط'), type: 'switch', list: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav_administration')} subtitle={tr('Users and roles, lookups, settings, email templates, FAQ and reminders.', 'المستخدمون والأدوار والقوائم والإعدادات وقوالب البريد والأسئلة الشائعة والتذكيرات.')} crumbs={[{ label: t('nav_administration') }]} />
      {isAdmin && <BankSetupNotice />}
      {isAdmin ? (
        <Tabs defaultValue="users">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="users" data-testid="tab-users">{tr('Users & Roles', 'المستخدمون والأدوار')}</TabsTrigger>
            <TabsTrigger value="lookups">{t('admin_lookups')}</TabsTrigger>
            <TabsTrigger value="settings">{t('admin_settings')}</TabsTrigger>
            <TabsTrigger value="currency">{t('admin_currency')}</TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates">{tr('Email Templates', 'قوالب البريد')}</TabsTrigger>
            <TabsTrigger value="faq" data-testid="tab-faq">{tr('FAQ', 'الأسئلة الشائعة')}</TabsTrigger>
            <TabsTrigger value="reminders" data-testid="tab-reminders">{tr('Reminders', 'التذكيرات')}</TabsTrigger>
            <TabsTrigger value="dynamics" data-testid="tab-dynamics">{tr('Dynamics 365', 'Dynamics 365')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
          <TabsContent value="lookups" className="mt-4"><LookupsPanel /></TabsContent>
          <TabsContent value="settings" className="mt-4"><SettingsPanel group="application" /></TabsContent>
          <TabsContent value="currency" className="mt-4"><SettingsPanel group="currency" fixedKeys={CURRENCY_KEYS} allowAdd={false} allowDelete={false} /></TabsContent>
          <TabsContent value="templates" className="mt-4">
            <CrudPanel entity="EmailTemplate" sort="template_key" fields={templateFields} defaults={{ category: 'correspondence', is_active: true }} testId="templates"
              addLabel={tr('Add template', 'إضافة قالب')}
              hint={tr('Placeholders: {{name}}, {{company}}, {{reference}}, {{amount}}, {{comments}}, {{reason}}, {{response}}, {{days}}, {{subject}}, {{link}}. System notifications use their template key; templates with category "correspondence" are offered in the email composer.', 'المتغيرات: {{name}} و{{company}} و{{reference}} و{{amount}} و{{comments}} و{{reason}} و{{response}} و{{days}} و{{subject}} و{{link}}. تستخدم إشعارات النظام مفتاح القالب.')} />
          </TabsContent>
          <TabsContent value="faq" className="mt-4">
            <CrudPanel entity="FaqEntry" sort="sort_order" fields={faqFields} defaults={{ is_active: true, sort_order: 0 }} testId="faq" addLabel={tr('Add FAQ entry', 'إضافة سؤال')} />
          </TabsContent>
          <TabsContent value="reminders" className="mt-4"><RemindersPanel /></TabsContent>
          <TabsContent value="dynamics" className="mt-4"><DynamicsPanel /></TabsContent>
        </Tabs>
      ) : (
        <RestrictedNotice />
      )}
    </div>
  );
}
