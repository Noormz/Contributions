// Company-side helper functions (profile users, help-page status).
import { getDoc } from '../db.js';
import { isInternal } from '../rls.js';
import { functions as core, HttpError } from '../functions.js';

const need = (cond, message, status = 400) => { if (!cond) throw new HttpError(status, message); };

export const functions = {
  // Authorized users of a company (reps cannot read the User entity directly).
  async companyUsers(user, { company_id }) {
    need(company_id, 'Company is required.');
    need(isInternal(user) || user.company_id === company_id, 'You do not have permission to view these users.', 403);
    const company = getDoc('Company', company_id);
    need(company, 'The requested record could not be found.', 404);
    const ids = Array.from(new Set([company.primary_user_id, ...(company.authorized_users || [])].filter(Boolean)));
    return ids.map((id) => getDoc('User', id)).filter(Boolean).map((u) => ({
      id: u.id, full_name: u.full_name, email: u.email, job_title: u.job_title || '', is_active: u.is_active !== false,
      primary: u.id === company.primary_user_id,
    }));
  },

  // Help page status. Balances are internal-only (FRD FR-11), so amounts are
  // removed for company representatives.
  async companyHelpStatus(user, { company_id }) {
    const s = await core.companyStatus(user, { company_id });
    if (isInternal(user)) return s;
    const pending = s.pending_applications.length;
    const reasons = [];
    if (!s.last_statement) reasons.push({ en: 'No financial statements on file.', ar: 'لا توجد بيانات مالية مسجلة.' });
    if (pending) reasons.push({ en: `${pending} application(s) still in progress.`, ar: `${pending} طلب/طلبات قيد المعالجة.` });
    if (s.outstanding_balance > 0.0005) reasons.push({ en: 'There are outstanding contributions on your account.', ar: 'توجد مساهمات مستحقة على حسابكم.' });
    return {
      last_statement: s.last_statement,
      pending_applications: s.pending_applications,
      has_outstanding: s.outstanding_balance > 0.0005,
      latest_clearance: s.latest_clearance,
      clearance_eligible: s.clearance_eligible,
      clearance_reasons: s.clearance_eligible ? [] : reasons,
    };
  },
};
