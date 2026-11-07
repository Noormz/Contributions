import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr, errMsg } from '@/lib/tr';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import ProgressSteps from '@/components/wizard/ProgressSteps';
import StepBasic from '@/components/wizard/StepBasic';
import StepStatements from '@/components/wizard/StepStatements';
import StepProfile from '@/components/wizard/StepProfile';
import StepSubsidiaries from '@/components/wizard/StepSubsidiaries';
import StepDocuments from '@/components/wizard/StepDocuments';
import StepPayment from '@/components/wizard/StepPayment';
import StepReview from '@/components/wizard/StepReview';
import { Notice } from '@/components/application/shared';
import { ChevronLeft, ChevronRight, Loader2, Save, Send } from 'lucide-react';

const LAST = 6;
const FIELDS = ['financial_year', 'declared_amount', 'profile_confirmed', 'profile_changes', 'additional_comments', 'payment_methods', 'payment_method', 'acknowledgements'];
const pickFields = (a) => Object.fromEntries(FIELDS.map((k) => [k, a?.[k] ?? (k === 'payment_methods' ? [] : k === 'profile_changes' || k === 'acknowledgements' ? {} : k === 'profile_confirmed' ? false : '')]));

export default function ApplicationWizard() {
  const tr = useTr();
  const { id: routeId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [appId, setAppId] = useState(routeId || null);
  const [app, setApp] = useState(null);
  const [data, setData] = useState(pickFields(null));
  const [dirty, setDirty] = useState(false);
  const [company, setCompany] = useState(null);
  const [statements, setStatements] = useState([]);
  const [subsidiaries, setSubsidiaries] = useState([]);
  const [docs, setDocs] = useState([]);
  const [settings, setSettings] = useState({});
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isRep = user?.role === 'company_representative';

  const loadChildren = useCallback(async (aid) => {
    if (!aid) return;
    const [fs, subs, d] = await Promise.all([
      base44.entities.FinancialStatement.filter({ application_id: aid }, { sort: 'created_date', limit: 100 }),
      base44.entities.SubsidiaryDeclaration.filter({ application_id: aid }, { sort: 'created_date', limit: 100 }),
      base44.entities.ApplicationDocument.filter({ application_id: aid }, { sort: 'created_date', limit: 200 }),
    ]);
    setStatements(fs.items || []);
    setSubsidiaries(subs.items || []);
    setDocs(d.items || []);
  }, []);

  useEffect(() => {
    if (!isRep) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        if (!user.company_id) { setFatal('no_company'); return; }
        const [c, s] = await Promise.all([
          base44.entities.Company.get(user.company_id),
          base44.entities.SystemSettings.filter({}, { limit: 200 }),
        ]);
        setCompany(c);
        setSettings(Object.fromEntries((s.items || []).map((r) => [r.setting_key, r.setting_value])));
        if (routeId) {
          const a = await base44.entities.ContributionApplication.get(routeId);
          if (!['draft', 'returned'].includes(a.status)) { setApp(a); setFatal('locked'); return; }
          setApp(a);
          setAppId(a.id);
          setData(pickFields(a));
          setCurrent(Math.min(Math.max((a.current_step || 1) - 1, 0), LAST));
          await loadChildren(a.id);
        }
      } catch (e) {
        setFatal(e.status === 404 ? 'not_found' : e.status === 403 ? 'forbidden' : errMsg(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [routeId, user, isRep, loadChildren]);

  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = (patch) => { setData((d) => ({ ...d, ...patch })); setDirty(true); };
  const partial = subsidiaries.some((s) => s.statement_incomplete);

  const stepIssues = useCallback((i) => {
    const out = [];
    if (i === 0 && !data.financial_year) out.push(tr('Select the financial year.', 'اختر السنة المالية.'));
    if (i === 0 && data.declared_amount !== '' && data.declared_amount !== null && Number(data.declared_amount) < 0) out.push(tr('The declared amount cannot be negative.', 'لا يمكن أن يكون المبلغ سالباً.'));
    if (i === 1 && statements.length === 0) out.push(tr('Upload at least one financial statement.', 'ارفع بياناً مالياً واحداً على الأقل.'));
    if (i === 2 && !data.profile_confirmed) out.push(tr('Confirm that the company profile is up to date.', 'أكد أن ملف الشركة محدث.'));
    if (i === 2) {
      const blank = Object.entries(data.profile_changes || {}).filter(([k, v]) => !['is_wll', 'previous_company_name'].includes(k) && (v === '' || v === null));
      if (blank.length) out.push(tr('Fields marked "Request change" cannot be left empty.', 'لا يمكن ترك الحقول المطلوب تعديلها فارغة.'));
    }
    if (i === 5) {
      const methods = data.payment_methods || [];
      if (!methods.length) out.push(tr('Select at least one payment method.', 'اختر طريقة دفع واحدة على الأقل.'));
      methods.filter((m) => m !== 'payment_gateway').forEach((m) => {
        if (!docs.some((d) => d.category === 'payment_evidence' && d.payment_method === m)) out.push(tr(`Upload the supporting document for ${m.replace(/_/g, ' ')}.`, `ارفع المستند الداعم لطريقة الدفع: ${m.replace(/_/g, ' ')}.`));
      });
    }
    if (i === 6 && !(data.acknowledgements?.accuracy && data.acknowledgements?.terms)) out.push(tr('Accept both acknowledgements.', 'وافق على الإقرارين.'));
    return out;
  }, [data, statements, docs, tr]);

  const allIssues = useMemo(() => [0, 1, 2, 3, 4, 5].flatMap((i) => stepIssues(i)), [stepIssues]);

  const save = async (extra = {}) => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...data, declared_amount: data.declared_amount === '' ? null : data.declared_amount, partial_calculation: partial, ...extra };
      if (!appId) {
        const existing = await base44.entities.ContributionApplication.filter({ company_id: company.id, financial_year: data.financial_year }, { limit: 10 });
        const open = (existing.items || []).find((a) => ['draft', 'returned'].includes(a.status));
        if (open) {
          setDirty(false);
          navigate(`/applications/${open.id}/edit`, { replace: true });
          setError(tr('You already have an application in progress for this year — it has been opened.', 'لديك طلب قيد الإعداد لهذه السنة — تم فتحه.'));
          return null;
        }
        const created = await base44.entities.ContributionApplication.create({ ...payload, company_id: company.id });
        setAppId(created.id);
        setApp(created);
        setDirty(false);
        navigate(`/applications/${created.id}/edit`, { replace: true });
        return created;
      }
      const updated = await base44.entities.ContributionApplication.update(appId, payload);
      setApp(updated);
      setDirty(false);
      return updated;
    } catch (e) {
      setError(errMsg(e));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    const iss = stepIssues(current);
    setIssues(iss);
    if (iss.length) return;
    const ok = await save({ current_step: current + 2 });
    if (ok) setCurrent((c) => Math.min(c + 1, LAST));
  };

  const goTo = (i) => { setIssues([]); setError(''); setCurrent(i); };

  const submit = async () => {
    const iss = [...allIssues, ...stepIssues(6)];
    setIssues(iss);
    if (iss.length) return;
    setSubmitting(true);
    setError('');
    try {
      const saved = await save();
      if (!saved) return;
      // Submit first so the requested profile changes are recorded against the issued reference.
      const submitted = await base44.functions.invoke('submitApplication', { application_id: appId });
      const changes = data.profile_changes || {};
      if (Object.keys(changes).length) {
        try {
          await base44.functions.invoke('applyProfileChanges', { company_id: company.id, changes, application_reference: submitted.application_reference || saved.application_reference || '', reason: 'Updated during application' });
        } catch (e) {
          // The application is already submitted; the requested changes stay on the application for the officer.
          console.warn('Profile changes could not be applied:', errMsg(e));
        }
      }
      setDirty(false);
      navigate(`/applications/${appId}/confirmation`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isRep) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm" data-testid="wizard-internal-msg">
        <p className="text-sm text-muted-foreground">{tr('Only company representatives can submit contribution applications.', 'يقتصر تقديم طلبات المساهمة على ممثلي الشركات.')}</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/applications">{tr('View applications', 'عرض الطلبات')}</Link></Button>
      </div>
    );
  }
  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (fatal) {
    const msg = {
      no_company: tr('Your account is not linked to a company yet. Complete your company registration first.', 'حسابك غير مرتبط بشركة بعد. أكمل تسجيل الشركة أولاً.'),
      locked: tr('This application has been submitted and can no longer be edited.', 'تم تقديم هذا الطلب ولا يمكن تعديله.'),
      not_found: tr('The requested application could not be found.', 'تعذر العثور على الطلب المطلوب.'),
      forbidden: tr('You do not have permission to access this application.', 'ليس لديك صلاحية للوصول إلى هذا الطلب.'),
    }[fatal] || fatal;
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">{msg}</p>
        <Button asChild variant="outline" className="mt-4"><Link to={app ? `/applications/${app.id}` : '/applications'}>{tr('Back to applications', 'العودة إلى الطلبات')}</Link></Button>
      </div>
    );
  }

  const steps = [
    tr('Basic info', 'معلومات أساسية'), tr('Financial statements', 'البيانات المالية'), tr('Profile verification', 'التحقق من الملف'),
    tr('Subsidiaries', 'الشركات التابعة'), tr('Documents', 'المستندات'), tr('Payment', 'الدفع'), tr('Review & submit', 'المراجعة والإرسال'),
  ];
  const needsApp = current > 0 && !appId;

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="application-wizard">
      <PageHeader
        title={app?.status === 'returned' ? tr('Update and resubmit application', 'تحديث الطلب وإعادة تقديمه') : tr('New contribution application', 'طلب مساهمة جديد')}
        subtitle={app ? `${app.application_reference || tr('Draft', 'مسودة')} · ${tr('FY', 'س.م')} ${data.financial_year || '—'}` : company?.company_name_en}
        crumbs={[{ label: tr('Applications', 'الطلبات'), to: '/applications' }, { label: app?.application_reference || tr('New', 'جديد') }]}
        actions={app && <StatusBadge value={app.status} />}
      />

      {app?.status === 'returned' && (
        <Notice tone="warning">{tr('This application was returned by the Contributions Unit. Review the comments on the application page, update it and resubmit.', 'أعادت وحدة المساهمات هذا الطلب. راجع الملاحظات في صفحة الطلب، ثم حدّثه وأعد تقديمه.')} <Link className="underline" to={`/applications/${app.id}`}>{tr('View comments', 'عرض الملاحظات')}</Link></Notice>
      )}

      <ProgressSteps steps={steps} current={current} onGo={goTo} />

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6" data-testid={`wizard-step-${current}`}>
        {needsApp ? <Notice tone="warning">{tr('Complete the first step first.', 'أكمل الخطوة الأولى أولاً.')}</Notice> : (
          <>
            {current === 0 && <StepBasic data={data} update={update} company={company} />}
            {current === 1 && <StepStatements appId={appId} company={company} financialYear={data.financial_year} statements={statements} reload={() => loadChildren(appId)} />}
            {current === 2 && <StepProfile data={data} update={update} company={company} />}
            {current === 3 && <StepSubsidiaries appId={appId} company={company} financialYear={data.financial_year} subsidiaries={subsidiaries} reload={() => loadChildren(appId)} />}
            {current === 4 && <StepDocuments appId={appId} company={company} docs={docs} reload={() => loadChildren(appId)} data={data} update={update} />}
            {current === 5 && <StepPayment appId={appId} company={company} docs={docs} reload={() => loadChildren(appId)} data={data} update={update} settings={settings} />}
            {current === 6 && <StepReview data={{ ...data, partial_calculation: partial }} update={update} company={company} statements={statements} subsidiaries={subsidiaries} docs={docs} goTo={goTo} issues={allIssues} />}
          </>
        )}

        {issues.length > 0 && current !== 6 && (
          <div className="mt-4"><Notice tone="error" testId="step-issues"><ul className="ms-5 list-disc">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Notice></div>
        )}
        {issues.length > 0 && current === 6 && allIssues.length === 0 && (
          <div className="mt-4"><Notice tone="error" testId="step-issues"><ul className="ms-5 list-disc">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Notice></div>
        )}
        {error && <div className="mt-4"><Notice tone="error" testId="wizard-error">{error}</Notice></div>}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" disabled={current === 0 || saving || submitting} onClick={() => goTo(current - 1)} className="gap-1.5" data-testid="wizard-prev">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {tr('Previous', 'السابق')}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" disabled={saving || submitting || (!appId && !data.financial_year)} onClick={() => save({ current_step: current + 1 })} className="gap-1.5" data-testid="wizard-save-draft">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {tr('Save draft', 'حفظ كمسودة')}
          </Button>
          {current < LAST ? (
            <Button onClick={next} disabled={saving} className="gap-1.5" data-testid="wizard-next">
              {tr('Next', 'التالي')} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          ) : (
            <Button disabled={submitting || saving} onClick={submit} className="gap-1.5" data-testid="wizard-submit">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {app?.status === 'returned' ? tr('Resubmit application', 'إعادة تقديم الطلب') : tr('Submit application', 'تقديم الطلب')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
