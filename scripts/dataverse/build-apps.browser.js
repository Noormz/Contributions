// Builds forms, views, security roles and the 4 staff apps in the "Contribution" solution.
// Run in the browser console of a Dynamics tab AFTER the provisioning script (it reuses
// window.__K = { spec, call, L }). Progress: window.__apps.log ; result: window.__apps.done
(async () => {
  const { spec, call, L } = window.__K;
  const A = (window.__apps = { log: [], done: false, errors: [] });
  const log = (m) => A.log.push(`${new Date().toISOString().slice(11, 19)} ${m}`);
  const guid = () => crypto.randomUUID();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const opt = (entity, field, label) => spec[entity].columns.find((c) => c.field === field).options.find((o) => o.label === label).value;
  const T = (e) => spec[e].logical;
  const tryStep = async (what, fn) => { try { return await fn(); } catch (e) { A.errors.push(`${what}: ${e.message}`); log(`ERR ${what}: ${e.message}`); return null; } };

  // ---------- which fields staff may edit on forms ----------
  const EDITABLE = {
    SystemSettings: '*', EmailTemplate: '*', FaqEntry: '*', LookupValue: '*', RecordComment: '*',
    User: ['role', 'is_active', 'full_name_ar', 'phone', 'job_title'],
    ActionRequest: ['action', 'application_id', 'payment_id', 'officer_id', 'thread_id', 'inquiry_id', 'net_profit', 'subsidiary_share', 'contribution_rate', 'adjustments', 'amount', 'comments', 'parameters'],
  };
  const canEdit = (e, f) => EDITABLE[e] === '*' || (EDITABLE[e] || []).includes(f);

  const CLASS = {
    text: '{4273EDBD-AC1D-40D3-9FB2-095C621B552D}', memo: '{E0DECE4B-6FC8-4A8F-A065-082708572369}', json: '{E0DECE4B-6FC8-4A8F-A065-082708572369}',
    integer: '{C6D124CA-7EDA-4A60-AEA9-7FB8D318B68F}', decimal: '{C3EFE0C3-0EC6-42BE-8349-CBD9079DFD8E}', boolean: '{67FAC785-CD58-4F9F-ABB3-4B7DDC6ED5ED}',
    date: '{5B773807-9FB2-42DB-97C3-7A91EFF8ADFF}', datetime: '{5B773807-9FB2-42DB-97C3-7A91EFF8ADFF}', choice: '{3EF39988-22BB-4F0B-BBBE-64B5A3748AEE}',
    lookup: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}', subgrid: '{E7A81278-8635-4D9E-8D4D-59480B391C5B}',
  };

  // ---------- metadata we need ----------
  const meta = {};
  for (const [e, t] of Object.entries(spec)) {
    const r = await call('GET', `EntityDefinitions(LogicalName='${t.logical}')?$select=MetadataId,ObjectTypeCode,EntitySetName`);
    meta[e] = r.json;
  }
  log('metadata loaded');

  // ---------- views ----------
  const LIST_KINDS = new Set(['text', 'choice', 'lookup', 'decimal', 'date', 'datetime', 'boolean', 'integer']);
  const PREFERRED = ['company_id', 'company_name', 'financial_year', 'status', 'payment_status', 'payment_amount', 'payment_method', 'calculated_contribution', 'assigned_officer_id', 'submitted_date', 'role', 'email', 'action', 'request_status', 'result', 'setting_value', 'clearance_status', 'voucher_date', 'clearance_date', 'subject', 'is_active'];
  const listCols = (e) => {
    const cols = spec[e].columns.filter((c) => LIST_KINDS.has(c.kind) || (e === 'ActionRequest' && c.field === 'result') || (e === 'SystemSettings' && c.field === 'setting_value'));
    const pick = [...cols.filter((c) => PREFERRED.includes(c.field)), ...cols.filter((c) => !PREFERRED.includes(c.field))].slice(0, 7);
    return pick.map((c) => c.logical);
  };
  const fetchXml = (e, cols, filter = '', order = 'modifiedon', desc = true) => `<fetch version="1.0" mapping="logical"><entity name="${T(e)}"><attribute name="new_name"/>${cols.map((c) => `<attribute name="${c}"/>`).join('')}<attribute name="${T(e)}id"/><order attribute="${order}" descending="${desc}"/><filter type="and"><condition attribute="statecode" operator="eq" value="0"/>${filter}</filter></entity></fetch>`;
  const layoutXml = (e, cols) => `<grid name="resultset" object="${meta[e].ObjectTypeCode}" jump="new_name" select="1" icon="1" preview="1"><row name="result" id="${T(e)}id"><cell name="new_name" width="200"/>${cols.map((c) => `<cell name="${c}" width="${c.includes('result') || c.includes('value') ? 300 : 150}"/>`).join('')}</row></grid>`;
  const views = {}; // entity -> {associated, default, named...}
  for (const e of Object.keys(spec)) {
    const cols = listCols(e);
    const q = await call('GET', `savedqueries?$select=savedqueryid,querytype,name,isdefault&$filter=returnedtypecode eq '${T(e)}'`);
    views[e] = {};
    for (const v of q.json?.value || []) {
      if (v.querytype === 2) views[e].associated = v.savedqueryid;
      if (v.querytype === 0 && v.isdefault) views[e].default = v.savedqueryid;
      if ([0, 2, 64].includes(v.querytype)) {
        await tryStep(`view ${e}/${v.name}`, () => call('PATCH', `savedqueries(${v.savedqueryid})`, { fetchxml: fetchXml(e, cols), layoutxml: layoutXml(e, cols) }));
      }
      if (v.querytype === 4) { // quick find: search by reference/name and portal id
        await tryStep(`quickfind ${e}`, () => call('PATCH', `savedqueries(${v.savedqueryid})`, { fetchxml: `<fetch version="1.0" mapping="logical"><entity name="${T(e)}"><attribute name="new_name"/>${cols.map((c) => `<attribute name="${c}"/>`).join('')}<attribute name="${T(e)}id"/><filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter><filter type="or" isquickfindfields="1"><condition attribute="new_name" operator="like" value="{0}"/><condition attribute="new_portalid" operator="like" value="{0}"/></filter></entity></fetch>`, layoutxml: layoutXml(e, cols) }));
      }
    }
  }
  log('default views updated');

  const NAMED = [
    ['ContributionApplication', 'Awaiting review', `<condition attribute="new_status" operator="in"><value>${opt('ContributionApplication', 'status', 'Submitted')}</value><value>${opt('ContributionApplication', 'status', 'Assigned')}</value><value>${opt('ContributionApplication', 'status', 'Under review')}</value><value>${opt('ContributionApplication', 'status', 'Calculation review')}</value></condition>`],
    ['ContributionApplication', 'Pending manager approval', `<condition attribute="new_status" operator="eq" value="${opt('ContributionApplication', 'status', 'Pending manager approval')}"/>`],
    ['ContributionApplication', 'Accounts processing', `<condition attribute="new_status" operator="eq" value="${opt('ContributionApplication', 'status', 'Accounts processing')}"/>`],
    ['ContributionApplication', 'Returned to company', `<condition attribute="new_status" operator="eq" value="${opt('ContributionApplication', 'status', 'Returned')}"/>`],
    ['ContributionApplication', 'Completed', `<condition attribute="new_status" operator="eq" value="${opt('ContributionApplication', 'status', 'Completed')}"/>`],
    ['ContributionCalculation', 'Pending approval', `<condition attribute="new_status" operator="eq" value="${opt('ContributionCalculation', 'status', 'Pending approval')}"/>`],
    ['Payment', 'Pending verification', `<condition attribute="new_payment_status" operator="eq" value="${opt('Payment', 'payment_status', 'Pending')}"/>`],
    ['Payment', 'Verified payments', `<condition attribute="new_payment_status" operator="eq" value="${opt('Payment', 'payment_status', 'Verified')}"/>`],
    ['ActionRequest', 'My action requests', '<condition attribute="createdby" operator="eq-userid"/>'],
    ['ActionRequest', 'Failed action requests', `<condition attribute="new_request_status" operator="eq" value="${opt('ActionRequest', 'request_status', 'Failed')}"/>`],
    ['Inquiry', 'Open inquiries', `<condition attribute="new_status" operator="in"><value>${opt('Inquiry', 'status', 'Open')}</value><value>${opt('Inquiry', 'status', 'Under review')}</value></condition>`],
    ['CommunicationThread', 'Unmatched emails', `<condition attribute="new_status" operator="eq" value="${opt('CommunicationThread', 'status', 'Unmatched')}"/>`],
    ['User', 'KFAS staff', `<condition attribute="new_role" operator="ne" value="${opt('User', 'role', 'Company representative')}"/>`],
    ['User', 'Company users', `<condition attribute="new_role" operator="eq" value="${opt('User', 'role', 'Company representative')}"/>`],
  ];
  for (const [e, name, filter] of NAMED) {
    const cols = listCols(e);
    const q = await call('GET', `savedqueries?$select=savedqueryid&$filter=returnedtypecode eq '${T(e)}' and name eq '${name}'`);
    const found = q.json?.value?.[0];
    const body = { name, returnedtypecode: T(e), querytype: 0, fetchxml: fetchXml(e, cols, filter), layoutxml: layoutXml(e, cols), description: `KFAS: ${name}` };
    await tryStep(`view ${name}`, () => (found ? call('PATCH', `savedqueries(${found.savedqueryid})`, body) : call('POST', 'savedqueries', body)));
  }
  log('named views ready');

  // ---------- forms ----------
  const cell = (e, c) => {
    const ro = !canEdit(e, c.field) || (e === 'ActionRequest' && ['request_status', 'result', 'processed_date'].includes(c.field));
    return `<row><cell id="{${guid()}}" showlabel="true"><labels><label description="${esc(c.display)}" languagecode="1033"/></labels><control id="${c.logical}" classid="${CLASS[c.kind]}" datafieldname="${c.logical}" disabled="${ro}"/></cell></row>`;
  };
  const section = (title, rows, cols = 2) => `<section name="s_${guid().slice(0, 8)}" showlabel="true" showbar="false" id="{${guid()}}" IsUserDefined="0" columns="${cols === 2 ? '11' : '1'}" labelwidth="140" celllabelalignment="Left" celllabelposition="Left"><labels><label description="${esc(title)}" languagecode="1033"/></labels><rows>${rows}</rows></section>`;
  const tab = (title, sections, expanded = true) => `<tab name="t_${guid().slice(0, 8)}" id="{${guid()}}" IsUserDefined="0" expanded="${expanded}" showlabel="true" verticallayout="true"><labels><label description="${esc(title)}" languagecode="1033"/></labels><columns><column width="100%"><sections>${sections}</sections></column></columns></tab>`;
  const subgrid = (title, childEntity, field) => {
    const view = views[childEntity]?.associated || views[childEntity]?.default;
    return section(title, `<row><cell id="{${guid()}}" showlabel="false" rowspan="8" colspan="1"><labels><label description="${esc(title)}" languagecode="1033"/></labels><control id="sg_${T(childEntity)}_${field}" classid="${CLASS.subgrid}" indicationOfSubgrid="true"><parameters><TargetEntityType>${T(childEntity)}</TargetEntityType><RelationshipName>${T(childEntity)}_${field}</RelationshipName><ViewId>{${view}}</ViewId><IsUserView>false</IsUserView><AutoExpand>Fixed</AutoExpand><EnableQuickFind>false</EnableQuickFind><EnableViewPicker>false</EnableViewPicker><EnableJumpBar>false</EnableJumpBar><RecordsPerPage>6</RecordsPerPage><ChartGridMode>Grid</ChartGridMode><VisualizationId/><IsUserChart>false</IsUserChart><EnableChartPicker>false</EnableChartPicker></parameters></control></cell></row><row/><row/><row/><row/><row/><row/><row/>`, 1);
  };
  const SUBGRIDS = {
    ContributionApplication: [
      ['Actions — request a workflow step here', [['Action requests', 'ActionRequest', 'application_id']]],
      ['Calculation & documents', [['Calculations', 'ContributionCalculation', 'application_id'], ['Financial statements', 'FinancialStatement', 'application_id'], ['Application documents', 'ApplicationDocument', 'application_id'], ['Subsidiary declarations', 'SubsidiaryDeclaration', 'application_id']]],
      ['Payments & documents issued', [['Payments', 'Payment', 'application_id'], ['Payment allocations', 'PaymentAllocation', 'application_id'], ['Receipt vouchers', 'ReceiptVoucher', 'application_id'], ['Clearance letters', 'ClearanceLetter', 'application_id']]],
      ['History', [['Workflow transitions', 'WorkflowTransition', 'application_id'], ['Approval history', 'ApprovalHistory', 'application_id'], ['Officer assignments', 'OfficerAssignment', 'application_id'], ['Communication threads', 'CommunicationThread', 'application_id']]],
    ],
    Company: [['Related', [['Applications', 'ContributionApplication', 'company_id'], ['Payments', 'Payment', 'company_id'], ['Portal users', 'User', 'company_id'], ['Threads', 'CommunicationThread', 'company_id'], ['Inquiries', 'Inquiry', 'company_id'], ['Subsidiaries', 'CompanyRelationship', 'parent_company_id'], ['Profile changes', 'CompanyProfileChangeHistory', 'company_id'], ['Files', 'PortalFile', 'company_id']]]],
    Payment: [['Actions & allocations', [['Action requests', 'ActionRequest', 'payment_id'], ['Allocations', 'PaymentAllocation', 'payment_id'], ['Gateway transactions', 'PaymentGatewayTransaction', 'payment_id']]]],
    CommunicationThread: [['Messages', [['Messages', 'CommunicationMessage', 'thread_id'], ['Attachments', 'CommunicationAttachment', 'thread_id'], ['Action requests', 'ActionRequest', 'thread_id']]]],
    Inquiry: [['Actions', [['Action requests', 'ActionRequest', 'inquiry_id']]]],
    ContributionCalculation: [['Versions', [['Calculation versions', 'CalculationVersion', 'calculation_id']]]],
    User: [['Notifications', [['Notifications', 'Notification', 'user_id']]]],
  };
  const formIds = {};
  for (const [e, t] of Object.entries(spec)) {
    const main = t.columns.filter((c) => !['memo', 'json'].includes(c.kind));
    const long = t.columns.filter((c) => ['memo', 'json'].includes(c.kind));
    const nameRo = !(EDITABLE[e] === '*');
    let tabs = tab('General', section('Details', `<row><cell id="{${guid()}}" showlabel="true"><labels><label description="Name" languagecode="1033"/></labels><control id="new_name" classid="${CLASS.text}" datafieldname="new_name" disabled="${nameRo}"/></cell></row>${main.map((c) => cell(e, c)).join('')}`, 2) + (long.length ? section('Text', long.map((c) => cell(e, c)).join(''), 1) : ''));
    for (const [title, grids] of SUBGRIDS[e] || []) tabs += tab(title, grids.map(([gt, ce, f]) => subgrid(gt, ce, f)).join(''));
    tabs += tab('Portal link', section('Technical', ['new_portalid', 'new_portal_created_on', 'new_portal_created_by', 'new_extra'].map((f) => `<row><cell id="{${guid()}}" showlabel="true"><labels><label description="${f}" languagecode="1033"/></labels><control id="${f}" classid="${f === 'new_extra' ? CLASS.memo : f === 'new_portal_created_on' ? CLASS.datetime : CLASS.text}" datafieldname="${f}" disabled="true"/></cell></row>`).join(''), 1), false);
    const formxml = `<form><tabs>${tabs}</tabs></form>`;
    const f = await call('GET', `systemforms?$select=formid,name&$filter=objecttypecode eq '${t.logical}' and type eq 2`);
    const existing = f.json?.value?.[0];
    await tryStep(`form ${e}`, async () => {
      if (existing) { await call('PATCH', `systemforms(${existing.formid})`, { formxml }); formIds[e] = existing.formid; }
      else { const r = await call('POST', 'systemforms', { name: `${t.display} (KFAS)`, objecttypecode: t.logical, type: 2, formxml }); formIds[e] = (r.headers?.get('OData-EntityId') || '').match(/\(([^)]+)\)/)?.[1]; }
    });
  }
  log('forms ready');

  // Default "Pending" on new action requests and make Action required.
  await tryStep('action request defaults', async () => {
    for (const [attrName, change] of [['new_request_status', (m) => { m.DefaultFormValue = 100000000; }], ['new_action', (m) => { m.RequiredLevel = { Value: 'ApplicationRequired', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' }; }]]) {
      const r = await call('GET', `EntityDefinitions(LogicalName='new_actionrequest')/Attributes(LogicalName='${attrName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`);
      const m = r.json; delete m['@odata.context']; m['@odata.type'] = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'; change(m);
      await call('PUT', `EntityDefinitions(LogicalName='new_actionrequest')/Attributes(LogicalName='${attrName}')`, m, 4, { 'MSCRM.MergeLabels': 'true' });
    }
  });

  // ---------- security roles ----------
  const bu = (await call('GET', 'businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null')).json.value[0].businessunitid;
  const privs = {};
  for (const t of Object.values(spec)) {
    const r = await call('GET', `privileges?$select=privilegeid,name&$filter=endswith(name,'${t.logical}')`);
    for (const p of r.json?.value || []) privs[p.name] = p.privilegeid;
  }
  const P = (verbs, entities) => entities.flatMap((e) => verbs.map((v) => privs[`prv${v}${T(e)}`]).filter(Boolean));
  const ALL = Object.keys(spec);
  const READ = P(['Read', 'AppendTo'], ALL);
  const ACTIONREQ = P(['Create', 'Read', 'Write', 'Append'], ['ActionRequest']);
  const COMMENTS = P(['Create', 'Write', 'Append'], ['RecordComment']);
  const ADMIN_EDIT = P(['Create', 'Write', 'Append', 'Delete'], ['SystemSettings', 'EmailTemplate', 'FaqEntry', 'LookupValue', 'RecordComment']).concat(P(['Write', 'Append'], ['User']));
  const INTEGRATION = P(['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo', 'Assign', 'Share'], ALL);
  const ROLES = {
    'KFAS Contributions Officer': [...READ, ...ACTIONREQ, ...COMMENTS],
    'KFAS Contributions Manager': [...READ, ...ACTIONREQ, ...COMMENTS],
    'KFAS Accounts Unit': [...READ, ...ACTIONREQ, ...COMMENTS],
    'KFAS System Admin': [...READ, ...ACTIONREQ, ...ADMIN_EDIT],
    'KFAS Portal Integration': INTEGRATION,
  };
  const roleIds = {};
  for (const [name, list] of Object.entries(ROLES)) {
    await tryStep(`role ${name}`, async () => {
      const q = await call('GET', `roles?$select=roleid&$filter=name eq '${name}' and _businessunitid_value eq ${bu}`);
      let id = q.json?.value?.[0]?.roleid;
      if (!id) { const r = await call('POST', 'roles', { name, 'businessunitid@odata.bind': `/businessunits(${bu})` }); id = (r.headers?.get('OData-EntityId') || '').match(/\(([^)]+)\)/)?.[1]; }
      roleIds[name] = id;
      await call('POST', `roles(${id})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, { Privileges: [...new Set(list)].map((pid) => ({ PrivilegeId: pid, Depth: 'Global', BusinessUnitId: bu })) });
      await call('POST', 'AddSolutionComponent', { ComponentId: id, ComponentType: 20, SolutionUniqueName: 'Contribution', AddRequiredComponents: false, DoNotIncludeSubcomponents: false }).catch(() => null);
    });
  }
  log('security roles ready');

  // ---------- apps ----------
  const sub = (e, title, view) => `<SubArea Id="sa_${guid().slice(0, 8)}" Entity="${T(e)}"${view ? ` DefaultDashboard="" ` : ''}><Titles><Title LCID="1033" Title="${esc(title || spec[e].plural)}"/></Titles></SubArea>`;
  const group = (title, items) => `<Group Id="g_${guid().slice(0, 8)}" IsProfile="false"><Titles><Title LCID="1033" Title="${esc(title)}"/></Titles>${items.map(([e, t]) => sub(e, t)).join('')}</Group>`;
  const area = (title, groups) => `<Area Id="a_${guid().slice(0, 8)}" ShowGroups="true"><Titles><Title LCID="1033" Title="${esc(title)}"/></Titles>${groups.join('')}</Area>`;
  const sitemap = (areas) => `<SiteMap IntroducedVersion="7.0.0.0">${areas.join('')}</SiteMap>`;
  const COMMON_COMMS = group('Communications', [['CommunicationThread', 'Threads'], ['CommunicationMessage', 'Messages'], ['Inquiry', 'Inquiries']]);
  const COMPANIES = group('Companies', [['Company'], ['CompanyRelationship', 'Subsidiaries'], ['CompanyProfileChangeHistory', 'Profile changes'], ['User', 'Portal users']]);
  const APPS = [
    { unique: 'new_KFASOfficer', name: 'KFAS Officer', role: 'KFAS Contributions Officer', desc: 'Review applications, calculate contributions, communicate with companies.', map: sitemap([
      area('Work', [group('My work', [['ContributionApplication', 'Applications'], ['ContributionCalculation', 'Calculations'], ['ActionRequest', 'Action requests']]), group('Application records', [['FinancialStatement', 'Financial statements'], ['ApplicationDocument', 'Documents'], ['SubsidiaryDeclaration', 'Subsidiary declarations'], ['PortalFile', 'Files']])]),
      area('Companies', [COMPANIES, COMMON_COMMS]),
      area('History', [group('History', [['WorkflowTransition', 'Workflow transitions'], ['ApprovalHistory', 'Approval history'], ['OfficerAssignment', 'Assignments'], ['CalculationVersion', 'Calculation versions']])]),
    ]) },
    { unique: 'new_KFASManager', name: 'KFAS Manager', role: 'KFAS Contributions Manager', desc: 'Approve calculations, assign officers, monitor workload and payments.', map: sitemap([
      area('Approvals', [group('Approvals', [['ContributionApplication', 'Applications'], ['ContributionCalculation', 'Calculations'], ['CalculationVersion', 'Calculation versions'], ['ActionRequest', 'Action requests']]), group('Assignments', [['OfficerAssignment', 'Officer assignments'], ['User', 'Staff & users']])]),
      area('Companies', [COMPANIES, COMMON_COMMS]),
      area('Finance', [group('Payments', [['Payment', 'Payments'], ['PaymentAllocation', 'Allocations'], ['ReceiptVoucher', 'Receipt vouchers'], ['ClearanceLetter', 'Clearance letters']])]),
      area('History', [group('History & audit', [['WorkflowTransition', 'Workflow transitions'], ['ApprovalHistory', 'Approval history'], ['AuditLog', 'Audit log']])]),
    ]) },
    { unique: 'new_KFASAccounts', name: 'KFAS Accounts', role: 'KFAS Accounts Unit', desc: 'Verify payments, issue receipt vouchers and clearance letters, complete applications.', map: sitemap([
      area('Payments', [group('Payments', [['Payment', 'Payments'], ['PaymentAllocation', 'Allocations'], ['PaymentGatewayTransaction', 'Gateway transactions'], ['ActionRequest', 'Action requests']]), group('Documents issued', [['ReceiptVoucher', 'Receipt vouchers'], ['ClearanceLetter', 'Clearance letters'], ['DocumentVerification', 'Document verifications']])]),
      area('Applications', [group('Applications', [['ContributionApplication', 'Applications'], ['ContributionCalculation', 'Calculations'], ['Company', 'Companies']])]),
    ]) },
    { unique: 'new_KFASAdmin', name: 'KFAS Admin', role: 'KFAS System Admin', desc: 'Users, settings, email templates, FAQ, lookups and system monitoring.', map: sitemap([
      area('Administration', [group('Users', [['User', 'Portal users']]), group('Configuration', [['SystemSettings', 'System settings'], ['EmailTemplate', 'Email templates'], ['FaqEntry', 'FAQ'], ['LookupValue', 'Lookup values'], ['Counter', 'Reference counters']])]),
      area('Monitoring', [group('Monitoring', [['AuditLog', 'Audit log'], ['ActionRequest', 'Action requests'], ['MailOutbox', 'Mail outbox'], ['Notification', 'Notifications'], ['DocumentVerification', 'Document verifications'], ['PortalFile', 'Files'], ['RecordComment', 'Comments']])]),
      area('Business data', [group('Applications', [['ContributionApplication', 'Applications'], ['ContributionCalculation', 'Calculations'], ['Payment', 'Payments'], ['ReceiptVoucher', 'Receipt vouchers'], ['ClearanceLetter', 'Clearance letters']]), COMPANIES, COMMON_COMMS]),
    ]) },
  ];
  A.apps = {};
  for (const app of APPS) {
    await tryStep(`app ${app.name}`, async () => {
      const q = await call('GET', `appmodules?$select=appmoduleid&$filter=uniquename eq '${app.unique}'`);
      let id = q.json?.value?.[0]?.appmoduleid;
      if (!id) {
        const r = await call('POST', 'appmodules', { name: app.name, uniquename: app.unique, description: app.desc, clienttype: 4, formfactor: 1, navigationtype: 0, webresourceid: '953b9fac-1e5e-e611-80d6-00155ded156f' });
        id = (r.headers?.get('OData-EntityId') || '').match(/\(([^)]+)\)/)?.[1];
      }
      const sq = await call('GET', `sitemaps?$select=sitemapid&$filter=sitemapnameunique eq '${app.unique}'`);
      let sid = sq.json?.value?.[0]?.sitemapid;
      if (sid) await call('PATCH', `sitemaps(${sid})`, { sitemapxml: app.map });
      else {
        const r = await call('POST', 'sitemaps', { sitemapname: app.name, sitemapnameunique: app.unique, sitemapxml: app.map, isappaware: true });
        sid = (r.headers?.get('OData-EntityId') || '').match(/\(([^)]+)\)/)?.[1];
      }
      const entities = [...new Set([...app.map.matchAll(/Entity="([^"]+)"/g)].map((m) => m[1]))];
      const comps = [{ '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: sid }, ...entities.map((l) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.entity', entityid: meta[Object.keys(spec).find((k) => spec[k].logical === l)].MetadataId }))];
      await call('POST', 'AddAppComponents', { AppId: id, Components: comps });
      if (roleIds[app.role]) await call('POST', `appmodules(${id})/appmoduleroles_association/$ref`, { '@odata.id': `${location.origin}/api/data/v9.2/roles(${roleIds[app.role]})` }).catch(() => null);
      const v = await call('GET', `ValidateApp(AppModuleId=${id})`);
      await call('POST', 'PublishXml', { ParameterXml: `<importexportxml><appmodules><appmodule>${id}</appmodule></appmodules></importexportxml>` });
      A.apps[app.name] = { id, validation: v.json?.AppValidationResponse?.ValidationSuccess, issues: (v.json?.AppValidationResponse?.ValidationIssueList || []).slice(0, 3).map((i) => i.Message) };
      log(`app ${app.name} ready`);
    });
  }
  await call('POST', 'PublishAllXml', {});
  log('published');
  A.done = true;
})().catch((e) => { window.__apps.error = String(e.message || e); window.__apps.done = true; });
'apps started';
