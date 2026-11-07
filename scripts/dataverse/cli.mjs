// Dynamics (Dataverse) maintenance commands. Reads the DATAVERSE_* settings from .env.
//   npm run dataverse:check      — sign in and list the portal tables found in Dynamics
//   npm run dataverse:provision  — create/update all tables & columns in the Contribution solution
//   npm run dataverse:push-all   — queue every local record for Dynamics (first load), then send
//   npm run dataverse:import     — rebuild an EMPTY portal database from Dynamics
import '../../server/env.js';

const cmd = process.argv[2];
const { enabled, request, whoAmI, ok } = await import('../../server/dataverse/client.js');
if (!enabled()) {
  console.error('Set DATAVERSE_URL, DATAVERSE_TENANT_ID, DATAVERSE_CLIENT_ID and DATAVERSE_CLIENT_SECRET in .env first.');
  process.exit(1);
}
const { TABLES, SOLUTION } = await import('../../server/dataverse/schema.js');

if (cmd === 'check') {
  const me = await whoAmI();
  console.log('Signed in as application user', me.UserId);
  const j = await ok('GET', "EntityDefinitions?$select=LogicalName,EntitySetName");
  const have = new Set(j.value.map((e) => e.LogicalName));
  for (const t of Object.values(TABLES)) console.log(have.has(t.logical) ? 'ok     ' : 'MISSING', t.logical);
} else if (cmd === 'provision') {
  const { provision } = await import('./provision-core.js');
  const stats = await provision({ request, spec: TABLES, solution: SOLUTION });
  console.log(stats);
} else if (cmd === 'push-all') {
  const { enqueueAll, pushPending } = await import('../../server/dataverse/sync.js');
  console.log('queued', enqueueAll());
  let r; let total = 0;
  do { r = await pushPending(200); total += r.done; process.stdout.write(`\rsent ${total}`); } while (r.tried > 0 && r.done > 0);
  const { status } = await import('../../server/dataverse/sync.js');
  const s = status();
  console.log(`\npending ${s.pending}`, s.failing.length ? s.failing.slice(0, 5) : '');
} else if (cmd === 'import') {
  const { db } = await import('../../server/db.js');
  const count = db.prepare('SELECT COUNT(*) n FROM docs').get().n;
  if (count && !process.argv.includes('--force')) {
    console.error(`The local database already has ${count} records. Use --force to merge Dynamics data into it.`);
    process.exit(1);
  }
  const { importAll } = await import('../../server/dataverse/sync.js');
  console.log(await importAll());
  console.log('Imported. Users must use "Forgot password" to set a password on this server (passwords are never stored in Dynamics).');
} else {
  console.log('Usage: node scripts/dataverse/cli.mjs check|provision|push-all|import');
}
process.exit(0);
