import React, { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { useTr } from '@/lib/tr';
import { useAuth } from '@/lib/AuthContext';
import NotificationBell from '@/components/comms/NotificationBell';
import KfasLogo from '@/components/brand/KfasEmblem';
import LookSwitcher from '@/components/LookSwitcher';
import AiAssistant from '@/components/ai/AiAssistant';
import {
  LayoutDashboard, Building2, FileText, FilePlus2, CreditCard, HelpCircle, Bell, Calculator, Mail, ScrollText,
  Receipt, ClipboardList, BarChart3, ShieldCheck, ClipboardCheck, LogOut, Languages, Menu, X, Wallet,
  Settings, FolderOpen, Inbox as InboxIcon, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const OFFICER = 'contributions_officer';
const MANAGER = 'contributions_manager';
const ACCOUNTS = 'accounts_unit';
const ADMIN = 'system_admin';
const ALL_INTERNAL = [OFFICER, MANAGER, ACCOUNTS, ADMIN];

// Sidebar sections: { key, en, ar, items: [path, icon, en, ar, roles?][] }. A section without a
// label is rendered without a heading (the dashboard link).
const companyNav = [
  { key: 'home', items: [['/', LayoutDashboard, 'Dashboard', 'لوحة التحكم'], ['/company-profile', Building2, 'Company Profile', 'ملف الشركة']] },
  { key: 'applications', en: 'Applications', ar: 'الطلبات', items: [
    ['/applications', FileText, 'My Applications', 'طلباتي'],
    ['/applications/new', FilePlus2, 'New Application', 'طلب جديد'],
  ] },
  { key: 'finance', en: 'Payments & Documents', ar: 'المدفوعات والمستندات', items: [
    ['/payments', CreditCard, 'Payments', 'المدفوعات'],
    ['/receipt-vouchers', Receipt, 'Receipt Vouchers', 'سندات القبض'],
    ['/clearance-letters', ScrollText, 'Clearance Letters', 'شهادات المخالصة'],
  ] },
  { key: 'support', en: 'Communication', ar: 'التواصل', items: [
    ['/inbox', Mail, 'Messages', 'الرسائل'],
    ['/help', HelpCircle, 'Help & Inquiries', 'المساعدة والاستفسارات'],
  ] },
];

const internalNav = [
  { key: 'home', items: [['/', LayoutDashboard, 'Executive Dashboard', 'لوحة المعلومات']] },
  { key: 'applications', en: 'Applications', ar: 'الطلبات', items: [
    ['/applications', FileText, 'Contribution Applications', 'طلبات المساهمة'],
    ['/calculation-review', Calculator, 'Calculation Review', 'مراجعة الحسابات', [OFFICER, MANAGER, ADMIN]],
    ['/approvals', ClipboardCheck, 'Approval Management', 'إدارة الاعتمادات', [MANAGER, ADMIN]],
    ['/officer-workload', ClipboardList, 'Officer Workload', 'عبء عمل الموظفين', [MANAGER, ADMIN, OFFICER]],
  ] },
  { key: 'companies', en: 'Companies', ar: 'الشركات', items: [
    ['/companies', Building2, 'Company Registry', 'سجل الشركات'],
    ['/financial-statements', FolderOpen, 'Financial Statements', 'البيانات المالية'],
    ['/inquiries', HelpCircle, 'Inquiries', 'الاستفسارات', [OFFICER, MANAGER, ADMIN]],
  ] },
  { key: 'finance', en: 'Finance', ar: 'المالية', items: [
    ['/payments', Wallet, 'Payment Management', 'إدارة المدفوعات'],
    ['/receipt-vouchers', Receipt, 'Receipt Vouchers', 'سندات القبض'],
    ['/clearance-letters', ScrollText, 'Clearance Letters', 'شهادات المخالصة'],
  ] },
  { key: 'communication', en: 'Communication', ar: 'التواصل', items: [
    ['/inbox', Mail, 'Communication Inbox', 'صندوق المراسلات'],
    ['/mailbox', InboxIcon, 'Sent Email Log', 'سجل البريد المرسل', ALL_INTERNAL],
  ] },
  { key: 'insights', en: 'Reports & Admin', ar: 'التقارير والإدارة', items: [
    ['/reports', BarChart3, 'Reports & Analytics', 'التقارير والتحليلات', ALL_INTERNAL],
    ['/audit-logs', ShieldCheck, 'Audit Logs', 'سجل التدقيق', [MANAGER, ADMIN]],
    ['/administration', Settings, 'Administration', 'الإدارة', [ADMIN]],
  ] },
];

// Pages reachable from the header (bell) rather than the sidebar, for the page title.
const extraTitles = [['/notifications', Bell, 'Notifications', 'الإشعارات']];

const COLLAPSE_KEY = 'nav_collapsed_sections';
const readCollapsed = () => { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'); } catch { return []; } };

export default function Layout({ children }) {
  const { language, toggleLanguage, t } = useTranslation();
  const tr = useTr();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const isInternal = user?.role && user.role !== 'company_representative';
  const sections = useMemo(() => (isInternal ? internalNav : companyNav)
    .map((sec) => ({ ...sec, items: sec.items.filter(([, , , , roles]) => !roles || roles.includes(user.role)) }))
    .filter((sec) => sec.items.length), [isInternal, user?.role]);
  const nav = useMemo(() => [...sections.flatMap((sec) => sec.items), ...extraTitles], [sections]);
  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  const toggleSection = (key) => setCollapsed((c) => {
    const next = c.includes(key) ? c.filter((k) => k !== key) : [...c, key];
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const isActivePath = (to) => (to === '/' ? location.pathname === '/' : location.pathname === to || location.pathname.startsWith(`${to}/`));
  const portalLabel = isInternal ? tr('Internal Portal', 'البوابة الداخلية') : tr('Company Portal', 'بوابة الشركات');
  const roleLabel = user?.role ? t(`role_${user.role}`) : '';

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    const match = nav
      .filter(([to]) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (match) return tr(match[2], match[3]);
    if (path.startsWith('/records/')) return tr('Record', 'سجل');
    return tr('Dashboard', 'لوحة التحكم');
  }, [location.pathname, nav, tr]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        data-shell="sidebar"
        className={cn(
          'print:hidden fixed inset-y-0 start-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0'
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <KfasLogo onDark className="look-kfas-only h-8 w-auto shrink-0" />
          <KfasLogo className="look-dynamics-only h-8 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-white">{t('appName')}</p>
            <p className="text-xs text-sidebar-foreground/70">{portalLabel}</p>
          </div>
          <button className="ms-auto text-sidebar-foreground lg:hidden" onClick={() => setMobileOpen(false)} aria-label={tr('Close menu', 'إغلاق القائمة')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-3 py-3" aria-label={tr('Main navigation', 'القائمة الرئيسية')}>
          {sections.map((sec) => {
            // A section holding the current page stays open even if collapsed earlier.
            const open = !sec.en || !collapsed.includes(sec.key) || sec.items.some(([to]) => isActivePath(to));
            return (
              <div key={sec.key} className="space-y-0.5">
                {sec.en && (
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.key)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between rounded-md px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                  >
                    <span>{tr(sec.en, sec.ar)}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90 rtl:rotate-90')} />
                  </button>
                )}
                {open && sec.items.map(([to, Icon, en, ar]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/' || to === '/applications'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => cn(
                      'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{tr(en, ar)}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-lg bg-sidebar-accent/50 p-3" data-testid="current-user">
            <p className="text-sm font-semibold text-white [overflow-wrap:anywhere]">{user?.full_name || user?.email}</p>
            <p className="text-xs text-sidebar-foreground/70 break-words">{roleLabel}</p>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-shell="topbar" className="print:hidden sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-card/80 px-4 py-2 backdrop-blur sm:px-6">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={tr('Open menu', 'فتح القائمة')}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 sm:block">
            <p className="text-xs text-muted-foreground">{portalLabel}</p>
            <p className="text-sm font-semibold break-words" data-testid="page-title">{pageTitle}</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <NotificationBell />
            <LookSwitcher />
            <Button variant="outline" size="sm" onClick={toggleLanguage} className="gap-1.5">
              <Languages className="h-4 w-4" />
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logout()} className="gap-1.5 text-muted-foreground" data-testid="logout">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 print:p-0">
          <div className="mx-auto max-w-7xl animate-fade-in">{children || <Outlet />}</div>
        </main>
      </div>
      <AiAssistant />
    </div>
  );
}
