// Server-side business functions, invoked via POST /api/functions/:name.
// Each takes (user, params) and enforces its own role/ownership rules.
import { allDocs, getDoc, insertDoc, updateDoc, deleteDoc, nextSequence, now, db } from './db.js';
import { isInternal, isAdmin } from './rls.js';
import { sendMail, FROM as MAIL_FROM, REPLY_TO } from './mail.js';
import {
  notify, usersByRole, companyUsers, audit, logTransition, appLink, pickOfficer, officerLoad,
  setting, find, findOne, OPEN_STATUSES,
} from './services.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const need = (cond, message, status = 400) => { if (!cond) fail(status, message); };
const requireRole = (user, ...roles) => need(user && roles.includes(user.role), 'You do not have permission to perform this action.', 403);
const ownsCompany = (user, companyId) => user?.company_id && user.company_id === companyId;
const money = (n) => Math.round(Number(n || 0) * 1000) / 1000;

// An uploaded file URL must exist and, when it carries a company, belong to that company.
function checkFile(url, companyId) {
  const m = String(url || '').match(/^\/api\/files\/([a-f0-9]+)$/);
  need(m, 'Attach a valid uploaded document.');
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(m[1]);
  need(f, 'The attached document could not be found. Please upload it again.');
  need(!f.company_id || !companyId || f.company_id === companyId, 'The attached document belongs to another company.');
}

function loadApp(id) {
  const app = getDoc('ContributionApplication', id);
  need(app, 'The requested application could not be found.', 404);
  return app;
}

function setStatus(user, app, newStatus, action, comments = '', calcId = '', extra = {}) {
  const updated = updateDoc('ContributionApplication', app.id, { status: newStatus, ...extra });
  logTransition(user, app, app.status, newStatus, action, comments, calcId);
  return updated;
}

const companyNotify = (companyId, payload) => notify(companyUsers(companyId), payload);

// ---------------- Applications ----------------

async function assignTo(user, app, officer, reason, notes, auto = false) {
  insertDoc('OfficerAssignment', {
    application_id: app.id, application_reference: app.application_reference,
    previous_officer_id: app.assigned_officer_id || '', previous_officer_name: app.assigned_officer_name || '',
    new_officer_id: officer.id, new_officer_name: officer.full_name || officer.email,
    assigned_by: auto ? 'System (auto-assignment)' : (user?.full_name || user?.email),
    assignment_date: now(), assignment_reason: reason || (auto ? 'Automatic workload balancing' : ''), notes: notes || '',
  }, user);
  const reassign = !!app.assigned_officer_id && app.assigned_officer_id !== officer.id;
  const next = ['submitted', 'assigned'].includes(app.status) ? 'assigned' : app.status;
  const updated = updateDoc('ContributionApplication', app.id, {
    assigned_officer_id: officer.id, assigned_officer_name: officer.full_name || officer.email,
    assigned_date: now(), status: next,
  });
  logTransition(user, app, app.status, next, reassign ? 'reassign' : 'assign', reason || '');
  await notify(officer, {
    category: 'assignment',
    title: `${reassign ? 'Reassigned' : 'New assignment'}: ${app.application_reference} (${app.company_name})`,
    title_ar: `${reassign ? 'إعادة إسناد' : 'إسناد جديد'}: ${app.application_reference}`,
    body: reason || '', link: appLink(app.id), template: 'officer_assignment',
    vars: { reference: app.application_reference, company: app.company_name },
  });
  if (reassign && app.assigned_officer_id) {
    const prev = getDoc('User', app.assigned_officer_id);
    if (prev) await notify(prev, { category: 'assignment', title: `${app.application_reference} was reassigned to ${officer.full_name}`, link: appLink(app.id), email: false });
  }
  return updated;
}

