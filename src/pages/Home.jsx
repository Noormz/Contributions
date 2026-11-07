import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useTr, fmtMoney, fmtDateTime, STATUS_LABELS, PAYMENT_METHODS } from '@/lib/tr';
import KpiCard from '@/components/KpiCard';
import { Panel, AppList } from '@/components/dashboard/Widgets';
import { Button } from '@/components/ui/button';
import {
  Building2, FileText, ClipboardCheck, CheckCircle2, Wallet, Clock, FilePlus2, MessageSquare, HelpCircle,
  CreditCard, Landmark, AlertTriangle, FileEdit, Undo2,
} from 'lucide-react';

const COLORS = ['#1e3a5f', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#56ccf2', '#828282'];
const OPEN = ['submitted', 'assigned', 'under_review', 'calculation_review', 'pending_manager_approval'];

export default function Home() {
  const { user } = useAuth();
  const internal = user?.role && user.role !== 'company_representative';
  return internal ? <InternalDashboard user={user} /> : <CompanyDashboard user={user} />;
}

function Welcome({ user, subtitle, action }) {
  const tr = useTr();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr('Welcome back', 'مرحباً بعودتك')}{user?.full_name ? `, ${user.full_name}` : ''}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function CompanyDashboard({ user }) {
  const tr = useTr();
  const { language } = useTranslation();
  const [apps, setApps] = useState([]);
  const [notes, setNotes] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, n, c] = await Promise.all([
          base44.entities.ContributionApplication.filter({}, { sort: '-created_date', limit: 200 }),
          base44.entities.Notification.filter({}, { sort: '-created_date', limit: 5 }),
          user?.company_id ? base44.entities.Company.get(user.company_id).catch(() => null) : null,
        ]);
        setApps(a.items || []);
        setNotes(n.items || []);
        setCompany(c);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.company_id]);

  const count = (...s) => apps.filter((a) => s.includes(a.status)).length;
  const dueApps = apps.filter((a) => ['approved', 'accounts_processing'].includes(a.status) && a.contribution_due != null);
  const totalDue = dueApps.reduce((s, a) => s + Number(a.contribution_due || 0), 0);

  if (!user?.company_id) {
    return (
      <div className="space-y-6">
        <Welcome user={user} subtitle={tr('Company overview', 'نظرة عامة على الشركة')} />
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 text-sm">
          {tr('Your account is not linked to a company yet. Please complete your company registration or contact the Contributions Unit.', 'حسابك غير مرتبط بشركة بعد. يرجى إكمال تسجيل الشركة أو التواصل مع وحدة المساهمات.')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Welcome
        user={user}
        subtitle={company ? (language === 'ar' ? company.company_name_ar || company.company_name_en : company.company_name_en) : tr('Company overview', 'نظرة عامة على الشركة')}
        action={<Button asChild data-testid="dash-new-application"><Link to="/applications/new"><FilePlus2 className="h-4 w-4" /> {tr('New application', 'طلب جديد')}</Link></Button>}
      />
      {company?.profile_locked && (
        <p className="rounded-lg bg-accent/5 p-3 text-sm text-muted-foreground">{tr('Your company profile is locked while an application is in progress. Field changes can be requested from the application.', 'ملف شركتك مقفل أثناء معالجة طلب. يمكن طلب تعديل الحقول من خلال الطلب.')}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiCard icon={FileEdit} label={tr('Drafts', 'المسودات')} value={count('draft')} loading={loading} to="/applications?status=draft" testId="kpi-draft" />
        <KpiCard icon={Undo2} label={tr('Returned for changes', 'معادة للتعديل')} value={count('returned')} loading={loading} tone="danger" to="/applications?status=returned" testId="kpi-returned" />
        <KpiCard icon={Clock} label={tr('In review', 'قيد المراجعة')} value={count(...OPEN)} loading={loading} tone="warning" to={`/applications?status=${OPEN.join(',')}`} testId="kpi-in-review" />
        <KpiCard icon={Landmark} label={tr('Approved — awaiting payment', 'معتمدة — بانتظار الدفع')} value={count('approved', 'accounts_processing')} loading={loading} tone="accent" to="/applications?status=approved,accounts_processing" testId="kpi-approved" />
        <KpiCard icon={CheckCircle2} label={tr('Completed', 'مكتملة')} value={count('completed')} loading={loading} tone="success" to="/applications?status=completed" testId="kpi-completed" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {dueApps.length > 0 && (
            <Panel title={tr('Approved contributions', 'المساهمات المعتمدة')} testId="dash-due">
              <ul className="divide-y divide-border">
                {dueApps.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link to={`/applications/${a.id}`} className="font-medium hover:underline">{a.application_reference} · {tr('FY', 'السنة')} {a.financial_year}</Link>
                    <span className="font-semibold tabular-nums">{fmtMoney(a.contribution_due)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">{tr('Total approved contribution', 'إجمالي المساهمة المعتمدة')}</span>
                <span className="font-bold tabular-nums">{fmtMoney(totalDue)}</span>
              </div>
              <Button asChild size="sm" variant="outline" className="mt-3"><Link to="/payments"><CreditCard className="h-4 w-4" /> {tr('Go to payments', 'الانتقال إلى المدفوعات')}</Link></Button>
            </Panel>
          )}
          <Panel title={tr('Recent applications', 'أحدث الطلبات')} action={<Link to="/applications" className="text-sm text-accent hover:underline">{tr('View all', 'عرض الكل')}</Link>}>
            <AppList apps={apps.slice(0, 6)} showCompany={false} empty={tr('No applications yet. Start a new application.', 'لا توجد طلبات بعد. ابدأ طلباً جديداً.')} />
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title={tr('Quick actions', 'إجراءات سريعة')}>
            <div className="space-y-2">
              {[['/applications/new', FilePlus2, 'New application', 'طلب جديد'], ['/payments', CreditCard, 'Payments', 'المدفوعات'], ['/inbox', MessageSquare, 'Messages', 'الرسائل'], ['/help', HelpCircle, 'Help & inquiries', 'المساعدة والاستفسارات']].map(([to, Icon, en, ar]) => (
                <Button key={to} asChild variant="outline" className="w-full justify-start"><Link to={to}><Icon className="h-4 w-4" /> {tr(en, ar)}</Link></Button>
              ))}
            </div>
          </Panel>
          <Panel title={tr('Latest notifications', 'أحدث الإشعارات')} action={<Link to="/notifications" className="text-sm text-accent hover:underline">{tr('View all', 'عرض الكل')}</Link>}>
            {notes.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{tr('No notifications', 'لا توجد إشعارات')}</p> : (
              <ul className="space-y-2.5">
                {notes.map((n) => (
                  <li key={n.id}>
                    <Link to={n.link || '/notifications'} className="block text-sm hover:underline">
                      <span className={n.is_read ? '' : 'font-semibold'}>{language === 'ar' ? n.title_ar || n.title : n.title}</span>
                      <span className="block text-xs text-muted-foreground">{fmtDateTime(n.created_date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function InternalDashboard({ user }) {
  const tr = useTr();
  const [apps, setApps] = useState([]);
  const [payments, setPayments] = useState([]);
  const [companies, setCompanies] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, p, c, h] = await Promise.all([
          base44.entities.ContributionApplication.filter({}, { sort: '-created_date', limit: 1000 }),
          base44.entities.Payment.filter({}, { sort: '-created_date', limit: 1000 }),
          base44.entities.Company.count({}),
          base44.entities.ApprovalHistory.filter({}, { sort: '-created_date', limit: 8 }).catch(() => ({ items: [] })),
        ]);
        setApps(a.items || []);
        setPayments(p.items || []);
        setCompanies(c);
        setHistory(h.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const count = (...s) => apps.filter((a) => s.includes(a.status)).length;
  const verified = payments.filter((p) => p.payment_status === 'verified');
  const verifiedSum = verified.reduce((s, p) => s + Number(p.payment_amount || 0), 0);
  const pendingPayments = payments.filter((p) => p.payment_status === 'pending');

  const byStatus = useMemo(() => {
    const m = {};
    apps.forEach((a) => { m[a.status] = (m[a.status] || 0) + 1; });
    return Object.entries(m).map(([s, n]) => ({ status: STATUS_LABELS[s] ? tr(...STATUS_LABELS[s]) : s, n }));
  }, [apps, tr]);
  const byMonth = useMemo(() => {
    const m = {};
    verified.forEach((p) => { const k = String(p.payment_date || p.created_date).slice(0, 7); m[k] = (m[k] || 0) + Number(p.payment_amount || 0); });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments]);
  const byMethod = useMemo(() => PAYMENT_METHODS.map((m) => ({ name: tr(m.en, m.ar), value: verified.filter((p) => p.payment_method === m.value).reduce((s, p) => s + Number(p.payment_amount || 0), 0) })).filter((x) => x.value > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [payments, tr]);

  const role = user.role;
  const mine = apps.filter((a) => a.assigned_officer_id === user.id && OPEN.includes(a.status));
  const waiting = apps.filter((a) => a.status === 'pending_manager_approval');
  const accounts = apps.filter((a) => a.status === 'accounts_processing');

  return (
    <div className="space-y-6">
      <Welcome user={user} subtitle={tr('Executive overview', 'نظرة تنفيذية')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Building2} label={tr('Registered companies', 'الشركات المسجلة')} value={companies} loading={loading} to="/companies" testId="kpi-companies" />
        <KpiCard icon={FileText} label={tr('Submitted / assigned', 'مقدمة / مسندة')} value={count('submitted', 'assigned')} loading={loading} tone="accent" to="/applications?status=submitted,assigned" testId="kpi-submitted" />
        <KpiCard icon={Clock} label={tr('Under review', 'قيد المراجعة')} value={count('under_review', 'calculation_review')} loading={loading} tone="warning" to="/applications?status=under_review,calculation_review" testId="kpi-under-review" />
        <KpiCard icon={ClipboardCheck} label={tr('Pending manager approval', 'بانتظار اعتماد المدير')} value={count('pending_manager_approval')} loading={loading} tone="warning" to="/applications?status=pending_manager_approval" testId="kpi-pending-approval" />
        <KpiCard icon={Landmark} label={tr('Accounts processing', 'لدى وحدة الحسابات')} value={count('accounts_processing')} loading={loading} tone="accent" to="/applications?status=accounts_processing" testId="kpi-accounts" />
        <KpiCard icon={CheckCircle2} label={tr('Completed', 'مكتملة')} value={count('completed')} loading={loading} tone="success" to="/applications?status=completed" testId="kpi-completed" />
        <KpiCard icon={Wallet} label={tr('Verified payments', 'المدفوعات المؤكدة')} value={fmtMoney(verifiedSum)} loading={loading} tone="success" to="/payments?status=verified" testId="kpi-verified" />
        <KpiCard icon={AlertTriangle} label={tr('Payments to verify', 'مدفوعات بانتظار التأكيد')} value={pendingPayments.length} loading={loading} tone="danger" to="/payments?status=pending" testId="kpi-pending-payments" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {role === 'contributions_officer' && (
          <Panel title={tr('Assigned to me', 'المسندة إليّ')} testId="widget-mine" action={<Link to={`/applications?officer=${user.id}`} className="text-sm text-accent hover:underline">{tr('View all', 'عرض الكل')}</Link>}>
            <AppList apps={mine.slice(0, 8)} empty={tr('No open applications assigned to you.', 'لا توجد طلبات مفتوحة مسندة إليك.')} />
          </Panel>
        )}
        {['contributions_manager', 'system_admin'].includes(role) && (
          <Panel title={tr('Waiting for my approval', 'بانتظار اعتمادي')} testId="widget-approvals" action={<Link to="/approvals" className="text-sm text-accent hover:underline">{tr('Open approvals', 'فتح الاعتمادات')}</Link>}>
            <AppList apps={waiting.slice(0, 8)} empty={tr('Nothing waiting for approval.', 'لا يوجد ما ينتظر الاعتماد.')} />
          </Panel>
        )}
        {['accounts_unit', 'system_admin'].includes(role) && (
          <>
            <Panel title={tr('Ready for receipt voucher', 'جاهزة لسند القبض')} testId="widget-accounts" action={<Link to="/receipt-vouchers" className="text-sm text-accent hover:underline">{tr('Receipt vouchers', 'سندات القبض')}</Link>}>
              <AppList apps={accounts.slice(0, 8)} empty={tr('No approved applications waiting.', 'لا توجد طلبات معتمدة بالانتظار.')} />
            </Panel>
            <Panel title={tr('Payments to verify', 'مدفوعات بانتظار التأكيد')} testId="widget-payments" action={<Link to="/payments?status=pending" className="text-sm text-accent hover:underline">{tr('View all', 'عرض الكل')}</Link>}>
              {pendingPayments.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{tr('No pending payments.', 'لا توجد مدفوعات معلقة.')}</p> : (
                <ul className="divide-y divide-border">
                  {pendingPayments.slice(0, 8).map((p) => (
                    <li key={p.id}><Link to={`/records/Payment/${p.id}`} className="flex justify-between gap-3 py-2.5 text-sm hover:opacity-80"><span className="min-w-0 [overflow-wrap:anywhere]">{p.payment_reference} · {p.company_name}</span><span className="shrink-0 tabular-nums">{fmtMoney(p.payment_amount)}</span></Link></li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
        <Panel title={tr('Recent workflow activity', 'آخر نشاطات سير العمل')} testId="widget-activity">
          {history.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{tr('No activity yet', 'لا يوجد نشاط بعد')}</p> : (
            <ul className="space-y-2.5">
              {history.map((h) => {
                const app = apps.find((a) => a.id === h.application_id);
                return (
                  <li key={h.id}>
                    <Link to={`/applications/${h.application_id}`} className="block text-sm hover:underline">
                      <span className="font-medium capitalize">{String(h.action).replace(/_/g, ' ')}</span> · {app?.application_reference || ''}
                      <span className="block text-xs text-muted-foreground">{h.action_by_name} · {fmtDateTime(h.action_date || h.created_date)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" dir="ltr">
        <Panel title={tr('Applications by status', 'الطلبات حسب الحالة')} testId="chart-status">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="n" name={tr('Applications', 'الطلبات')} fill={COLORS[1]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={tr('Collections by month (KWD)', 'التحصيل الشهري (د.ك)')} testId="chart-collections">
          <div className="h-64">
            {byMonth.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">{tr('No verified payments yet', 'لا توجد مدفوعات مؤكدة بعد')}</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtMoney(v)} />
                  <Bar dataKey="amount" name={tr('Collected', 'المحصل')} fill={COLORS[2]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
        <Panel title={tr('Payment method split', 'توزيع طرق الدفع')} testId="chart-methods">
          <div className="h-64">
            {byMethod.length === 0 ? <p className="py-20 text-center text-sm text-muted-foreground">{tr('No verified payments yet', 'لا توجد مدفوعات مؤكدة بعد')}</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byMethod} dataKey="value" nameKey="name" outerRadius={80} label={false}>
                    {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
