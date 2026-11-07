// Client for the local portal API (server/). Keeps the same surface the app
// used with the Base44 SDK: base44.entities.X.filter/get/create/..., base44.auth.*,
// base44.integrations.Core.UploadPrivateFile and base44.functions.invoke.
const TOKEN_KEY = 'portal_access_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, url, body, { raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload, credentials: 'include' });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || 'Request failed');
  return data;
}

const qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');

function entityApi(name) {
  const base = `/api/entities/${name}`;
  return {
    filter: (query = {}, opts = {}) => request('GET', `${base}?${qs({ q: query, sort: opts.sort, limit: opts.limit, cursor: opts.cursor, skip: opts.skip })}`),
    list: (opts = {}) => request('GET', `${base}?${qs({ sort: opts.sort, limit: opts.limit, distinct: opts.distinct })}`),
    get: (id) => request('GET', `${base}/${id}`),
    count: async (query = {}) => (await request('GET', `${base}/count?${qs({ q: query })}`)).count,
    aggregate: (opts) => request('POST', `${base}/aggregate`, opts),
    create: (data) => request('POST', base, data),
    bulkCreate: (rows) => request('POST', `${base}/bulk`, rows),
    update: (id, data) => request('PATCH', `${base}/${id}`, data),
    delete: (id) => request('DELETE', `${base}/${id}`),
  };
}

const entities = new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? entityApi(name) : undefined) });

const auth = {
  me: () => request('GET', '/api/auth/me'),
  updateMe: (data) => request('PUT', '/api/auth/me', data),
  async loginViaEmailPassword(email, password) {
    const r = await request('POST', '/api/auth/login', { email, password });
    setToken(r.access_token);
    return r;
  },
  register: (data) => request('POST', '/api/auth/register', data),
  verifyOtp: ({ email, otpCode }) => request('POST', '/api/auth/verify-otp', { email, otpCode }),
  resendOtp: (email) => request('POST', '/api/auth/resend-otp', { email }),
  setToken,
  async logout(redirect) {
    try { await request('POST', '/api/auth/logout'); } catch { /* ignore */ }
    setToken(null);
    if (redirect !== undefined) window.location.href = '/login';
  },
  redirectToLogin: () => { window.location.href = '/login'; },
  resetPasswordRequest: (email) => request('POST', '/api/auth/reset-request', { email }),
  resetPassword: ({ resetToken, newPassword }) => request('POST', '/api/auth/reset', { token: resetToken, password: newPassword }),
  isAuthenticated: () => !!getToken(),
};

async function uploadFile({ file, company_id }) {
  const fd = new FormData();
  fd.append('file', file);
  if (company_id) fd.append('company_id', company_id);
  return request('POST', '/api/files', fd);
}

export const base44 = {
  entities,
  auth,
  integrations: { Core: { UploadPrivateFile: uploadFile, UploadFile: uploadFile } },
  functions: { invoke: (name, params = {}) => request('POST', `/api/functions/${name}`, params) },
  api: { get: (url) => request('GET', url), post: (url, body) => request('POST', url, body), raw: (method, url) => request(method, url, undefined, { raw: true }) },
};

// Downloads an authenticated file/report and saves it with the given name.
export async function downloadAuthed(url, filename) {
  const res = await request('GET', url, undefined, { raw: true });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message || 'Download failed');
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
