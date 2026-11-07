// A small in-memory stand-in for the Dataverse Web API + Entra token endpoint, used by
// tests/api/dataverse.test.mjs. Supports what server/dataverse/* uses.
import http from 'node:http';
import crypto from 'node:crypto';
import { TABLES } from '../../server/dataverse/schema.js';

export const APP_USER = '11111111-1111-1111-1111-111111111111';
export const STAFF_USER = '22222222-2222-2222-2222-222222222222';

export function startMock(port) {
  const sets = new Map(); // entitySet -> Map(guid -> row)
  const files = new Map(); // `${set}/${guid}` -> Buffer
  const logicalBySet = Object.fromEntries(Object.values(TABLES).map((t) => [t.entitySet, t.logical]));
  const users = { [APP_USER]: { internalemailaddress: 'app@dynamics' }, [STAFF_USER]: { internalemailaddress: 'manager@portal.local' } };
  const table = (s) => { if (!sets.has(s)) sets.set(s, new Map()); return sets.get(s); };
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const err = (res, status, message) => send(res, status, { error: { code: '0x0', message } });

  function applyBody(set, guid, body, actor) {
    const rows = table(set);
    const logical = logicalBySet[set];
    const row = rows.get(guid) || { [`${logical}id`]: guid, createdon: new Date().toISOString(), _createdby_value: actor, statecode: 0 };
    for (const [k, v] of Object.entries(body)) {
      if (k.endsWith('@odata.bind')) {
        const m = /^\/([^(]+)\(([^)]+)\)$/.exec(v);
        if (!m || !table(m[1]).has(m[2])) return `Entity '${logicalBySet[m?.[1]]}' With Id = ${m?.[2]} Does Not Exist`;
        row[`_${k.replace('@odata.bind', '')}_value`] = m[2];
      } else row[k] = v;
    }
    row.modifiedon = new Date().toISOString();
    row._modifiedby_value = actor;
    row['@odata.etag'] = `W/"${crypto.randomBytes(4).toString('hex')}"`;
    rows.set(guid, row);
    return null;
  }

  function filterRows(rows, filter) {
    if (!filter) return rows;
    const one = (r, cond) => {
      const [f, op, ...rest] = cond.trim().split(' ');
      const raw = rest.join(' ');
      const v = raw === 'null' ? null : /^-?\d+$/.test(raw) ? Number(raw) : raw.replace(/^'|'$/g, '');
      const val = r[f] === undefined ? null : r[f];
      if (op === 'eq') return val === v;
      if (op === 'ne') return val !== v;
      if (op === 'gt') return String(val) > String(v);
      return true;
    };
    return rows.filter((r) => filter.split(' and ').every((part) => part.split(' or ').some((c) => one(r, c))));
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname.endsWith('/oauth2/v2.0/token')) return send(res, 200, { access_token: 'test-token', expires_in: 3600 });
      if (!/^\/api\/data\/v9\.2\//.test(url.pathname)) return err(res, 404, 'not found');
      if (req.headers.authorization !== 'Bearer test-token') return err(res, 401, 'unauthorized');
      const p = decodeURIComponent(url.pathname.replace('/api/data/v9.2/', ''));
      // test control: act as a staff member
      const actor = req.headers['x-test-actor'] || APP_USER;
      if (p === 'WhoAmI') return send(res, 200, { UserId: APP_USER });
      if (p === 'EntityDefinitions') return send(res, 200, { value: Object.values(TABLES).map((t) => ({ LogicalName: t.logical, EntitySetName: t.entitySet })) });
      let m = /^([a-z_]+)\(([0-9a-f-]+)\)\/new_content(\/\$value)?$/.exec(p);
      if (m) {
        const key = `${m[1]}/${m[2]}`;
        if (req.method === 'PATCH') { files.set(key, buf); return send(res, 204); }
        if (!files.has(key)) return err(res, 404, 'no file');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(files.get(key));
      }
      m = /^([a-z_]+)\(([0-9a-f-]+)\)$/.exec(p);
      if (m) {
        const [, set, guid] = m;
        const rows = table(set);
        if (req.method === 'GET') return rows.has(guid) ? send(res, 200, rows.get(guid)) : err(res, 404, `${set} With Id = ${guid} Does Not Exist`);
        if (req.method === 'DELETE') { if (!rows.has(guid)) return err(res, 404, 'Does Not Exist'); rows.delete(guid); return send(res, 204); }
        if (req.method === 'PATCH') {
          const problem = applyBody(set, guid, JSON.parse(buf.toString() || '{}'), actor);
          return problem ? err(res, 404, problem) : send(res, 204); // real Dataverse answers 404 for a missing lookup target
        }
      }
      m = /^([a-z_]+)$/.exec(p);
      if (m && req.method === 'GET') {
        let rows = filterRows([...table(m[1]).values()], url.searchParams.get('$filter'));
        if (url.searchParams.get('$orderby')?.startsWith('modifiedon')) rows.sort((a, b) => a.modifiedon.localeCompare(b.modifiedon));
        if ((url.searchParams.get('$expand') || '').startsWith('createdby')) rows = rows.map((r) => ({ ...r, createdby: users[r._createdby_value] || {} }));
        return send(res, 200, { value: rows });
      }
      if (m && req.method === 'POST') { // create with server-generated id (staff creating a row)
        const guid = crypto.randomUUID();
        applyBody(m[1], guid, JSON.parse(buf.toString() || '{}'), actor);
        res.writeHead(204, { 'OData-EntityId': `${m[1]}(${guid})` }); return res.end();
      }
      return err(res, 400, `unsupported ${req.method} ${p}`);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, sets, files, table })));
}
