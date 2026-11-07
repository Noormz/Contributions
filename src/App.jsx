import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/i18n';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import EntityListPage from '@/components/EntityListPage';
import Home from '@/pages/Home';
import ApplicationWizard from '@/pages/ApplicationWizard';
import ApplicationsList from '@/pages/ApplicationsList';
import ApplicationDetail from '@/pages/ApplicationDetail';
import ApplicationConfirmation from '@/pages/ApplicationConfirmation';
import CalculationReview from '@/pages/CalculationReview';
import ApprovalManagement from '@/pages/ApprovalManagement';
import OfficerWorkload from '@/pages/OfficerWorkload';
import PaymentsPage from '@/pages/PaymentsPage';
import GatewayCheckout from '@/pages/GatewayCheckout';
import IssuedDocuments from '@/pages/IssuedDocuments';
import CompanyProfile from '@/pages/CompanyProfile';
import HelpFaq from '@/pages/HelpFaq';
import Inbox from '@/pages/Inbox';
import ThreadView from '@/pages/ThreadView';
import Notifications from '@/pages/Notifications';
import Reports from '@/pages/Reports';
import Mailbox from '@/pages/Mailbox';
import Administration from '@/pages/Administration';
import RecordDetail from '@/pages/RecordDetail';
import CompanyRegistration from '@/pages/CompanyRegistration';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import VerifyDocument from '@/pages/VerifyDocument';

const listConfigs = {
  '/companies': { title: 'Company Registry', titleAr: 'سجل الشركات', entity: 'Company', searchField: 'company_name_en', roles: ['contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'], columns: [
    { key: 'company_name_en', label: 'Company' }, { key: 'company_name_ar', label: 'Arabic Name' }, { key: 'commercial_registration_number', label: 'CR Number' },
    { key: 'cofs_file_number', label: 'COFS File No.' }, { key: 'business_sector', label: 'Sector' }, { key: 'status', label: 'Status' } ] },
  '/financial-statements': { title: 'Financial Statements', titleAr: 'البيانات المالية', entity: 'FinancialStatement', searchField: 'document_name', roles: ['contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'], columns: [
    { key: 'document_name', label: 'Document' }, { key: 'financial_year', label: 'Year' },
    { key: 'statement_end_date', label: 'End Date' }, { key: 'review_status', label: 'Status' } ] },
  '/inquiries': { title: 'Inquiries', titleAr: 'الاستفسارات', entity: 'Inquiry', searchField: 'subject', roles: ['contributions_officer', 'contributions_manager', 'system_admin'], columns: [
    { key: 'inquiry_reference', label: 'Reference' }, { key: 'subject', label: 'Subject' }, { key: 'company_name', label: 'Company' },
    { key: 'inquiry_category', label: 'Category' }, { key: 'status', label: 'Status' } ] },
  '/audit-logs': { title: 'Audit Logs', titleAr: 'سجل التدقيق', entity: 'AuditLog', searchField: 'action', readOnly: true, roles: ['contributions_manager', 'system_admin'], columns: [
    { key: 'timestamp', label: 'Time' }, { key: 'entity_type', label: 'Entity' }, { key: 'action', label: 'Action' },
    { key: 'related_reference', label: 'Reference' }, { key: 'user_email', label: 'User' } ] },
};

const ListRoute = ({ path }) => <EntityListPage {...listConfigs[path]} />;

const AuthenticatedApp = () => {
  const { isLoadingAuth, authChecked } = useAuth();

  if (isLoadingAuth && !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<CompanyRegistration />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dev/mailbox" element={<Mailbox devMode />} />
      <Route path="/verify/:code" element={<VerifyDocument />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/pay/checkout/:id" element={<GatewayCheckout />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/applications" element={<ApplicationsList />} />
          <Route path="/applications/new" element={<ApplicationWizard />} />
          <Route path="/applications/:id" element={<ApplicationDetail />} />
          <Route path="/applications/:id/edit" element={<ApplicationWizard />} />
          <Route path="/applications/:id/confirmation" element={<ApplicationConfirmation />} />
          <Route path="/records/ContributionApplication/:id" element={<ApplicationDetail />} />
          <Route path="/calculation-review" element={<CalculationReview />} />
          <Route path="/calculation-review/:id" element={<CalculationReview />} />
          <Route path="/approvals" element={<ApprovalManagement />} />
          <Route path="/officer-workload" element={<OfficerWorkload />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/receipt-vouchers" element={<IssuedDocuments kind="voucher" />} />
          <Route path="/clearance-letters" element={<IssuedDocuments kind="clearance" />} />
          <Route path="/company-profile" element={<CompanyProfile />} />
          <Route path="/companies/:id" element={<CompanyProfile />} />
          <Route path="/records/Company/:id" element={<CompanyProfile />} />
          <Route path="/help" element={<HelpFaq />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:id" element={<ThreadView />} />
          <Route path="/records/CommunicationThread/:id" element={<ThreadView />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/mailbox" element={<Mailbox />} />
          <Route path="/administration" element={<Administration />} />
          <Route path="/records/:entity/:id" element={<RecordDetail />} />
          {Object.keys(listConfigs).map((path) => (
            <Route key={path} path={path} element={<ListRoute path={path} />} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </LanguageProvider>
    </AuthProvider>
  )
}

export default App
