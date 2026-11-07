// Runs workflow actions that KFAS staff request from the Dynamics apps.
//
// In a Dynamics app the staff member creates an "Action Request" (from the application,
// payment, thread or inquiry form) choosing the action and filling the fields it needs.
// The portal server picks pending requests up, runs the SAME workflow function the portal
// uses (same rules, same notifications, same PDFs) as the portal user with the same email,
// and writes the outcome back to the request (Done / Failed + message).
import { allDocs, getDoc, now } from '../db.js';
import { functions, runReminders } from '../functions.js';
import { findOne } from '../services.js';
import { TABLES, ACTIONS } from './schema.js';
import { request, getAll, whoAmI } from './client.js';
import { fromRow, resolveId } from './sync.js';

const T = TABLES.ActionRequest;
const STATUS = Object.fromEntries(T.columns.find((c) => c.field === 'request_status').options.map((o) => [o.key, o.value]));
const INTERNAL = ['contributions_officer', 'contributions_manager', 'accounts_unit', 'system_admin'];

const money = (n) => Number(Number(n || 0).toFixed(3));
const set = () => T.entitySet;

function staffUser(email) {
  const e = String(email || '').toLowerCase();
  const u = allDocs('User').find((x) => String(x.email || '').toLowerCase() === e);
  if (!u) throw new Error(`No portal user has the email ${email}. Add this staff member in the Admin app with the same email as their Dynamics login.`);
  if (u.is_active === false) throw new Error(`The portal user ${email} is deactivated.`);
  if (u.role === 'admin') u.role = 'system_admin';
  if (!INTERNAL.includes(u.role)) throw new Error(`The portal user ${email} is not a KFAS staff member.`);
  return u;
}

const needApp = (r) => {
  if (!r.application_id) throw new Error('Choose the application for this action.');
  const app = getDoc('ContributionApplication', r.application_id);
  if (!app) throw new Error('The application was not found in the portal.');
  return app;
};

function calcInputs(app, r) {
  const calc = findOne('ContributionCalculation', { application_id: app.id });
  let prev = {};
  try { prev = calc?.financial_inputs ? JSON.parse(calc.financial_inputs) : {}; } catch { prev = {}; }
  let extra = {};
  try { extra = r.parameters ? JSON.parse(r.parameters) : {}; } catch { throw new Error('Extra parameters must be valid JSON.'); }
  const pick = (v, fallback) => (v === '' || v === null || v === undefined ? fallback : v);
  return {
    calc,
    inputs: {
      net_profit: pick(r.net_profit, prev.net_profit),
      subsidiary_share: pick(r.subsidiary_share, prev.subsidiary_share ?? 0),
      contribution_rate: pick(r.contribution_rate, prev.contribution_rate ?? Number(allDocs('SystemSettings').find((s) => s.setting_key === 'default_contribution_rate')?.setting_value ?? 1)),
      adjustments: pick(r.adjustments, calc?.adjustments ?? 0),
      calculation_basis: extra.calculation_basis ?? calc?.calculation_basis ?? '',
      previous_contribution: extra.previous_contribution ?? calc?.previous_contribution ?? 0,
      outstanding_balance: extra.outstanding_balance ?? calc?.outstanding_balance ?? 0,
      officer_comments: r.comments || calc?.officer_comments || '',
    },
    extra,
  };
}

