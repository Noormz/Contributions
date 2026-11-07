// Maps every portal entity (base44/entities/*.jsonc) to a Dataverse table in the
// "Contribution" solution (publisher prefix new_). One source of truth used by:
//   - scripts/dataverse/build-schema.mjs  (creates the tables in Dynamics)
//   - server/dataverse/sync.js            (pushes/pulls records)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PREFIX = 'new_';
export const SOLUTION = 'Contribution';
const ENTITY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../base44/entities');

// Logical table names (singular) — kept short and readable for staff.
const TABLE_NAMES = {
  User: 'portaluser',
  ContributionApplication: 'application',
  ContributionCalculation: 'calculation',
  CalculationVersion: 'calculationversion',
  CompanyProfileChangeHistory: 'profilechange',
  CompanyRelationship: 'companyrelationship',
  CommunicationThread: 'commthread',
  CommunicationMessage: 'commmessage',
  CommunicationAttachment: 'commattachment',
  PaymentGatewayTransaction: 'gatewaytransaction',
  PaymentAllocation: 'paymentallocation',
  DocumentVerification: 'documentverification',
  SubsidiaryDeclaration: 'subsidiarydeclaration',
  ApplicationDocument: 'applicationdocument',
  FinancialStatement: 'financialstatement',
  WorkflowTransition: 'workflowtransition',
  OfficerAssignment: 'officerassignment',
  ApprovalHistory: 'approvalhistory',
  ClearanceLetter: 'clearanceletter',
  ReceiptVoucher: 'receiptvoucher',
  SystemSettings: 'systemsetting',
  EmailTemplate: 'emailtemplate',
  RecordComment: 'recordcomment',
  LookupValue: 'lookupvalue',
  Notification: 'notification',
  MailOutbox: 'mailoutbox',
  AuditLog: 'auditlog',
  FaqEntry: 'faqentry',
  Inquiry: 'inquiry',
  Payment: 'payment',
  Company: 'company',
};

const DISPLAY = {
  User: ['Portal User', 'Portal Users'],
  ContributionApplication: ['Contribution Application', 'Contribution Applications'],
  ContributionCalculation: ['Contribution Calculation', 'Contribution Calculations'],
  CompanyProfileChangeHistory: ['Profile Change', 'Profile Changes'],
  CommunicationThread: ['Communication Thread', 'Communication Threads'],
  CommunicationMessage: ['Communication Message', 'Communication Messages'],
  CommunicationAttachment: ['Communication Attachment', 'Communication Attachments'],
  PaymentGatewayTransaction: ['Gateway Transaction', 'Gateway Transactions'],
  SystemSettings: ['System Setting', 'System Settings'],
  ApprovalHistory: ['Approval History', 'Approval History'],
  MailOutbox: ['Mail Outbox', 'Mail Outbox'],
};

// Portal id fields that point at another entity -> Dataverse lookup.
const LOOKUPS = {
  company_id: 'Company', parent_company_id: 'Company', subsidiary_company_id: 'Company',
  application_id: 'ContributionApplication',
  calculation_id: 'ContributionCalculation',
  payment_id: 'Payment', related_payment_id: 'Payment',
  thread_id: 'CommunicationThread',
  receipt_voucher_id: 'ReceiptVoucher',
  user_id: 'User', primary_user_id: 'User', assigned_officer_id: 'User', uploaded_by_id: 'User',
  approved_by_id: 'User', reviewed_by_id: 'User', previous_officer_id: 'User', new_officer_id: 'User',
};
// Fields that are not lookups on these entities even though the name matches.
const LOOKUP_EXCEPTIONS = { MailOutbox: ['thread_id'], AuditLog: ['user_id'] };

const LONG_TEXT = /(^|_)(body|html|description|comments?|notes|snapshot|response|inputs|summary|answer|reason|lock_info|addresses|gateway_response|previous_value|new_value|setting_value)($|_)/;
const INTEGER_FIELDS = new Set(['version', 'sort_order', 'current_step', 'file_size']);

