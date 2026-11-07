// FR-14 notifications (bell + page) and FR-19 reports (filters, anonymise, Excel/PDF incl. encrypted PDF).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { login } from './helpers.js';

function watchErrors(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource: the server responded with a status of (401|403|404)/.test(t)) return;
    errors.push(`console: ${t}`);
  });
}

test('notification bell: unread count, open marks read and navigates to the record, mark all read', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'manager'); // seed leaves approval requests for the manager
  const count = page.getByTestId('notification-count');
  await expect(count).toBeVisible();
  const n0 = Number(await count.textContent());
  expect(n0).toBeGreaterThan(0);
  await page.getByTestId('notification-bell').click();
  const unreadItem = page.locator('[data-testid="notification-item"][data-read="0"]').filter({ hasText: /APP-|CALC-/ }).first();
  const title = (await unreadItem.textContent()).trim();
  const ref = title.match(/(APP|CALC)-\d{4}-\d{6}/)[0];
  await unreadItem.click();
  await expect(page).toHaveURL(/\/records\/ContributionApplication\/[a-f0-9]+|\/applications\/[a-f0-9]+/);
  if (ref.startsWith('APP')) await expect(page.getByText(ref).first()).toBeVisible();
  await expect(count).toHaveText(String(n0 - 1));
  await page.getByTestId('notification-bell').click();
  await page.getByTestId('mark-all-read').click();
  await expect(page.getByTestId('notification-count')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('notifications page: unread/category filters, mark read toggles', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.goto('/notifications');
  await expect(page.getByTestId('notification-row').first()).toBeVisible();
  const total = await page.getByTestId('notification-row').count();
  await page.getByTestId('notifications-category').click();
  await page.getByRole('option', { name: 'Assignment' }).click();
  await expect(page.getByTestId('notification-row').first()).toContainText('Assignment');
  const assignment = await page.getByTestId('notification-row').count();
  expect(assignment).toBeLessThanOrEqual(total);
  await page.getByTestId('notifications-category').click();
  await page.getByRole('option', { name: 'All categories' }).click();
  await page.getByTestId('notifications-mark-all').click();
  await page.getByTestId('notifications-show').click();
  await page.getByRole('option', { name: 'Unread' }).click();
  await expect(page.getByTestId('notification-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('every report runs and renders a table', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'manager');
  await page.goto('/reports');
  const names = ['contributions', 'pending_contributions', 'payments_by_method', 'payments', 'gateway_transactions', 'receipts_clearances', 'officer_workload', 'dues_aging', 'applications', 'email_activity'];
  for (const n of names) {
    const resp = page.waitForResponse((r) => r.url().includes(`/api/reports/${n}`) && r.status() === 200);
    await page.getByTestId(`report-${n}`).click();
    await resp;
    await expect(page.getByTestId('report-table')).toBeVisible();
    await expect(page.getByTestId('report-title')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

const rowsOf = (page) => page.getByTestId('report-table').locator('tbody tr');

test('report filters: financial year, company, officer, date range, anonymise', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'manager');
  await page.goto('/reports');
  await expect(page.getByTestId('report-table')).toBeVisible();
  const resp = page.waitForResponse((r) => r.url().includes('/api/reports/applications'));
  await page.getByTestId('report-applications').click();
  await resp;
  await expect(page.getByTestId('report-title')).toHaveText('Applications by Status');
  const all = await rowsOf(page).count();
  await page.getByTestId('report-year').fill('2023');
  await page.getByTestId('report-run').click();
  await expect(async () => {
    const n = await rowsOf(page).count();
    expect(n).toBeLessThan(all);
    const years = await page.getByTestId('report-table').locator('tbody tr td:nth-child(3)').allTextContents();
    expect(years.every((y) => y === '2023')).toBeTruthy();
  }).toPass();
  await page.getByTestId('report-year').fill('');

  // company filter on contributions
  await page.getByTestId('report-contributions').click();
  await expect(page.getByTestId('report-title')).toHaveText('Contributions Summary by Company and Year');
  await page.getByTestId('report-company').click();
  await page.getByRole('option', { name: 'Gulf Horizon Investment Co.' }).click();
  await page.getByTestId('report-run').click();
  await expect(async () => {
    const cos = await page.getByTestId('report-table').locator('tbody tr td:nth-child(1)').allTextContents();
    expect(cos.length).toBeGreaterThan(0);
    expect(cos.every((c) => c === 'Gulf Horizon Investment Co.')).toBeTruthy();
  }).toPass();

  // anonymise
  await page.getByTestId('report-company').click();
  await page.getByRole('option', { name: 'All companies' }).click();
  await page.getByTestId('report-anonymize').click();
  await page.getByTestId('report-run').click();
  await expect(async () => {
    const cos = await page.getByTestId('report-table').locator('tbody tr td:nth-child(1)').allTextContents();
    expect(cos.length).toBeGreaterThan(0);
    expect(cos.every((c) => /^Company C-\d{4}$/.test(c))).toBeTruthy();
  }).toPass();
  await page.getByTestId('report-anonymize').click();

  // officer filter on workload
  await page.getByTestId('report-officer_workload').click();
  await expect(page.getByTestId('report-title')).toHaveText('Officer Workload and Workflow Status');
  await expect(rowsOf(page)).toHaveCount(3);
  await page.getByTestId('report-officer').click();
  await page.getByRole('option', { name: 'Khaled Al-Mutairi' }).click();
  await page.getByTestId('report-run').click();
  await expect(rowsOf(page)).toHaveCount(1);
  await expect(rowsOf(page).first()).toContainText('Khaled Al-Mutairi');

  // date range in the future → no payments
  await page.getByTestId('report-officer').click();
  await page.getByRole('option', { name: 'All officers' }).click();
  await page.getByTestId('report-payments').click();
  await expect(page.getByTestId('report-title')).toHaveText('Payments Register');
  await expect(rowsOf(page).first()).toBeVisible();
  await page.getByTestId('report-from').fill('2099-01-01');
  await page.getByTestId('report-run').click();
  await expect(page.getByText('No records for the selected filters.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Excel, PDF and password-protected PDF exports download', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'manager');
  await page.goto('/reports');
  await page.getByTestId('report-payments_by_method').click();
  await expect(page.getByTestId('report-table')).toBeVisible();

  const grab = async (testId) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
  };
  const xlsx = await grab('report-xlsx');
  expect(xlsx.name).toBe('payments_by_method.xlsx');
  expect(xlsx.buf.subarray(0, 2).toString()).toBe('PK');
  const pdf = await grab('report-pdf');
  expect(pdf.buf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.buf.toString('latin1')).not.toContain('/Encrypt');
  await page.getByTestId('report-pdf-password').fill('Secret#1');
  const enc = await grab('report-pdf');
  expect(enc.buf.toString('latin1')).toContain('/Encrypt');
  expect(errors).toEqual([]);
});

test('company representatives cannot see or open reports', async ({ page }) => {
  await login(page, 'rep1');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByText('Reports')).toHaveCount(0);
  await page.goto('/reports');
  await expect(page.getByText('You do not have permission to view reports.')).toBeVisible();
  const r = await page.request.get('/api/reports/payments', { headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('portal_access_token'))}` } });
  expect(r.status()).toBe(403);
});
