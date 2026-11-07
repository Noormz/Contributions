import { base44 } from '@/api/base44Client';

export const INTERNAL_FINANCE = ['accounts_unit', 'contributions_officer', 'contributions_manager', 'system_admin'];
export const isInternalUser = (u) => !!u?.role && u.role !== 'company_representative';

export async function loadCompanies() {
  const res = await base44.entities.Company.filter({}, { sort: 'company_name_en', limit: 1000 }).catch(() => ({ items: [] }));
  return res.items || [];
}

export async function loadCompanyApps(companyId) {
  if (!companyId) return [];
  const res = await base44.entities.ContributionApplication.filter({ company_id: companyId, status: { $ne: 'draft' } }, { sort: '-financial_year', limit: 200 }).catch(() => ({ items: [] }));
  return res.items || [];
}

export async function loadSettingsMap(keys) {
  const res = await base44.entities.SystemSettings.filter({ setting_key: { $in: keys } }, { limit: 100 }).catch(() => ({ items: [] }));
  return Object.fromEntries((res.items || []).map((s) => [s.setting_key, s.setting_value]));
}

export const KFAS_KEYS = ['kfas_bank_name', 'kfas_account_name', 'kfas_account_number', 'kfas_iban'];
// The account is only shown once the bank and IBAN have been entered by an administrator.
export const bankDetailsConfigured = (s) => !!(s?.kfas_bank_name?.trim() && s?.kfas_iban?.trim());