// Returns a short human message describing the result.
export async function runAction(user, key, r) {
  const comments = r.comments || '';
  switch (key) {
    case 'start_review': case 'return_to_company': case 'escalate': case 'approve': case 'return_to_officer': case 'complete': {
      const app = needApp(r);
      const u = await functions.applicationAction(user, { application_id: app.id, action: key, comments });
      return `${app.application_reference}: status is now "${u.status}".`;
    }
    case 'save_calculation': case 'submit_calculation': {
      const app = needApp(r);
      const { calc, inputs } = calcInputs(app, r);
      const submit = key === 'submit_calculation';
      const out = calc?.reopened && submit
        ? await functions.submitReopenedCalculation(user, { application_id: app.id, inputs, reason: comments || 'Revised calculation' })
        : await functions.saveCalculation(user, { application_id: app.id, inputs, submit, reason: comments });
      return `${out.calculation_reference}: contribution ${money(out.calculated_contribution).toLocaleString('en-US', { minimumFractionDigits: 3 })} KWD${submit ? ', sent to the manager for approval' : ' saved'}.`;
    }
    case 'assign_officer': {
      const app = needApp(r);
      if (!r.officer_id) throw new Error('Choose the officer to assign.');
      await functions.assignApplication(user, { application_id: app.id, officer_id: r.officer_id, reason: comments });
      return `${app.application_reference} assigned to ${getDoc('User', r.officer_id)?.full_name || 'officer'}.`;
    }
    case 'auto_assign': {
      const app = needApp(r);
      const u = await functions.autoAssign(user, { application_id: app.id });
      return `${app.application_reference} assigned to ${u.assigned_officer_name}.`;
    }
    case 'reopen_calculation': {
      const app = needApp(r);
      const calc = findOne('ContributionCalculation', { application_id: app.id });
      if (!calc) throw new Error('This application has no calculation yet.');
      await functions.reopenCalculation(user, { calculation_id: calc.id, reason: comments });
      return `${calc.calculation_reference} reopened. Enter the revised figures and run "Submit calculation to manager".`;
    }
    case 'verify_payment': case 'reject_payment': {
      if (!r.payment_id) throw new Error('Choose the payment.');
      const p = await functions.verifyPayment(user, { payment_id: r.payment_id, decision: key === 'verify_payment' ? 'verified' : 'rejected', notes: comments });
      return `${p.payment_reference}: ${p.payment_status}.`;
    }
    case 'issue_receipt_voucher': case 'issue_clearance_letter': {
      const app = r.application_id ? needApp(r) : null;
      const pay = r.payment_id ? getDoc('Payment', r.payment_id) : null;
      const companyId = app?.company_id || pay?.company_id;
      if (!companyId) throw new Error('Choose the application (or payment) the document is for.');
      let extra = {};
      try { extra = r.parameters ? JSON.parse(r.parameters) : {}; } catch { throw new Error('Extra parameters must be valid JSON.'); }
      const rec = await functions.issueDocument(user, {
        kind: key === 'issue_receipt_voucher' ? 'voucher' : 'clearance', company_id: companyId,
        application_id: app?.id || pay?.application_id || '', related_payment_id: pay?.id || '',
        date: extra.date, validity_period: extra.validity_period,
      });
      return `${rec.voucher_number || rec.clearance_reference} issued.`;
    }
    case 'send_message': {
      const thread = r.thread_id ? getDoc('CommunicationThread', r.thread_id) : null;
      const app = r.application_id ? getDoc('ContributionApplication', r.application_id) : null;
      let extra = {};
      try { extra = r.parameters ? JSON.parse(r.parameters) : {}; } catch { throw new Error('Extra parameters must be valid JSON.'); }
      const m = await functions.sendThreadMessage(user, {
        thread_id: thread?.id, company_id: thread?.company_id || app?.company_id, application_id: app?.id,
        subject: extra.subject || thread?.subject || (app ? `Application ${app.application_reference}` : ''), body: comments,
      });
      return `Message sent${m?.thread_reference ? ` (${m.thread_reference})` : ''}.`;
    }
    case 'respond_inquiry': {
      if (!r.inquiry_id) throw new Error('Choose the inquiry.');
      let extra = {};
      try { extra = r.parameters ? JSON.parse(r.parameters) : {}; } catch { extra = {}; }
      const inq = await functions.respondInquiry(user, { inquiry_id: r.inquiry_id, response: comments, close: !!extra.close });
      return `${inq.inquiry_reference}: ${inq.status}.`;
    }
    case 'run_reminders': {
      if (!['system_admin', 'contributions_manager'].includes(user.role)) throw new Error('Only managers and admins can run reminders.');
      await runReminders();
      return 'Reminders sent.';
    }
    default:
      throw new Error(`Unknown action ${key}`);
  }
}

export async function processActionRequests() {
  const me = await whoAmI();
  const rows = await getAll(`${set()}?$filter=new_request_status eq ${STATUS.pending} or new_request_status eq null&$expand=createdby($select=internalemailaddress,domainname)&$orderby=createdon asc&$top=20`, 1);
  for (const row of rows) {
    const id = row.new_actionrequestid;
    // claim it (another server instance may be running)
    const claim = await request('PATCH', `${set()}(${id})`, { new_request_status: STATUS.processing }, { 'If-Match': row['@odata.etag'] });
    if (claim.status >= 300) continue;
    const r = fromRow('ActionRequest', row, resolveId);
    const key = ACTIONS.find((a) => a.key === r.action)?.key;
    let result; let ok = false;
    try {
      if (row._createdby_value === me.UserId) throw new Error('Action requests must be created by a staff member.');
      const email = row.createdby?.internalemailaddress || row.createdby?.domainname;
      const user = staffUser(email);
      if (!key) throw new Error('Choose an action.');
      result = await runAction(user, key, r);
      ok = true;
    } catch (e) {
      result = String(e.message || e);
    }
    await request('PATCH', `${set()}(${id})`, {
      new_request_status: ok ? STATUS.done : STATUS.failed, new_result: result.slice(0, 4000), new_processed_date: now(),
      new_name: `${ACTIONS.find((a) => a.key === r.action)?.label || 'Action'} — ${ok ? 'done' : 'failed'}`.slice(0, 400),
    });
  }
  return rows.length;
}
