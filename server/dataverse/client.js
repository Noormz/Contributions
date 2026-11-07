// Minimal Dataverse Web API client using the app registration (client credentials).
// Configure in .env:
//   DATAVERSE_URL=https://amek-contributes.crm4.dynamics.com
//   DATAVERSE_TENANT_ID=<directory (tenant) id>
//   DATAVERSE_CLIENT_ID=<application (client) id>
//   DATAVERSE_CLIENT_SECRET=<client secret>
// The app registration must be added in Power Platform admin center as an
// Application User with a security role that can read/write the new_ tables.

export const config = () => ({
  url: (process.env.DATAVERSE_URL || '').replace(/\/+$/, ''),
  tenant: process.env.DATAVERSE_TENANT_ID || '',
  clientId: process.env.DATAVERSE_CLIENT_ID || '',
  secret: process.env.DATAVERSE_CLIENT_SECRET || '',
});

export const enabled = () => {
  const c = config();
  return !!(c.url && c.tenant && c.clientId && c.secret) && process.env.DATAVERSE_SYNC !== 'off';
};

let token = null;
let tokenExpires = 0;

async function getToken() {
  if (token && Date.now() < tokenExpires - 60_000) return token;
  const c = config();
  const authority = (process.env.DATAVERSE_AUTHORITY || 'https://login.microsoftonline.com').replace(/\/+$/, '');
  const r = await fetch(`${authority}/${c.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.secret, scope: `${c.url}/.default` }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Dataverse sign-in failed: ${j.error_description || j.error || r.status}`);
  token = j.access_token;
  tokenExpires = Date.now() + (j.expires_in || 3600) * 1000;
  return token;
}

// Low-level request. `path` is relative to /api/data/v9.2/ (or an absolute URL for nextLink).
// Returns { status, json, headers }. Retries throttling (429) and transient 5xx.
export async function request(method, path, body, headers = {}, { raw = false } = {}) {
  const c = config();
  const url = /^https?:/.test(path) ? path : `${c.url}/api/data/v9.2/${path}`;
  for (let attempt = 1; ; attempt++) {
    const t = await getToken();
    const isBuffer = body instanceof Uint8Array;
    const r = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${t}`, Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
        ...(body !== undefined && !isBuffer ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isBuffer ? body : JSON.stringify(body),
    });
    if ((r.status === 429 || r.status >= 502) && attempt < 5) {
      const wait = Number(r.headers.get('retry-after')) * 1000 || 1500 * attempt;
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    if (r.status === 401 && attempt === 1) { token = null; continue; }
    if (raw) return { status: r.status, body: r.ok ? Buffer.from(await r.arrayBuffer()) : null, headers: r.headers };
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { message: text }; }
    return { status: r.status, json, headers: r.headers };
  }
}

export class DataverseError extends Error {
  constructor(status, json, what) {
    super(`${what}: ${status} ${json?.error?.message || json?.message || ''}`.trim());
    this.status = status; this.json = json;
  }
}

export async function ok(method, path, body, headers) {
  const r = await request(method, path, body, headers);
  if (r.status >= 300) throw new DataverseError(r.status, r.json, `${method} ${path.split('?')[0]}`);
  return r.json;
}

// All pages of a query.
export async function getAll(path, maxPages = 200) {
  const out = [];
  let next = path;
  for (let i = 0; next && i < maxPages; i++) {
    const j = await ok('GET', next, undefined, { Prefer: 'odata.maxpagesize=5000,odata.include-annotations="*"' });
    out.push(...(j?.value || []));
    next = j?.['@odata.nextLink'];
  }
  return out;
}

let who = null;
export async function whoAmI() {
  if (!who) who = await ok('GET', 'WhoAmI');
  return who;
}
