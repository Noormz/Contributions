// Creates/updates the Dataverse schema for the portal inside the "Contribution" solution.
// Plain JS with no imports so the same code runs in Node (scripts/dataverse/provision.mjs,
// app-registration token) or pasted into a browser tab signed in to Dynamics (cookie auth).
// Idempotent: existing tables, columns and relationships are skipped.
//
// request(method, path, body) -> { status, json } ; path is relative to /api/data/v9.2/

export async function provision({ request, spec, log = console.log, solution = 'Contribution', concurrency = 1 }) {
  const L = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });
  const req = { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' };
  // Dynamics allows one table customization at a time: run sequentially and wait out locks.
  const call = async (method, path, body, tries = 10) => {
    for (let i = 1; ; i++) {
      const r = await request(method, path, body, { 'MSCRM.SolutionUniqueName': solution });
      if (r.status < 300 || r.status === 404) return r;
      const msg = JSON.stringify(r.json || '').slice(0, 300);
      const busy = r.status === 429 || r.status >= 500 || /customization lock|another|try again|in progress|0x80071151|0x8004ed47|SqlException|timeout/i.test(msg);
      if (!busy || i >= tries) throw new Error(`${method} ${path} -> ${r.status} ${msg}`);
      await new Promise((res) => setTimeout(res, 10000));
    }
  };

  const attr = (c) => {
    const base = { SchemaName: c.logical, DisplayName: L(c.display), Description: L(c.field ? `Portal field: ${c.field}` : c.display), RequiredLevel: req };
    switch (c.kind) {
      case 'text': return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', ...base, MaxLength: c.max || 1000, FormatName: { Value: 'Text' } };
      case 'memo': case 'json': return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', ...base, MaxLength: 1048576, Format: 'TextArea' };
      case 'integer': return { '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', ...base, MinValue: -2147483648, MaxValue: 2147483647, Format: 'None' };
      case 'decimal': return { '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', ...base, Precision: 3, MinValue: -100000000000, MaxValue: 100000000000 };
      case 'boolean': return { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', ...base, DefaultValue: false, OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata', TrueOption: { Value: 1, Label: L('Yes') }, FalseOption: { Value: 0, Label: L('No') }, OptionSetType: 'Boolean' } };
      case 'date': return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } };
      case 'datetime': return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' } };
      case 'choice': return { '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', ...base, OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist', Options: c.options.map((o) => ({ Value: o.value, Label: L(o.label) })) } };
      case 'file': return { '@odata.type': 'Microsoft.Dynamics.CRM.FileAttributeMetadata', ...base, MaxSizeInKB: 131072 };
      default: throw new Error(`unknown kind ${c.kind}`);
    }
  };

  const common = [
    { logical: 'new_portalid', display: 'Portal ID', kind: 'text', max: 100 },
    { logical: 'new_portal_created_on', display: 'Created in portal on', kind: 'datetime' },
    { logical: 'new_portal_created_by', display: 'Created in portal by', kind: 'text', max: 320 },
    { logical: 'new_extra', display: 'Other portal data (JSON)', kind: 'json' },
  ];

  // Batch existence check for all tables in the spec.
  const existing = new Map();
  const ex = await call('GET', "EntityDefinitions?$select=LogicalName,EntitySetName");
  for (const e of ex.json?.value || []) existing.set(e.LogicalName, e.EntitySetName);

  const tables = Object.values(spec);
  const stats = { tables: 0, columns: 0, lookups: 0, skipped: 0, errors: [] };

  // 1) Tables (primary name column included).
  const queue = [...tables];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      if (!existing.has(t.logical)) {
        try {
          await call('POST', 'EntityDefinitions', {
            '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
            SchemaName: t.logical, DisplayName: L(t.display), DisplayCollectionName: L(t.plural),
            Description: L(`KFAS Contributions portal — ${t.entity}`), OwnershipType: 'UserOwned',
            IsActivity: false, HasActivities: false, HasNotes: true,
            Attributes: [{ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: 'new_name', IsPrimaryName: true, RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' }, MaxLength: 400, FormatName: { Value: 'Text' }, DisplayName: L('Name'), Description: L('Reference / name') }],
          });
          stats.tables++;
          log(`table ${t.logical} created`);
        } catch (e) { stats.errors.push(String(e.message || e)); log(`ERROR table ${t.logical}: ${e.message}`); continue; }
      }
      // 2) Columns
      const have = await call('GET', `EntityDefinitions(LogicalName='${t.logical}')/Attributes?$select=LogicalName`);
      const names = new Set((have.json?.value || []).map((a) => a.LogicalName));
      const cols = [...common, ...t.columns.filter((c) => c.kind !== 'lookup'), ...(t.fileColumn ? [{ ...t.fileColumn, kind: 'file' }] : [])];
      for (const c of cols) {
        if (names.has(c.logical)) { stats.skipped++; continue; }
        try {
          await call('POST', `EntityDefinitions(LogicalName='${t.logical}')/Attributes`, attr(c));
          stats.columns++;
        } catch (e) { stats.errors.push(String(e.message || e)); log(`ERROR column ${t.logical}.${c.logical}: ${e.message}`); }
      }
      t._have = names;
      log(`columns ready: ${t.logical}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  // 3) Lookups (after every table exists).
  for (const t of tables) {
    for (const c of t.columns.filter((x) => x.kind === 'lookup')) {
      if (t._have?.has(c.logical)) { stats.skipped++; continue; }
      const target = spec[c.target];
      const schema = `${t.logical}_${c.logical.replace(/^new_/, '')}`.slice(0, 90);
      try {
        await call('POST', 'RelationshipDefinitions', {
          '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
          SchemaName: schema,
          ReferencedEntity: target.logical, ReferencedAttribute: `${target.logical}id`, ReferencingEntity: t.logical,
          CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade', Archive: 'NoCascade', RollupView: 'NoCascade' },
          AssociatedMenuConfiguration: { Behavior: 'UseLabel', Group: 'Details', Label: L(t.plural), Order: 10000 },
          Lookup: { '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata', SchemaName: c.logical, DisplayName: L(c.display), Description: L(`Portal field: ${c.field}`), RequiredLevel: req },
        });
        stats.lookups++;
      } catch (e) { stats.errors.push(String(e.message || e)); log(`ERROR lookup ${t.logical}.${c.logical}: ${e.message}`); }
    }
    log(`lookups ready: ${t.logical}`);
  }

  // 4) Publish
  await call('POST', 'PublishAllXml', {});
  log('published');
  return stats;
}
