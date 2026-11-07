// Runs each e2e spec group against its own freshly seeded stack, in parallel.
// Groups mutate shared demo data, so they must not share a database.
//   npm run test:e2e            (all groups)
//   npm run test:e2e -- company (one group)
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const GROUPS = {
  company: { files: ['tests/e2e/company-'], api: 3401, web: 5401 },
  internal: { files: ['tests/e2e/internal-'], api: 3402, web: 5402 },
  comms: { files: ['tests/e2e/comms-', 'tests/e2e/admin-'], api: 3403, web: 5403 },
};
const only = process.argv.slice(2);
const selected = Object.entries(GROUPS).filter(([k]) => !only.length || only.includes(k));

const run = ([name, g]) => new Promise((resolve) => {
  const env = { ...process.env, AI_PROVIDER: 'local', E2E_API_PORT: String(g.api), E2E_WEB_PORT: String(g.web), E2E_DATA_DIR: `data-e2e-${name}`, E2E_OUT: `test-results/${name}` };
  const child = spawn('npx', ['playwright', 'test', ...g.files], { env, shell: true });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    fs.rmSync(`data-e2e-${name}`, { recursive: true, force: true });
    resolve({ name, code, out });
  });
});

const results = await Promise.all(selected.map(run));
let failed = false;
for (const r of results) {
  const summary = r.out.split('\n').filter((l) => /^\s+\d+ (passed|failed|flaky|did not run|skipped)/.test(l)).map((l) => l.trim()).join(', ');
  console.log(`\n=== ${r.name}: ${summary || `exit ${r.code}`}`);
  if (r.code !== 0) { failed = true; console.log(r.out.split('\n').slice(-80).join('\n')); }
}
process.exit(failed ? 1 : 0);