// Entities staff may edit directly in Dynamics; edits are pulled back into the portal.
// Everything else is written only by the portal (status changes go through functions).
export const STAFF_EDITABLE = new Set(['SystemSettings', 'EmailTemplate', 'FaqEntry', 'LookupValue', 'RecordComment']);
// Columns of User staff may edit in the Admin app (role and activation).
export const STAFF_EDITABLE_FIELDS = { User: ['role', 'is_active', 'full_name_ar', 'phone', 'job_title'] };

const stripComments = (s) => s.replace(/^\s*\/\/.*$/mg, '').replace(/\/\*[\s\S]*?\*\//g, '');
const label = (s) => s.replace(/_/g, ' ').replace(/\b(id)\b/gi, '').trim().replace(/^./, (c) => c.toUpperCase()).replace(/\s+/g, ' ');
const pluralize = (n) => (n.endsWith('y') && !/[aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : n.endsWith('s') || n.endsWith('x') ? `${n}es` : `${n}s`);
const choiceLabel = (v) => v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Deterministic Dataverse GUID for a portal id, so lookups can be bound without a round trip.
export function toGuid(id) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return String(id).toLowerCase(); // created in Dynamics
  const h = crypto.createHash('md5').update(String(id)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function columnFor(entity, field, spec) {
  const logical = `${PREFIX}${field}`.toLowerCase();
  const base = { field, logical, display: label(field) || field };
  if (LOOKUPS[field] && !(LOOKUP_EXCEPTIONS[entity] || []).includes(field)) {
    return { ...base, kind: 'lookup', target: LOOKUPS[field], display: label(field.replace(/_id$/, '')) };
  }
  if (spec.type === 'boolean') return { ...base, kind: 'boolean' };
  if (spec.type === 'number' || spec.type === 'integer') {
    return INTEGER_FIELDS.has(field) || spec.type === 'integer' ? { ...base, kind: 'integer' } : { ...base, kind: 'decimal' };
  }
  if (spec.type === 'array' || spec.type === 'object') return { ...base, kind: 'json' };
  if (spec.enum) {
    return { ...base, kind: 'choice', options: spec.enum.map((v, i) => ({ value: 100000000 + i, key: v, label: choiceLabel(v) })) };
  }
  if (spec.format === 'date') return { ...base, kind: 'date' };
  if (spec.format === 'date-time') return { ...base, kind: 'datetime' };
  return { ...base, kind: LONG_TEXT.test(field) ? 'memo' : 'text' };
}

function loadEntities() {
  return fs.readdirSync(ENTITY_DIR).filter((f) => f.endsWith('.jsonc')).sort().map((f) => JSON.parse(stripComments(fs.readFileSync(path.join(ENTITY_DIR, f), 'utf8'))));
}

function build() {
  const tables = {};
  for (const ent of loadEntities()) {
    const name = ent.name;
    const short = TABLE_NAMES[name] || name.toLowerCase();
    const logical = `${PREFIX}${short}`;
    const words = label(name.replace(/([a-z])([A-Z])/g, '$1_$2'));
    const [display, plural] = DISPLAY[name] || [words, pluralize(words)];
    const props = { ...ent.properties };
    if (name === 'User') { props.email = { type: 'string' }; props.full_name = { type: 'string' }; }
    const columns = Object.entries(props).map(([f, spec]) => columnFor(name, f, spec));
    tables[name] = {
      entity: name, logical, entitySet: pluralize(logical), display, plural,
      columns,
      staffEditable: STAFF_EDITABLE.has(name),
    };
  }
  // Uploaded files (server "files" table) — content goes to a file column.
  tables.PortalFile = {
    entity: 'PortalFile', logical: `${PREFIX}portalfile`, entitySet: `${PREFIX}portalfiles`, display: 'Portal File', plural: 'Portal Files',
    columns: [
      { field: 'filename', logical: 'new_filename', display: 'Filename', kind: 'text' },
      { field: 'mime', logical: 'new_mime', display: 'Mime type', kind: 'text' },
      { field: 'size', logical: 'new_size', display: 'Size', kind: 'integer' },
      { field: 'uploaded_by', logical: 'new_uploaded_by', display: 'Uploaded by', kind: 'lookup', target: 'User' },
      { field: 'company_id', logical: 'new_company_id', display: 'Company', kind: 'lookup', target: 'Company' },
    ],
    fileColumn: { logical: 'new_content', display: 'Content' },
    staffEditable: false,
  };
  // Reference counters (APP-2026-000001 …) so numbering survives a rebuild from Dynamics.
  tables.Counter = {
    entity: 'Counter', logical: `${PREFIX}counter`, entitySet: `${PREFIX}counters`, display: 'Reference Counter', plural: 'Reference Counters',
    columns: [{ field: 'value', logical: 'new_value', display: 'Value', kind: 'integer' }],
    staffEditable: false,
  };
  // Staff actions requested from the Dynamics apps; the portal server executes them.
  tables.ActionRequest = {
    entity: 'ActionRequest', logical: `${PREFIX}actionrequest`, entitySet: `${PREFIX}actionrequests`, display: 'Action Request', plural: 'Action Requests',
    columns: [
      { field: 'action', logical: 'new_action', display: 'Action', kind: 'choice', options: ACTIONS.map((a, i) => ({ value: 100000000 + i, key: a.key, label: a.label })) },
      { field: 'application_id', logical: 'new_application_id', display: 'Application', kind: 'lookup', target: 'ContributionApplication' },
      { field: 'payment_id', logical: 'new_payment_id', display: 'Payment', kind: 'lookup', target: 'Payment' },
      { field: 'officer_id', logical: 'new_officer_id', display: 'Officer', kind: 'lookup', target: 'User' },
      { field: 'thread_id', logical: 'new_thread_id', display: 'Thread', kind: 'lookup', target: 'CommunicationThread' },
      { field: 'inquiry_id', logical: 'new_inquiry_id', display: 'Inquiry', kind: 'lookup', target: 'Inquiry' },
      { field: 'net_profit', logical: 'new_net_profit', display: 'Net profit', kind: 'decimal' },
      { field: 'subsidiary_share', logical: 'new_subsidiary_share', display: 'Subsidiary share', kind: 'decimal' },
      { field: 'contribution_rate', logical: 'new_contribution_rate', display: 'Contribution rate %', kind: 'decimal' },
      { field: 'adjustments', logical: 'new_adjustments', display: 'Adjustments', kind: 'decimal' },
      { field: 'amount', logical: 'new_amount', display: 'Amount', kind: 'decimal' },
      { field: 'comments', logical: 'new_comments', display: 'Comments / message', kind: 'memo' },
      { field: 'parameters', logical: 'new_parameters', display: 'Extra parameters (JSON)', kind: 'memo' },
      { field: 'request_status', logical: 'new_request_status', display: 'Request status', kind: 'choice', options: ['pending', 'processing', 'done', 'failed'].map((k, i) => ({ value: 100000000 + i, key: k, label: choiceLabel(k) })) },
      { field: 'result', logical: 'new_result', display: 'Result', kind: 'memo' },
      { field: 'processed_date', logical: 'new_processed_date', display: 'Processed on', kind: 'datetime' },
    ],
    staffEditable: false,
  };
  return tables;
}

// Actions staff can run from the Dynamics apps (executed by server/dataverse/actions.js).
export const ACTIONS = [
  { key: 'start_review', label: 'Start review' },
  { key: 'save_calculation', label: 'Save calculation (draft)' },
  { key: 'submit_calculation', label: 'Submit calculation to manager' },
  { key: 'return_to_company', label: 'Return to company' },
  { key: 'escalate', label: 'Escalate to manager' },
  { key: 'approve', label: 'Approve (manager)' },
  { key: 'return_to_officer', label: 'Return to officer (manager)' },
  { key: 'assign_officer', label: 'Assign / reassign officer' },
  { key: 'auto_assign', label: 'Auto-assign officer' },
  { key: 'reopen_calculation', label: 'Reopen calculation' },
  { key: 'verify_payment', label: 'Verify payment' },
  { key: 'reject_payment', label: 'Reject payment' },
  { key: 'issue_receipt_voucher', label: 'Issue receipt voucher' },
  { key: 'issue_clearance_letter', label: 'Issue clearance letter' },
  { key: 'complete', label: 'Complete application' },
  { key: 'send_message', label: 'Send message to company' },
  { key: 'respond_inquiry', label: 'Respond to inquiry' },
  { key: 'run_reminders', label: 'Run reminders now' },
];

export const TABLES = build();
export const tableByLogical = (logical) => Object.values(TABLES).find((t) => t.logical === logical);
