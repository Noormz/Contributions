import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTr } from '@/lib/tr';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/review/StatusBadge';
import ProfileTab from '@/components/company/ProfileTab';
import RelationshipsTab from '@/components/company/RelationshipsTab';
import { UsersTab, ApplicationsTab, DocumentsTab, HistoryTab } from '@/components/company/CompanyTabs';
import BalancePanel from '@/components/payments/BalancePanel';
import ThreadsPanel from '@/components/comms/ThreadsPanel';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, AlertTriangle, ShieldAlert, Building2, ChevronLeft } from 'lucide-react';

const EDITOR_ROLES = ['contributions_officer', 'contributions_manager', 'system_admin'];

export default function CompanyProfile() {
  const tr = useTr();
  const { id: routeId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const internal = user?.role && user.role !== 'company_representative';
  const companyId = routeId || user?.company_id;
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const tab = searchParams.get('tab') || 'profile';
  const setTab = (t) => setSearchParams(t === 'profile' ? {} : { tab: t }, { replace: true });

  const load = useCallback(async (silent = false) => {
    if (!companyId) { setLoading(false); setError('no_company'); return; }
    if (!silent) setLoading(true);
    setError(null);
    try {
      setCompany(await base44.entities.Company.get(companyId));
    } catch (e) {
      setCompany(null);
      setError(e.status === 404 ? 'not_found' : e.status === 403 ? 'forbidden' : e.message);
    }
    if (!silent) setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

  if (error || !company) {
    const msgs = {
      no_company: [tr('Your account is not linked to a company yet.', 'حسابك غير مرتبط بشركة بعد.'), tr('Contact the Contributions Unit to link your account.', 'تواصل مع وحدة المساهمات لربط حسابك.')],
      forbidden: [tr('You do not have permission to access this record.', 'ليس لديك صلاحية للوصول إلى هذا السجل.'), ''],
      not_found: [tr('The requested record could not be found.', 'تعذر العثور على السجل المطلوب.'), ''],
    };
    const [title, sub] = msgs[error] || [tr('Something went wrong while loading the company.', 'حدث خطأ أثناء تحميل الشركة.'), ''];
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center" data-testid="company-error">
        {error === 'forbidden' ? <ShieldAlert className="h-10 w-10 text-destructive" /> : error === 'no_company' ? <Building2 className="h-10 w-10 text-muted-foreground" /> : <AlertTriangle className="h-10 w-10 text-warning" />}
        <p className="font-semibold">{title}</p>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        {routeId && <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {tr('Back', 'رجوع')}</Button>}
      </div>
    );
  }

  const tabs = [
    ['profile', tr('Profile', 'الملف')],
    ['relationships', tr('Parent & subsidiaries', 'الشركات الأم والتابعة')],
    ['users', tr('Users', 'المستخدمون')],
    ['applications', tr('Applications', 'الطلبات')],
    ['documents', tr('Documents', 'المستندات')],
    ...(internal ? [['balance', tr('Balance & payments', 'الرصيد والمدفوعات')]] : []),
    ['communications', tr('Communications', 'المراسلات')],
    ['history', tr('Change history', 'سجل التعديلات')],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={company.company_name_ar ? `${company.company_name_ar} — ${company.company_name_en}` : company.company_name_en}
        crumbs={internal ? [{ label: tr('Company Registry', 'سجل الشركات'), to: '/companies' }, { label: company.company_name_en }] : [{ label: tr('Company Profile', 'ملف الشركة') }]}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-sm" data-testid="company-header">
        <span><span className="text-muted-foreground">{tr('CR no.', 'السجل التجاري')}: </span><span className="font-medium">{company.commercial_registration_number || '—'}</span></span>
        <span><span className="text-muted-foreground">{tr('COFS file no.', 'ملف COFS')}: </span><span className="font-medium">{company.cofs_file_number || '—'}</span></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">{tr('Status', 'الحالة')}:</span> <StatusBadge value={company.status} /></span>
        {company.is_wll && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{tr('W.L.L.', 'ذ.م.م')}</span>}
        {company.profile_locked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning" data-testid="locked-badge">
            <Lock className="h-3 w-3" /> {tr('Profile locked', 'الملف مقفل')}
          </span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border scrollbar-thin" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} data-testid={`company-tab-${key}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab company={company} internal={internal} readOnly={internal && !EDITOR_ROLES.includes(user.role)} onSaved={() => load(true)} />}
      {tab === 'relationships' && <RelationshipsTab company={company} internal={internal} />}
      {tab === 'users' && <UsersTab company={company} />}
      {tab === 'applications' && <ApplicationsTab company={company} />}
      {tab === 'documents' && <DocumentsTab company={company} />}
      {tab === 'balance' && internal && <BalancePanel companyId={company.id} />}
      {tab === 'communications' && <ThreadsPanel companyId={company.id} />}
      {tab === 'history' && <HistoryTab company={company} />}
    </div>
  );
}
