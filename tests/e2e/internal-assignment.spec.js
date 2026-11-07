// FR-16: officer workload, application filters, bulk/single/auto assignment, access restrictions.
import { test, expect, findApp, getEntity, fn, pick, listEntity } from './internal-fixtures.js';
import { login, api } from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('officer workload cards match the API and click through to filtered applications', async ({ page }) => {
  await login(page, 'manager');
  const { body: loads } = await fn(page, 'officerWorkload');
  await page.goto('/officer-workload');
  const cards = page.getByTestId('officer-card');
  await expect(cards).toHaveCount(loads.length);
  for (const l of loads) {
    const card = cards.filter({ hasText: l.officer_name });
    await expect(card).toContainText(String(l.open));
    await expect(card).toContainText(`/ ${l.total}`);
  }
  const busiest = [...loads].sort((a, b) => b.total - a.total)[0];
  await cards.filter({ hasText: busiest.officer_name }).click();
  await expect(page).toHaveURL(new RegExp(`/applications\\?officer=${busiest.officer_id}`));
  await expect(page.getByTestId('application-row')).toHaveCount(busiest.total);
  for (const row of await page.getByTestId('application-row').all()) await expect(row).toContainText(busiest.officer_name);
});

test('applications status filter updates the URL and the rows', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/applications');
  await pick(page, 'filter-status', /under review/i);
  await expect(page).toHaveURL(/status=under_review/);
  const expected = await listEntity(page, 'ContributionApplication', { status: 'under_review' });
  await expect(page.getByTestId('application-row')).toHaveCount(expected.length);
  for (const a of expected) await expect(page.getByTestId('applications-list')).toContainText(a.application_reference);
});

test('manager bulk-assigns two applications to an officer', async ({ page }) => {
  await login(page, 'manager');
  const bayan = await findApp(page, 'Bayan', '2024');
  const sahel = await findApp(page, 'Sahel', '2024');
  const { body: officers } = await fn(page, 'listOfficers');
  const target = officers.find((o) => o.email === 'officer2@portal.local');
  await page.goto('/applications');
  await page.getByRole('checkbox', { name: bayan.application_reference }).click();
  await page.getByRole('checkbox', { name: sahel.application_reference }).click();
  await page.getByTestId('bulk-assign').click();
  await pick(page, 'bulk-assign-officer', target.full_name);
  await page.getByTestId('bulk-assign-confirm').click();
  await expect(page.getByText(/2 application\(s\) assigned/)).toBeVisible();
  expect((await getEntity(page, 'ContributionApplication', bayan.id)).assigned_officer_id).toBe(target.id);
  expect((await getEntity(page, 'ContributionApplication', sahel.id)).assigned_officer_id).toBe(target.id);
});

test('manager reassigns from the application detail page with a reason; history recorded', async ({ page }) => {
  await login(page, 'manager');
  const bayan = await findApp(page, 'Bayan', '2024');
  const { body: officers } = await fn(page, 'listOfficers');
  const target = officers.find((o) => o.email === 'officer3@portal.local');
  await page.goto(`/applications/${bayan.id}`);
  await page.getByTestId('action-assign').click();
  await pick(page, 'assign-officer', target.full_name);
  await page.getByTestId('assign-reason').fill('Workload balancing');
  await page.getByTestId('assign-confirm').click();
  await expect(page.getByTestId('action-success')).toBeVisible();
  expect((await getEntity(page, 'ContributionApplication', bayan.id)).assigned_officer_id).toBe(target.id);
  await page.getByTestId('tab-assignments').click();
  await expect(page.getByTestId('assignment-history')).toContainText('Workload balancing');
});

test('auto-assignment toggle (admin) and manual auto-assign of an unassigned application', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/officer-workload');
  const toggle = page.getByTestId('auto-assign-toggle');
  await expect(toggle).toHaveAttribute('data-state', 'checked');
  await toggle.click();
  await expect(page.getByText('Automatic assignment disabled.')).toBeVisible();

  // Desert Pearl submits with auto-assignment off → stays unassigned.
  const rep = await page.request.post('/api/auth/login', { data: { email: 'rep@desertpearl.example', password: 'Portal#2026' } });
  const repToken = (await rep.json()).access_token;
  const call = async (method, url, data) => {
    const r = await page.request.fetch(url, { method, data, headers: { Authorization: `Bearer ${repToken}` } });
    return r.json();
  };
  const app = await call('POST', '/api/entities/ContributionApplication', { financial_year: '2024', payment_methods: ['payment_gateway'], payment_method: 'payment_gateway', profile_confirmed: true, acknowledgements: { accuracy: true, terms: true } });
  const up = await page.request.post('/api/files', { multipart: { file: { name: 'fs.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') } }, headers: { Authorization: `Bearer ${repToken}` } });
  const fileUrl = (await up.json()).file_url;
  await call('POST', '/api/entities/FinancialStatement', { application_id: app.id, financial_year: '2024', statement_end_date: '2024-12-31', document_name: 'FS 2024', file_url: fileUrl });
  const submitted = await call('POST', '/api/functions/submitApplication', { application_id: app.id });
  expect(submitted.status).toBe('submitted');
  expect(submitted.assigned_officer_id || '').toBe('');

  await page.goto('/officer-workload');
  await page.getByTestId('auto-assign-toggle').click();
  await expect(page.getByText('Automatic assignment enabled.')).toBeVisible();

  await login(page, 'manager');
  await page.goto(`/applications/${app.id}`);
  await page.getByTestId('action-auto-assign').click();
  await expect(page.getByTestId('action-success')).toBeVisible();
  const after = await getEntity(page, 'ContributionApplication', app.id);
  expect(after.assigned_officer_id).toBeTruthy();
  expect(after.status).toBe('assigned');
});

test('restricted pages: officer cannot use Administration, rep cannot use Approvals', async ({ page }) => {
  await login(page, 'officer1');
  await page.goto('/administration');
  await expect(page.getByText('You need system administrator access to view this page.')).toBeVisible();
  const r = await api(page, 'POST', '/api/functions/updateUser', { user_id: 'x', role: 'system_admin' });
  expect(r.status).toBe(403);
  await login(page, 'rep1');
  await page.goto('/approvals');
  await expect(page.getByText('You do not have permission to access this page.')).toBeVisible();
});