export const functions = {
  async nextReference(user, { prefix }) {
    need(/^[A-Z]{2,5}$/.test(prefix || ''), 'Invalid prefix');
    return { reference: nextSequence(prefix) };
  },

  async submitApplication(user, { application_id }) {
    const app = loadApp(application_id);
    need(ownsCompany(user, app.company_id) || isAdmin(user), 'You do not have permission to submit this application.', 403);
    need(['draft', 'returned'].includes(app.status), 'Only draft or returned applications can be submitted.');
    const statements = find('FinancialStatement', { application_id: app.id });
    need(statements.length > 0, 'At least one financial statement is required.');
    need(statements.every((s) => s.financial_year && s.statement_end_date), 'Each financial statement needs a financial year and statement end date.');
    need(app.profile_confirmed, 'You must confirm the company profile is up to date.');
    const methods = app.payment_methods?.length ? app.payment_methods : (app.payment_method ? [app.payment_method] : []);
    need(methods.length > 0, 'Select at least one payment method.');
    const evidence = find('ApplicationDocument', { application_id: app.id, category: 'payment_evidence' });
    for (const m of methods.filter((x) => x !== 'payment_gateway')) {
      need(evidence.some((d) => d.payment_method === m), `Payment evidence is required for ${m.replace(/_/g, ' ')}.`);
    }
    const acks = app.acknowledgements || {};
    need(acks.accuracy && acks.terms, 'All acknowledgements must be accepted.');

    const resubmission = app.status === 'returned';
    const reference = app.application_reference && !app.application_reference.startsWith('DRAFT') ? app.application_reference : nextSequence('APP');
    let updated = setStatus(user, app, 'submitted', resubmission ? 'resubmit' : 'submit', '', '', {
      application_reference: reference, submitted_date: now(), current_step: 99,
    });
    updateDoc('Company', app.company_id, { profile_locked: true });

    // Assignment: keep the officer on resubmission, otherwise auto-assign.
    if (updated.assigned_officer_id) {
      const officer = getDoc('User', updated.assigned_officer_id);
      updated = setStatus(user, updated, 'assigned', 'resubmitted_to_officer');
      if (officer) await notify(officer, { category: 'application', title: `Application ${reference} was resubmitted by the company`, link: appLink(app.id), template: 'application_resubmitted', vars: { reference } });
    } else if (setting('auto_assignment_enabled', 'true') !== 'false') {
      const officer = pickOfficer();
      if (officer) updated = await assignTo(null, updated, officer, '', '', true);
    }

    await notify(usersByRole('contributions_officer', 'contributions_manager'), {
      category: 'application',
      title: `${resubmission ? 'Updated' : 'New'} application ${reference} from ${app.company_name}`,
      title_ar: `طلب ${resubmission ? 'محدث' : 'جديد'} ${reference}`,
      link: appLink(app.id), email: false,
    });
    await companyNotify(app.company_id, {
      category: 'application', title: `Application ${reference} submitted successfully`,
      title_ar: `تم تقديم الطلب ${reference} بنجاح`, link: `/applications/${app.id}/confirmation`,
      template: 'application_submitted', vars: { reference, company: app.company_name },
    });
    return updated;
  },

  async assignApplication(user, { application_id, officer_id, reason, notes }) {
    requireRole(user, 'contributions_manager', 'system_admin');
    const app = loadApp(application_id);
    const officer = getDoc('User', officer_id);
    need(officer && officer.role === 'contributions_officer', 'Select a valid contributions officer.');
    need(!['draft', 'completed'].includes(app.status), 'This application cannot be assigned in its current status.');
    return assignTo(user, app, officer, reason, notes);
  },

  async bulkAssign(user, { application_ids = [], officer_id, reason }) {
    requireRole(user, 'contributions_manager', 'system_admin');
    const results = [];
    for (const id of application_ids) results.push(await functions.assignApplication(user, { application_id: id, officer_id, reason }));
    return { count: results.length };
  },

  async autoAssign(user, { application_id }) {
    requireRole(user, 'contributions_manager', 'system_admin');
    const app = loadApp(application_id);
    const officer = pickOfficer();
    need(officer, 'No active contributions officers are available.');
    return assignTo(user, app, officer, 'Automatic workload balancing', '', true);
  },

  async officerWorkload(user) {
    need(isInternal(user), 'Not allowed', 403);
    const apps = allDocs('ContributionApplication');
    return officerLoad().map(({ officer }) => {
      const mine = apps.filter((a) => a.assigned_officer_id === officer.id);
      const byStatus = {};
      mine.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
      const open = mine.filter((a) => OPEN_STATUSES.includes(a.status));
      const oldest = open.reduce((m, a) => (!m || (a.assigned_date || a.submitted_date || a.created_date) < m ? (a.assigned_date || a.submitted_date || a.created_date) : m), null);
      return {
        officer_id: officer.id, officer_name: officer.full_name || officer.email, email: officer.email,
        total: mine.length, open: open.length, by_status: byStatus,
        oldest_pending_days: oldest ? Math.floor((Date.now() - new Date(oldest)) / 86400000) : 0,
      };
    });
  },

  // Officer / manager / accounts workflow actions.
  async applicationAction(user, { application_id, action, comments = '' }) {
    const app = loadApp(application_id);
    const officerish = ['contributions_officer', 'contributions_manager', 'system_admin'].includes(user.role);
    switch (action) {
      case 'start_review': {
        need(officerish, 'Not allowed', 403);
        need(['submitted', 'assigned', 'returned_by_manager'].includes(app.status), 'Review cannot be started in the current status.');
        let a = app;
        if (!a.assigned_officer_id && user.role === 'contributions_officer') a = await assignTo(user, a, user, 'Self-assigned on review start', '');
        return setStatus(user, a, 'under_review', 'start_review', comments);
      }
      case 'return_to_company': {
        need(officerish, 'Not allowed', 403);
        need(comments.trim(), 'Comments are required when returning an application.');
        need(['submitted', 'assigned', 'under_review', 'calculation_review'].includes(app.status), 'This application cannot be returned now.');
        const u = setStatus(user, app, 'returned', 'return_application', comments);
        updateDoc('Company', app.company_id, { profile_locked: false });
        await companyNotify(app.company_id, {
          category: 'review', title: `Application ${app.application_reference} was returned for changes`,
          title_ar: `تمت إعادة الطلب ${app.application_reference} للتعديل`, body: comments, link: appLink(app.id),
          template: 'application_returned', vars: { reference: app.application_reference, comments },
        });
        return u;
      }
      case 'approve':
      case 'return_to_officer': {
        requireRole(user, 'contributions_manager', 'system_admin');
        need(app.status === 'pending_manager_approval', 'Application is not waiting for approval.');
        const calc = findOne('ContributionCalculation', { application_id: app.id, status: 'pending_approval' });
        need(calc, 'No calculation is pending approval for this application.');
        if (action === 'approve') {
          updateDoc('ContributionCalculation', calc.id, { status: 'approved', approved_by: user.full_name || user.email, approved_by_id: user.id, approval_date: now() });
          let u = setStatus(user, app, 'approved', 'approve', comments, calc.id, { contribution_due: money(calc.calculated_contribution) });
          u = setStatus(user, u, 'accounts_processing', 'forward_to_accounts', '', calc.id);
          await companyNotify(app.company_id, {
            category: 'approval', title: `Contribution for ${app.application_reference} approved: ${money(calc.calculated_contribution).toLocaleString()} KWD`,
            title_ar: `تم اعتماد المساهمة للطلب ${app.application_reference}`, body: comments, link: appLink(app.id),
            template: 'application_approved', vars: { reference: app.application_reference, amount: money(calc.calculated_contribution).toLocaleString() },
          });
          await notify(usersByRole('accounts_unit'), {
            category: 'accounts', title: `Approved: ${app.application_reference} (${app.company_name}) ready for receipt voucher processing`,
            title_ar: `طلب معتمد جاهز لمعالجة سند القبض: ${app.application_reference}`, link: appLink(app.id),
            template: 'accounts_ready', vars: { reference: app.application_reference, company: app.company_name },
          });
          if (app.assigned_officer_id) await notify(getDoc('User', app.assigned_officer_id), { category: 'approval', title: `Calculation for ${app.application_reference} approved`, link: appLink(app.id), email: false });
          return u;
        }
        need(comments.trim(), 'Comments are required when returning a calculation.');
        updateDoc('ContributionCalculation', calc.id, { status: 'returned', manager_comments: comments });
        const u = setStatus(user, app, 'under_review', 'return_for_correction', comments, calc.id);
        if (app.assigned_officer_id) {
          await notify(getDoc('User', app.assigned_officer_id), {
            category: 'approval', title: `Calculation for ${app.application_reference} returned for correction`,
            body: comments, link: appLink(app.id), template: 'calculation_returned', vars: { reference: app.application_reference, comments },
          });
        }
        return u;
      }
      case 'escalate': {
        need(officerish, 'Not allowed', 403);
        await notify(usersByRole('contributions_manager'), { category: 'escalation', title: `Escalation: ${app.application_reference}`, body: comments, link: appLink(app.id), template: 'escalation', vars: { reference: app.application_reference, comments } });
        logTransition(user, app, app.status, app.status, 'escalate', comments);
        return app;
      }
      case 'complete': {
        requireRole(user, 'accounts_unit', 'contributions_manager', 'system_admin');
        need(app.status === 'accounts_processing', 'Only applications in accounts processing can be completed.');
        const vouchers = find('ReceiptVoucher', { application_id: app.id });
        need(vouchers.some((v) => v.status === 'issued'), 'Issue a receipt voucher before completing the application.');
        const bal = applicationBalance(app);
        need(bal.remaining <= 0.0005, `The application still has an outstanding balance of ${bal.remaining.toLocaleString()} KWD.`);
        const u = setStatus(user, app, 'completed', 'complete', comments, '', { completed_date: now() });
        const stillOpen = find('ContributionApplication', { company_id: app.company_id, status: { $in: OPEN_STATUSES } });
        if (!stillOpen.length) updateDoc('Company', app.company_id, { profile_locked: false });
        await companyNotify(app.company_id, { category: 'application', title: `Application ${app.application_reference} is completed`, title_ar: `اكتمل الطلب ${app.application_reference}`, link: appLink(app.id), template: 'application_completed', vars: { reference: app.application_reference } });
        return u;
      }
      default:
        fail(400, `Unknown action ${action}`);
    }
    return null;
  },

  // ---------------- Calculations ----------------
  async saveCalculation(user, { application_id, inputs = {}, submit = false, reason = '' }) {
    requireRole(user, 'contributions_officer', 'contributions_manager', 'system_admin');
    const app = loadApp(application_id);
    const net = Number(inputs.net_profit);
    const rate = Number(inputs.contribution_rate);
    need(Number.isFinite(net) && Number.isFinite(rate) && inputs.net_profit !== '' && inputs.contribution_rate !== '', 'Net profit and contribution rate are required.');
    need(rate >= 0 && rate <= 100, 'Contribution rate must be between 0 and 100.');
    const subsidiaryShare = Number(inputs.subsidiary_share || 0);
    const calculated = money(((net + subsidiaryShare) * rate) / 100 + Number(inputs.adjustments || 0));
    const existing = findOne('ContributionCalculation', { application_id: app.id });
    if (existing && existing.status === 'approved' && !existing.reopened) fail(400, 'This calculation is approved. Reopen it before making changes.');
    need(!submit || ['under_review', 'calculation_review', 'returned_by_manager'].includes(app.status) || (existing?.reopened && ['accounts_processing', 'approved', 'completed'].includes(app.status)), 'Start the review before submitting the calculation.');
    const payload = {
      calculation_reference: existing?.calculation_reference || nextSequence('CALC'),
      company_id: app.company_id, application_id: app.id, financial_year: app.financial_year,
      financial_inputs: JSON.stringify({ net_profit: net, contribution_rate: rate, subsidiary_share: subsidiaryShare }),
      adjustments: Number(inputs.adjustments || 0), calculation_basis: inputs.calculation_basis || '',
      calculated_contribution: calculated, previous_contribution: Number(inputs.previous_contribution || 0),
      outstanding_balance: Number(inputs.outstanding_balance || 0), officer_comments: inputs.officer_comments || '',
      is_partial: !!app.partial_calculation, reviewed_by: user.full_name || user.email, reviewed_by_id: user.id,
      status: submit ? 'pending_approval' : (existing?.status === 'returned' ? 'returned' : 'in_review'),
      version: (existing?.version || 0) + 1, reopened: submit ? false : !!existing?.reopened,
    };
    const calc = existing ? updateDoc('ContributionCalculation', existing.id, payload) : insertDoc('ContributionCalculation', payload, user);
    insertDoc('CalculationVersion', { calculation_id: calc.id, application_id: app.id, version: payload.version, snapshot: JSON.stringify(payload), changed_by: user.full_name || user.email, reason }, user);
    audit(user, 'ContributionCalculation', calc.id, existing ? 'update' : 'create', existing ? existing.calculated_contribution : '', calculated, app.application_reference);
    if (submit) {
      setStatus(user, app, 'pending_manager_approval', 'submit_calculation', inputs.officer_comments || '', calc.id);
      await notify(usersByRole('contributions_manager'), {
        category: 'approval', title: `Calculation ${calc.calculation_reference} awaiting approval (${calculated.toLocaleString()} KWD)`,
        title_ar: `حساب بانتظار الاعتماد ${calc.calculation_reference}`, link: appLink(app.id),
        template: 'approval_request', vars: { reference: app.application_reference, amount: calculated.toLocaleString() },
      });
    }
    return calc;
  },

  async reopenCalculation(user, { calculation_id, reason }) {
    requireRole(user, 'contributions_officer', 'contributions_manager', 'system_admin');
    need((reason || '').trim(), 'A reason is required to reopen a calculation.');
    const calc = getDoc('ContributionCalculation', calculation_id);
    need(calc, 'Calculation not found', 404);
    need(calc.status === 'approved', 'Only approved calculations can be reopened.');
    const u = updateDoc('ContributionCalculation', calc.id, { reopened: true, reopen_reason: reason });
    const app = getDoc('ContributionApplication', calc.application_id);
    logTransition(user, app, app.status, app.status, 'reopen_calculation', reason, calc.id);
    return u;
  },

  async submitReopenedCalculation(user, { application_id, inputs, reason }) {
    const app = loadApp(application_id);
    const calc = findOne('ContributionCalculation', { application_id: app.id });
    need(calc?.reopened, 'Calculation is not reopened.');
    const updated = await functions.saveCalculation(user, { application_id, inputs, submit: false, reason });
    updateDoc('ContributionCalculation', updated.id, { status: 'pending_approval', reopened: false });
    const prior = app.status;
    updateDoc('ContributionApplication', app.id, { status: 'pending_manager_approval', reopened_from: prior });
    logTransition(user, app, prior, 'pending_manager_approval', 'submit_revised_calculation', reason, updated.id);
    await notify(usersByRole('contributions_manager'), { category: 'approval', title: `Revised calculation for ${app.application_reference} awaiting approval`, link: appLink(app.id), template: 'approval_request', vars: { reference: app.application_reference, amount: updated.calculated_contribution } });
    return getDoc('ContributionCalculation', updated.id);
  },

  async previousCalculations(user, { company_id, exclude_application_id }) {
    need(isInternal(user), 'Not allowed', 403);
    return find('ContributionCalculation', { company_id })
      .filter((c) => c.application_id !== exclude_application_id)
      .sort((a, b) => String(b.financial_year).localeCompare(String(a.financial_year)));
  },

  // ---------------- Company profile ----------------
  async applyProfileChanges(user, { company_id, changes = {}, application_reference = '', reason = '' }) {
    const company = getDoc('Company', company_id);
    need(company, 'Company not found', 404);
    need(ownsCompany(user, company_id) || ['contributions_manager', 'system_admin', 'contributions_officer'].includes(user.role), 'Not allowed', 403);
    const allowed = ['company_name_en', 'company_name_ar', 'previous_company_name', 'business_license_number', 'year_of_establishment', 'company_type', 'is_wll', 'business_sector', 'capital', 'auditor_name', 'governorate', 'area', 'street', 'building', 'floor', 'office', 'postal_address', 'postal_code', 'telephone', 'official_email', 'ceo_name_en', 'ceo_name_ar', 'ceo_job_title', 'ceo_email', 'ceo_telephone', 'ceo_mobile', 'financial_manager_name', 'financial_manager_position', 'financial_manager_email', 'financial_manager_telephone', 'financial_manager_mobile', 'moci_registration_proof', 'business_license_attachment'];
    if (isInternal(user)) allowed.push('cofs_file_number', 'commercial_registration_number', 'status');
    const patch = {};
    for (const [k, v] of Object.entries(changes)) {
      need(allowed.includes(k), `Field ${k} cannot be changed here.`);
      if (String(company[k] ?? '') !== String(v ?? '')) patch[k] = v;
    }
    if (patch.commercial_registration_number) {
      need(!find('Company', { commercial_registration_number: patch.commercial_registration_number }).some((c) => c.id !== company_id), 'Another company is already registered with this CR number.');
    }
    for (const [k, v] of Object.entries(patch)) {
      insertDoc('CompanyProfileChangeHistory', {
        company_id, field_name: k, previous_value: String(company[k] ?? ''), new_value: String(v ?? ''),
        modified_by: user.full_name || user.email, modification_date: now(), change_reason: reason,
        related_application_reference: application_reference,
      }, user);
    }
    if (Object.keys(patch).length) {
      audit(user, 'Company', company_id, 'profile_change', Object.fromEntries(Object.keys(patch).map((k) => [k, company[k]])), patch, application_reference);
      return updateDoc('Company', company_id, patch);
    }
    return company;
  },

  async addCompanyUser(user, { company_id, email, full_name, password, job_title }) {
    need(ownsCompany(user, company_id) || isAdmin(user), 'Not allowed', 403);
    return addUser(user, { email, full_name, password, role: 'company_representative', company_id, job_title });
  },

  // ---------------- Payments ----------------
  async recordPayment(user, data) {
    const { company_id, application_id, payment_method, payment_amount } = data;
    need(company_id, 'Select a company.');
    need(ownsCompany(user, company_id) || isInternal(user), 'Not allowed', 403);
    need(['cheque', 'bank_transfer', 'bank_deposit'].includes(payment_method), 'Use the online payment option for gateway payments.');
    need(Number(payment_amount) > 0, 'Payment amount must be greater than zero.');
    need(data.payment_evidence_attachment, 'Supporting payment document is required.');
    checkFile(data.payment_evidence_attachment, company_id);
    if (payment_method === 'cheque') need(data.cheque_number, 'Cheque number is required.');
    const company = getDoc('Company', company_id);
    const app = application_id ? getDoc('ContributionApplication', application_id) : null;
    const p = insertDoc('Payment', {
      ...pick(data, ['application_id', 'payment_method', 'payment_date', 'cheque_number', 'bank_name', 'transfer_reference', 'deposit_reference', 'payment_evidence_attachment', 'internal_notes']),
      company_id, company_name: company?.company_name_en, payment_amount: money(payment_amount), currency: 'KWD',
      payment_reference: nextSequence('PAY'), contribution_reference: app?.application_reference || '',
      payment_status: 'pending', payment_date: data.payment_date || now().slice(0, 10),
    }, user);
    audit(user, 'Payment', p.id, 'create', '', { amount: p.payment_amount, method: p.payment_method }, p.payment_reference);
    await notify(usersByRole('accounts_unit', 'contributions_officer'), { category: 'payment', title: `Payment ${p.payment_reference} recorded for ${p.company_name} (${p.payment_amount.toLocaleString()} KWD)`, link: `/records/Payment/${p.id}`, email: false });
    return p;
  },

  async verifyPayment(user, { payment_id, decision, notes = '', allocations }) {
    requireRole(user, 'accounts_unit', 'contributions_officer', 'contributions_manager', 'system_admin');
    const p = getDoc('Payment', payment_id);
    need(p, 'Payment not found', 404);
    need(p.payment_status === 'pending', 'Only pending payments can be verified or rejected.');
    need(['verified', 'rejected'].includes(decision), 'Invalid decision');
    if (decision === 'rejected') need(notes.trim(), 'A rejection reason is required.');
    const u = updateDoc('Payment', p.id, { payment_status: decision, verified_by: user.full_name || user.email, verified_by_id: user.id, verified_date: now(), internal_notes: [p.internal_notes, notes].filter(Boolean).join('\n') });
    audit(user, 'Payment', p.id, `payment_${decision}`, 'pending', decision, p.payment_reference);
    if (decision === 'verified') {
      if (allocations?.length) allocate(user, u, allocations);
      else autoAllocate(user, u);
    }
    await companyNotify(p.company_id, {
      category: 'payment', title: `Payment ${p.payment_reference} ${decision}`, title_ar: `الدفعة ${p.payment_reference} ${decision === 'verified' ? 'مؤكدة' : 'مرفوضة'}`,
      body: decision === 'rejected' ? notes : '', link: `/records/Payment/${p.id}`, template: `payment_${decision}`,
      vars: { reference: p.payment_reference, amount: p.payment_amount.toLocaleString(), reason: notes },
    });
    return u;
  },

  async allocatePayment(user, { payment_id, allocations, reason = '' }) {
    requireRole(user, 'accounts_unit', 'contributions_officer', 'contributions_manager', 'system_admin');
    const p = getDoc('Payment', payment_id);
    need(p && p.payment_status === 'verified', 'Only verified payments can be allocated.');
    need((reason || '').trim(), 'A reason is required to override an allocation.');
    const before = find('PaymentAllocation', { payment_id });
    // A completed application must stay fully paid.
    const sum = (rows, key) => rows.reduce((m, a) => ({ ...m, [a.application_id]: (m[a.application_id] || 0) + Number(a[key] || 0) }), {});
    const oldBy = sum(before, 'allocated_amount');
    const newBy = sum(allocations || [], 'amount');
    for (const appId of new Set([...Object.keys(oldBy), ...Object.keys(newBy)])) {
      const app = getDoc('ContributionApplication', appId);
      if (app?.status !== 'completed') continue;
      const left = money(applicationBalance(app).remaining + (oldBy[appId] || 0) - (newBy[appId] || 0));
      need(left <= 0.0005, `${app.application_reference} is completed; this allocation would leave ${left.toLocaleString()} KWD outstanding on it.`);
    }
    allocate(user, p, allocations);
    audit(user, 'Payment', p.id, 'allocation_override', before.map((a) => ({ application_id: a.application_id, amount: a.allocated_amount })), allocations, reason);
    return find('PaymentAllocation', { payment_id });
  },

  // Amount still payable on one application (company reps may see their own).
  async payableAmount(user, { application_id }) {
    const app = loadApp(application_id);
    need(ownsCompany(user, app.company_id) || isInternal(user), 'Not allowed', 403);
    const b = applicationBalance(app);
    return { application_id: app.id, due: b.due, remaining: Math.max(b.remaining, 0) };
  },

  async companyBalances(user, { company_id }) {
    need(isInternal(user), 'Balances are only available to internal users.', 403);
    return companyBalances(company_id);
  },

  async startGatewayPayment(user, { application_id, company_id, amount }) {
    const cid = company_id || getDoc('ContributionApplication', application_id)?.company_id;
    need(cid, 'Company is required');
    need(ownsCompany(user, cid) || isInternal(user), 'Not allowed', 403);
    need(Number(amount) > 0, 'Amount must be greater than zero.');
    const company = getDoc('Company', cid);
    const app = application_id ? getDoc('ContributionApplication', application_id) : null;
    const payment = insertDoc('Payment', {
      company_id: cid, company_name: company?.company_name_en, application_id: application_id || '',
      contribution_reference: app?.application_reference || '', payment_method: 'payment_gateway',
      payment_amount: money(amount), currency: 'KWD', payment_reference: nextSequence('PAY'),
      payment_status: 'pending', payment_date: now().slice(0, 10),
    }, user);
    const tx = insertDoc('PaymentGatewayTransaction', {
      payment_id: payment.id, company_id: cid, application_id: application_id || '', amount: money(amount), currency: 'KWD',
      gateway_reference: `PG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      status: 'initiated', initiated_date: now(), test_mode: true, provider: setting('payment_gateway_provider', 'Simulated (test mode)'),
    }, user);
    const checkout_url = `/pay/checkout/${tx.id}`;
    updateDoc('PaymentGatewayTransaction', tx.id, { checkout_url });
    return { transaction_id: tx.id, payment_id: payment.id, checkout_url, gateway_reference: tx.gateway_reference };
  },

  async completeGatewayPayment(user, { transaction_id, outcome }) {
    const tx = getDoc('PaymentGatewayTransaction', transaction_id);
    need(tx, 'Transaction not found', 404);
    need(ownsCompany(user, tx.company_id) || isInternal(user), 'Not allowed', 403);
    need(['initiated', 'pending'].includes(tx.status), 'This transaction is already finalised.');
    need(['completed', 'failed', 'cancelled'].includes(outcome), 'Invalid outcome');
    const txRef = `TXN${Date.now()}`;
    const u = updateDoc('PaymentGatewayTransaction', tx.id, {
      status: outcome, completed_date: now(),
      gateway_response: JSON.stringify({ result: outcome === 'completed' ? 'CAPTURED' : outcome.toUpperCase(), auth_code: outcome === 'completed' ? txRef.slice(-6) : null, transaction_reference: txRef }),
    });
    const p = getDoc('Payment', tx.payment_id);
    if (outcome === 'completed') {
      const vp = updateDoc('Payment', p.id, { payment_status: 'verified', transaction_reference: txRef, verified_by: 'Payment Gateway', verified_date: now() });
      autoAllocate(null, vp);
      await companyNotify(tx.company_id, { category: 'payment', title: `Online payment ${p.payment_reference} successful (${p.payment_amount.toLocaleString()} KWD)`, title_ar: `تمت عملية الدفع الإلكتروني بنجاح ${p.payment_reference}`, link: `/records/Payment/${p.id}`, template: 'payment_verified', vars: { reference: p.payment_reference, amount: p.payment_amount.toLocaleString() } });
      await notify(usersByRole('accounts_unit'), { category: 'payment', title: `Gateway payment received: ${p.payment_reference} (${p.company_name})`, link: `/records/Payment/${p.id}`, email: false });
    } else {
      updateDoc('Payment', p.id, { payment_status: 'rejected', transaction_reference: txRef, internal_notes: `Gateway ${outcome}` });
      await companyNotify(tx.company_id, {
        category: 'payment', title: `Online payment ${p.payment_reference} ${outcome === 'failed' ? 'failed' : 'was cancelled'}`,
        title_ar: `عملية الدفع الإلكتروني ${p.payment_reference} ${outcome === 'failed' ? 'فشلت' : 'ألغيت'}`,
        body: outcome === 'failed' ? 'The payment gateway declined the transaction. No amount was taken; please try again.' : 'The payment was cancelled before completion. No amount was taken.',
        link: `/records/Payment/${p.id}`, email: false,
      });
    }
    return u;
  },

  // ---------------- Communications ----------------
  async sendThreadMessage(user, { thread_id, company_id, application_id, to = [], cc = [], subject, body, attachments = [], template_key }) {
    need((body || '').trim(), 'Message body is required.');
    let thread = thread_id ? getDoc('CommunicationThread', thread_id) : null;
    if (thread_id) need(thread, 'Thread not found', 404);
    const companyId = thread?.company_id || company_id;
    const internal = isInternal(user);
    need(internal || ownsCompany(user, companyId), 'You do not have permission to message this company.', 403);
    need(companyId, 'Select a company.');
    const company = getDoc('Company', companyId);
    if (!thread) {
      need(internal, 'Companies can reply to existing threads or raise an inquiry.', 403);
      need((subject || '').trim(), 'Subject is required.');
      const app = application_id ? getDoc('ContributionApplication', application_id) : null;
      thread = insertDoc('CommunicationThread', {
        thread_reference: nextSequence('THR'), subject: subject.trim(), company_id: companyId, company_name: company?.company_name_en,
        application_id: application_id || '', application_reference: app?.application_reference || '',
        assigned_officer_id: user.id, assigned_officer_name: user.full_name || user.email, status: 'open',
        last_activity: now(), participants: [],
      }, user);
    }
    const ref = thread.thread_reference;
    const tag = `[Ref: ${ref}]`;
    const subj = `${(subject || thread.subject).replace(/\s*\[Ref:[^\]]*\]/g, '')} ${tag}`;
    const inbound = !internal;
    let recipients = to.length ? to : [];
    if (!inbound && !recipients.length) recipients = [company?.official_email || company?.financial_manager_email].filter(Boolean);
    need(inbound || recipients.length, 'At least one recipient is required.');
    const msg = insertDoc('CommunicationMessage', {
      thread_id: thread.id, company_id: companyId,
      from_address: user.email, to_addresses: inbound ? (thread.assigned_officer_email || MAIL_FROM) : recipients.join(', '),
      cc_addresses: cc.join(', '), bcc_addresses: inbound ? '' : user.email,
      subject: subj, body, direction: inbound ? 'inbound' : 'outbound',
      message_id: `<${ref}.${Date.now()}@${MAIL_FROM.split('@')[1]}>`, delivery_status: inbound ? 'received' : 'sent',
      sent_date: now(), bcc_copy_sent: !inbound, channel: 'portal', sender_name: user.full_name || user.email, template_key: template_key || '',
    }, user);
    for (const fid of attachments) {
      const f = db.prepare('SELECT * FROM files WHERE id = ?').get(fid);
      if (f) insertDoc('CommunicationAttachment', { message_id: msg.id, thread_id: thread.id, company_id: companyId, filename: f.filename, file_url: `/api/files/${f.id}`, file_size: f.size, uploaded_date: now() }, user);
    }
    const participants = Array.from(new Set([...(thread.participants || []), user.email, ...recipients]));
    updateDoc('CommunicationThread', thread.id, { last_activity: now(), status: inbound ? 'replied' : 'awaiting_company', participants });
    if (!inbound) {
      await sendMail({
        to: recipients, cc, bcc: user.email, subject: subj,
        text: `${body}\n\n--\n${user.full_name || ''}\nContributions Unit\nPlease keep ${tag} in the subject when replying.`,
        headers: { 'X-Portal-Ref': ref, 'Reply-To': REPLY_TO },
        category: 'thread', related: { thread_id: thread.id, thread_reference: ref, sender_id: user.id },
      });
      await companyNotify(companyId, { category: 'message', title: `New message: ${thread.subject}`, title_ar: `رسالة جديدة: ${thread.subject}`, link: `/inbox/${thread.id}`, email: false });
    } else {
      const officer = thread.assigned_officer_id ? getDoc('User', thread.assigned_officer_id) : null;
      await notify(officer || usersByRole('contributions_officer'), { category: 'message', title: `Company reply on ${ref}: ${thread.subject}`, title_ar: `رد الشركة على ${ref}`, link: `/inbox/${thread.id}`, template: 'company_reply', vars: { reference: ref, company: thread.company_name } });
    }
    return { thread: getDoc('CommunicationThread', thread.id), message: msg };
  },

  // Simulates a reply arriving by email (same path as the inbound webhook).
  async simulateInboundEmail(user, { from, subject, body }) {
    need(isInternal(user), 'Not allowed', 403);
    return processInboundEmail({ from, subject, body });
  },

  async linkUnmatchedMessage(user, { message_id, thread_id }) {
    requireRole(user, 'contributions_officer', 'contributions_manager', 'system_admin');
    const msg = getDoc('CommunicationMessage', message_id);
    const thread = getDoc('CommunicationThread', thread_id);
    need(msg && thread, 'Message or thread not found', 404);
    const oldThread = getDoc('CommunicationThread', msg.thread_id);
    updateDoc('CommunicationMessage', msg.id, { thread_id: thread.id, company_id: thread.company_id });
    updateDoc('CommunicationThread', thread.id, { status: 'replied', last_activity: now() });
    if (oldThread && oldThread.status === 'unmatched' && !find('CommunicationMessage', { thread_id: oldThread.id }).length) deleteDoc('CommunicationThread', oldThread.id);
    audit(user, 'CommunicationMessage', msg.id, 'link_to_thread', oldThread?.thread_reference, thread.thread_reference);
    return getDoc('CommunicationThread', thread.id);
  },

  // ---------------- Help / FAQ ----------------
  async companyStatus(user, { company_id }) {
    const cid = company_id || user.company_id;
    need(cid && (ownsCompany(user, cid) || isInternal(user)), 'Not allowed', 403);
    const draftIds = new Set(find('ContributionApplication', { company_id: cid, status: 'draft' }).map((a) => a.id));
    const statements = find('FinancialStatement', { company_id: cid }).filter((s) => !draftIds.has(s.application_id)).sort((a, b) => String(b.statement_end_date || '').localeCompare(String(a.statement_end_date || '')));
    const apps = find('ContributionApplication', { company_id: cid });
    const bal = companyBalances(cid);
    const pendingApps = apps.filter((a) => !['completed', 'draft'].includes(a.status));
    const clearances = find('ClearanceLetter', { company_id: cid }).sort((a, b) => String(b.clearance_date).localeCompare(String(a.clearance_date)));
    const latestFS = statements[0];
    const eligible = bal.total_remaining <= 0.0005 && pendingApps.length === 0 && !!latestFS;
    return {
      last_statement: latestFS ? { financial_year: latestFS.financial_year, statement_end_date: latestFS.statement_end_date, upload_date: latestFS.upload_date || latestFS.created_date } : null,
      pending_applications: pendingApps.map((a) => ({ id: a.id, reference: a.application_reference, status: a.status, financial_year: a.financial_year })),
      outstanding_balance: bal.total_remaining,
      latest_clearance: clearances[0] ? { reference: clearances[0].clearance_reference, status: clearances[0].clearance_status, date: clearances[0].clearance_date } : null,
      clearance_eligible: eligible,
      clearance_reason: eligible ? 'No outstanding contributions or open applications.' : [
        !latestFS && 'No financial statements on file.',
        pendingApps.length && `${pendingApps.length} application(s) still in progress.`,
        bal.total_remaining > 0.0005 && `Outstanding balance of ${bal.total_remaining.toLocaleString()} KWD.`,
      ].filter(Boolean).join(' '),
    };
  },

  async respondInquiry(user, { inquiry_id, response, close = false }) {
    requireRole(user, 'contributions_officer', 'contributions_manager', 'system_admin');
    need((response || '').trim(), 'Response is required.');
    const inq = getDoc('Inquiry', inquiry_id);
    need(inq, 'Inquiry not found', 404);
    const u = updateDoc('Inquiry', inq.id, { response, response_date: now(), status: close ? 'closed' : 'responded', assigned_officer_id: user.id, assigned_officer_name: user.full_name || user.email });
    audit(user, 'Inquiry', inq.id, 'respond', inq.status, u.status, inq.inquiry_reference);
    const recipients = [inq.created_by_id && getDoc('User', inq.created_by_id), ...(inq.company_id ? companyUsers(inq.company_id) : [])];
    await notify(recipients, { category: 'inquiry', title: `Response to your inquiry ${inq.inquiry_reference}`, title_ar: `رد على استفسارك ${inq.inquiry_reference}`, body: response, link: `/records/Inquiry/${inq.id}`, template: 'inquiry_response', vars: { reference: inq.inquiry_reference, response } });
    return u;
  },

  // Issues a receipt voucher or clearance letter. The official document is the signed PDF the portal
  // generates for it (electronic signature + KFAS seal + QR verification); nothing is uploaded.
  async issueDocument(user, { kind, company_id, application_id, related_payment_id, date, validity_period, document_type }) {
    const isVoucher = kind === 'voucher';
    requireRole(user, 'accounts_unit', 'system_admin', ...(isVoucher ? [] : ['contributions_manager']));
    need(company_id, 'Select a company.');
    const company = getDoc('Company', company_id);
    const app = application_id ? getDoc('ContributionApplication', application_id) : null;
    const base = { company_id, company_name: company?.company_name_en, application_id: application_id || '', application_reference: app?.application_reference || '', uploaded_by: user.full_name || user.email, uploaded_by_id: user.id, upload_date: now(), document_type: document_type || (isVoucher ? 'Receipt Voucher' : 'Clearance Letter') };
    let rec;
    if (isVoucher) {
      const ref = nextSequence('RV');
      rec = insertDoc('ReceiptVoucher', { ...base, voucher_number: ref, voucher_reference: ref, related_payment_id: related_payment_id || '', voucher_date: date || now().slice(0, 10), status: 'issued' }, user);
      if (related_payment_id) find('PaymentAllocation', { payment_id: related_payment_id }).forEach((a) => updateDoc('PaymentAllocation', a.id, { receipt_voucher_id: rec.id }));
    } else {
      rec = insertDoc('ClearanceLetter', { ...base, clearance_reference: nextSequence('CL'), clearance_date: date || now().slice(0, 10), validity_period: validity_period || setting('clearance_validity_months', '12') + ' months', clearance_status: 'issued' }, user);
    }
    audit(user, isVoucher ? 'ReceiptVoucher' : 'ClearanceLetter', rec.id, 'issue', '', rec.voucher_number || rec.clearance_reference, rec.voucher_number || rec.clearance_reference);
    await companyNotify(company_id, {
      category: isVoucher ? 'receipt' : 'clearance',
      title: isVoucher ? `Receipt voucher ${rec.voucher_number} issued` : `Clearance letter ${rec.clearance_reference} issued`,
      title_ar: isVoucher ? `تم إصدار سند القبض ${rec.voucher_number}` : `تم إصدار شهادة المخالصة ${rec.clearance_reference}`,
      link: `/records/${isVoucher ? 'ReceiptVoucher' : 'ClearanceLetter'}/${rec.id}`,
      template: isVoucher ? 'receipt_issued' : 'clearance_issued', vars: { reference: rec.voucher_number || rec.clearance_reference },
    });
    return rec;
  },

  async runReminders(user) {
    requireRole(user, 'system_admin', 'contributions_manager');
    return runReminders();
  },

  // ---------------- Users ----------------
  async listUsers(user) {
    need(isAdmin(user) || user.role === 'contributions_manager', 'Not allowed', 403);
    return allDocs('User').map((u) => ({ ...u, verified: !!db.prepare('SELECT verified FROM credentials WHERE user_id = ?').get(u.id)?.verified }));
  },
  async listOfficers(user) {
    need(isInternal(user), 'Not allowed', 403);
    return usersByRole('contributions_officer').map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));
  },
  async updateUser(user, { user_id, role, company_id, is_active, full_name, job_title }) {
    need(isAdmin(user), 'Only system administrators can manage users.', 403);
    const target = getDoc('User', user_id);
    need(target, 'User not found', 404);
    const patch = {};
    if (role !== undefined) { need(['company_representative', 'contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'].includes(role), 'Invalid role'); patch.role = role; }
    if (company_id !== undefined) patch.company_id = company_id;
    if (is_active !== undefined) { need(!(target.id === user.id && !is_active), 'You cannot deactivate your own account.'); patch.is_active = !!is_active; }
    if (full_name !== undefined) patch.full_name = full_name;
    if (job_title !== undefined) patch.job_title = job_title;
    if (patch.company_id) {
      const c = getDoc('Company', patch.company_id);
      need(c, 'Company not found');
      updateDoc('Company', c.id, { authorized_users: Array.from(new Set([...(c.authorized_users || []), target.id])) });
    }
    audit(user, 'User', target.id, 'update', pick(target, Object.keys(patch)), patch);
    return updateDoc('User', target.id, patch);
  },
  async createUser(user, data) {
    need(isAdmin(user), 'Only system administrators can create users.', 403);
    return addUser(user, data);
  },
};

function addUser(actor, { email, full_name, password, role, company_id, job_title, username }) {
  need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || ''), 'A valid email is required.');
  need(!db.prepare('SELECT 1 FROM credentials WHERE lower(email) = lower(?)').get(email), 'A user with this email already exists.');
  need(password && password.length >= 8, 'Initial password must be at least 8 characters.');
  // Imported lazily to avoid a cycle with auth.js
  return import('./auth.js').then(({ createUser }) => {
    const u = createUser({ email, password, full_name, role, verified: true, company_id: company_id || '', job_title: job_title || '', username: username || '' });
    if (company_id) {
      const c = getDoc('Company', company_id);
      if (c) updateDoc('Company', c.id, { authorized_users: Array.from(new Set([...(c.authorized_users || []), u.id])) });
    }
    audit(actor, 'User', u.id, 'create', '', { email, role, company_id });
    return u;
  });
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));

// ---------------- Balances & allocation ----------------
// Loads the data needed for balances in one pass (optionally for one company).
function ledger(companyId) {
  const byCompany = (d) => !companyId || d.company_id === companyId;
  const calcs = {};
  allDocs('ContributionCalculation').filter((c) => c.status === 'approved' && byCompany(c)).forEach((c) => { calcs[c.application_id] = calcs[c.application_id] || c; });
  const allocByApp = {};
  const allocByCompany = {};
  allDocs('PaymentAllocation').filter(byCompany).forEach((a) => {
    allocByApp[a.application_id] = (allocByApp[a.application_id] || 0) + Number(a.allocated_amount || 0);
    allocByCompany[a.company_id] = (allocByCompany[a.company_id] || 0) + Number(a.allocated_amount || 0);
  });
  const paidByCompany = {};
  allDocs('Payment').filter((p) => p.payment_status === 'verified' && byCompany(p)).forEach((p) => { paidByCompany[p.company_id] = (paidByCompany[p.company_id] || 0) + Number(p.payment_amount || 0); });
  const apps = allDocs('ContributionApplication').filter(byCompany);
  return { calcs, allocByApp, allocByCompany, paidByCompany, apps };
}

function balanceRow(app, L) {
  const due = money(app.contribution_due ?? L.calcs[app.id]?.calculated_contribution ?? 0);
  const paid = money(L.allocByApp[app.id] || 0);
  return { application_id: app.id, reference: app.application_reference, financial_year: app.financial_year, status: app.status, due, paid, remaining: money(due - paid) };
}

export function applicationBalance(app) {
  return balanceRow(app, ledger(app.company_id));
}

function balancesFor(companyId, L) {
  const rows = L.apps
    .filter((a) => a.company_id === companyId && (['approved', 'accounts_processing', 'completed'].includes(a.status) || a.contribution_due != null))
    .sort((a, b) => String(a.financial_year).localeCompare(String(b.financial_year)))
    .map((a) => balanceRow(a, L));
  const totalPaid = money(L.paidByCompany[companyId] || 0);
  const latestYear = rows.length ? rows[rows.length - 1].financial_year : null;
  return {
    company_id: companyId, rows,
    total_due: money(rows.reduce((s, r) => s + r.due, 0)),
    total_paid: totalPaid,
    total_remaining: money(rows.reduce((s, r) => s + Math.max(r.remaining, 0), 0)),
    past_dues: money(rows.filter((r) => r.financial_year !== latestYear).reduce((s, r) => s + Math.max(r.remaining, 0), 0)),
    unallocated_credit: money(totalPaid - (L.allocByCompany[companyId] || 0)),
  };
}

export function companyBalances(companyId) {
  return balancesFor(companyId, ledger(companyId));
}

// Balances for every company from a single data load (used by reports).
export function allCompanyBalances() {
  const L = ledger();
  const ids = new Set(L.apps.map((a) => a.company_id));
  return Object.fromEntries([...ids].map((id) => [id, balancesFor(id, L)]));
}

function allocate(user, payment, allocations) {
  const total = money(allocations.reduce((s, a) => s + Number(a.amount || 0), 0));
  need(total <= money(payment.payment_amount) + 0.0005, 'Allocated total cannot exceed the payment amount.');
  for (const a of allocations) {
    const app = getDoc('ContributionApplication', a.application_id);
    need(app && app.company_id === payment.company_id, 'Allocation target must be an application of the same company.');
    need(Number(a.amount) >= 0, 'Allocation amounts must be positive.');
  }
  find('PaymentAllocation', { payment_id: payment.id }).forEach((x) => deleteDoc('PaymentAllocation', x.id));
  for (const a of allocations.filter((x) => Number(x.amount) > 0)) {
    const app = getDoc('ContributionApplication', a.application_id);
    insertDoc('PaymentAllocation', { payment_id: payment.id, application_id: app.id, company_id: payment.company_id, financial_year: app.financial_year, allocated_amount: money(a.amount), allocation_date: now(), allocated_by: user?.full_name || 'System', manual: true }, user);
  }
}

// Oldest outstanding financial year first; the payment's own application first if it has one.
export function autoAllocate(user, payment) {
  let left = money(payment.payment_amount);
  const rows = companyBalances(payment.company_id).rows.filter((r) => r.remaining > 0);
  rows.sort((a, b) => (a.application_id === payment.application_id ? -1 : b.application_id === payment.application_id ? 1 : String(a.financial_year).localeCompare(String(b.financial_year))));
  for (const r of rows) {
    if (left <= 0) break;
    const amt = money(Math.min(left, r.remaining));
    insertDoc('PaymentAllocation', { payment_id: payment.id, application_id: r.application_id, company_id: payment.company_id, financial_year: r.financial_year, allocated_amount: amt, allocation_date: now(), allocated_by: user?.full_name || 'System (auto)', manual: false }, user);
    left = money(left - amt);
  }
}

// ---------------- Inbound email ----------------
export async function processInboundEmail({ from, subject = '', body = '' }) {
  const m = `${subject}\n${body}`.match(/THR-\d{4}-\d{6}/);
  const thread = m ? findOne('CommunicationThread', { thread_reference: m[0] }) : null;
  const sender = String(from || '').trim().toLowerCase();
  if (thread) {
    const msg = insertDoc('CommunicationMessage', {
      thread_id: thread.id, company_id: thread.company_id, from_address: sender, to_addresses: REPLY_TO,
      subject, body, direction: 'inbound', delivery_status: 'received', sent_date: now(), channel: 'email', sender_name: sender,
    }, null);
    updateDoc('CommunicationThread', thread.id, { status: 'replied', last_activity: now() });
    const officer = thread.assigned_officer_id ? getDoc('User', thread.assigned_officer_id) : null;
    await notify(officer || usersByRole('contributions_officer'), { category: 'message', title: `Company reply on ${thread.thread_reference}: ${thread.subject}`, link: `/inbox/${thread.id}`, template: 'company_reply', vars: { reference: thread.thread_reference, company: thread.company_name } });
    return { matched: true, thread_id: thread.id, message_id: msg.id };
  }
  const company = allDocs('Company').find((c) => [c.official_email, c.ceo_email, c.financial_manager_email].map((e) => (e || '').toLowerCase()).includes(sender));
  const t = insertDoc('CommunicationThread', {
    thread_reference: nextSequence('THR'), subject: subject || '(no subject)', company_id: company?.id || '', company_name: company?.company_name_en || sender,
    status: 'unmatched', last_activity: now(), participants: [sender],
  }, null);
  const msg = insertDoc('CommunicationMessage', { thread_id: t.id, company_id: company?.id || '', from_address: sender, subject, body, direction: 'inbound', delivery_status: 'received', sent_date: now(), channel: 'email', sender_name: sender }, null);
  await notify(usersByRole('contributions_officer', 'contributions_manager'), { category: 'message', title: `Unmatched email from ${sender}`, link: `/inbox/${t.id}`, email: false });
  return { matched: false, thread_id: t.id, message_id: msg.id };
}

export async function runReminders() {
  const days = Number(setting('pending_review_reminder_days', '3'));
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const today = now().slice(0, 10);
  let sent = 0;
  for (const app of allDocs('ContributionApplication').filter((a) => ['assigned', 'under_review'].includes(a.status) && a.assigned_officer_id)) {
    const since = app.assigned_date || app.submitted_date || app.created_date;
    if (since > cutoff || app.last_reminder_date === today) continue;
    const officer = getDoc('User', app.assigned_officer_id);
    if (!officer) continue;
    await notify(officer, { category: 'reminder', title: `Reminder: ${app.application_reference} pending review for over ${days} days`, link: appLink(app.id), template: 'pending_review_reminder', vars: { reference: app.application_reference, days } });
    updateDoc('ContributionApplication', app.id, { last_reminder_date: today });
    sent++;
  }
  return { sent };
}
