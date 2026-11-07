// Builds a single script you can paste into the browser console of a tab signed in to
// https://<org>.crm4.dynamics.com to create the schema with your own Dynamics login.
//   node scripts/dataverse/browser-bundle.mjs > provision.browser.js
// Progress: window.__prov.log, result: window.__prov.stats / window.__prov.error
import fs from 'node:fs';
import { TABLES, SOLUTION } from '../../server/dataverse/schema.js';

const core = fs.readFileSync(new URL('./provision-core.js', import.meta.url), 'utf8').replace(/^export /m, '');
const spec = JSON.stringify(TABLES);
process.stdout.write(`(() => {
${core}
const spec = ${spec};
const request = async (method, path, body, headers = {}) => {
  const r = await fetch('/api/data/v9.2/' + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
window.__prov = { log: [], done: false, started: new Date().toISOString() };
provision({ request, spec, solution: ${JSON.stringify(SOLUTION)}, log: (m) => { window.__prov.log.push(new Date().toISOString().slice(11, 19) + ' ' + m); } })
  .then((s) => { window.__prov.stats = s; window.__prov.done = true; })
  .catch((e) => { window.__prov.error = String(e && e.message || e); window.__prov.done = true; });
return 'started';
})();
`);
