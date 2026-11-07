// Dashboards per role, KPI drill-down, generic lists/records, access errors, Arabic/RTL and mobile layout.
import { test, expect } from '@playwright/test';
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

const kpiValue = async (page, id) => Number((await page.getByTestId(id).locator('p').nth(1).textContent()).replace(/[^\d]/g, ''));
const listTotal = async (page) => {
  const sub = page.getByText(/^\d+ applications$/);
  await expect(sub).toBeVisible();
  return Number((await sub.textContent()).match(/\d+/)[0]);
};

for (const who of ['manager', 'officer1', 'accounts', 'admin']) {
  test(`internal dashboard renders for ${who}`, async ({ page }) => {
    const errors = []; watchErrors(page, errors);
    await login(page, who);
    await expect(page.getByTestId('kpi-companies')).toBeVisible();
    await expect(page.getByTestId('kpi-companies').locator('p').nth(1)).toHaveText('6');
    for (const c of ['chart-status', 'chart-collections', 'chart-methods']) await expect(page.getByTestId(c)).toBeVisible();
    await expect(page.getByTestId('chart-status').locator('svg').first()).toBeVisible();
    if (who === 'manager') await expect(page.getByTestId('widget-approvals')).toContainText(/APP-\d{4}-\d{6}/);
    if (who === 'officer1') await expect(page.getByTestId('widget-mine')).toBeVisible();
    if (who === 'accounts') { await expect(page.getByTestId('widget-accounts')).toContainText(/APP-/); await expect(page.getByTestId('widget-payments')).toContainText(/PAY-/); }
    expect(errors).toEqual([]);
  });
}

test('KPI cards drill down to filtered lists with matching counts', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'manager');
  for (const [id, status] of [['kpi-pending-approval', 'pending_manager_approval'], ['kpi-accounts', 'accounts_processing'], ['kpi-completed', 'completed'], ['kpi-under-review', 'under_review']]) {
    await page.goto('/');
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId(id).locator('.animate-pulse')).toHaveCount(0);
    await expect(page.getByTestId(id).locator('p').nth(1)).toHaveText(/\d/);
    const n = await kpiValue(page, id);
    await page.getByTestId(id).click();
    await expect(page).toHaveURL(new RegExp(`/applications\\?status=${status}`));
    expect(await listTotal(page), id).toBe(n);
  }
  await page.goto('/');
  await page.getByTestId('kpi-pending-payments').click();
  await expect(page).toHaveURL(/\/payments\?status=pending/);
  expect(errors).toEqual([]);
});

test('company dashboard for a representative', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'rep1');
  await expect(page.getByTestId('dash-new-application')).toBeVisible();
  await expect(page.getByTestId('kpi-completed').locator('p').nth(1)).toHaveText('1');
  await expect(page.getByTestId('kpi-draft').locator('p').nth(1)).toHaveText('1');
  await expect(page.getByTestId('kpi-companies')).toHaveCount(0);
  await page.getByTestId('kpi-draft').click();
  await expect(page).toHaveURL(/status=draft/);
  expect(await listTotal(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('company registry search by Arabic name and CR, open profile', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.goto('/companies');
  await expect(page.getByTestId('list-row')).toHaveCount(6);
  await page.getByRole('textbox', { name: /search/i }).fill('الواحة');
  await expect(page.getByTestId('list-row')).toHaveCount(1);
  await expect(page.getByTestId('list-row')).toContainText('Al-Waha Real Estate Co.');
  await page.getByRole('textbox', { name: /search/i }).fill('402331');
  await expect(page.getByTestId('list-row')).toHaveCount(1);
  await page.getByTestId('list-row').getByRole('link', { name: 'Bayan Telecom Co.' }).click();
  await expect(page).toHaveURL(/\/records\/Company\/[a-f0-9]+/);
  await expect(page.getByText('شركة بيان للاتصالات').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('financial statements list opens a record with a working download', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.goto('/financial-statements');
  await page.getByTestId('list-row').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/records\/FinancialStatement\/[a-f0-9]+/);
  await expect(page.getByTestId('record-title')).toBeVisible();
  const link = page.locator('a[href^="/api/files/"]').first();
  await expect(link).toBeVisible();
  const res = await page.request.get(await link.getAttribute('href'));
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect(errors).toEqual([]);
});

test('audit logs: manager can read, officer gets a permission message', async ({ page, browser }) => {
  await login(page, 'manager');
  await page.goto('/audit-logs');
  await expect(page.getByTestId('list-row').first()).toBeVisible();
  const officer = await browser.newPage();
  await login(officer, 'officer1');
  await expect(officer.getByRole('navigation', { name: 'Main navigation' }).getByText('Audit Logs')).toHaveCount(0);
  await officer.goto('/audit-logs');
  await expect(officer.getByTestId('list-forbidden')).toContainText('You do not have permission');
  await officer.close();
});

test('inquiry: officer opens from list and responds; company sees the response', async ({ page, browser }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer2');
  await page.goto('/inquiries');
  await page.getByTestId('list-row').filter({ hasText: 'Clearance letter for tender' }).getByRole('link').first().click();
  await expect(page.getByTestId('inquiry-panel')).toBeVisible();
  await page.getByTestId('inquiry-response').fill('Please complete your 2024 application first; then request the clearance letter.');
  await page.getByTestId('inquiry-send').click();
  await expect(page.locator('[data-status="responded"]').first()).toBeVisible();
  const url = page.url();
  expect(errors).toEqual([]);

  const rep = await browser.newPage();
  await login(rep, 'repBayan');
  await rep.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(rep.getByTestId('inquiry-response-text')).toContainText('complete your 2024 application');
  await rep.close();
});

test('unknown route shows 404; invalid record id shows not found', async ({ page }) => {
  await login(page, 'officer1');
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByText('Page Not Found')).toBeVisible();
  await page.goto('/records/Payment/000000000000000000000000');
  await expect(page.getByTestId('record-error')).toContainText('could not be found');
  await page.goto('/inbox/000000000000000000000000');
  await expect(page.getByText('could not be found')).toBeVisible();
});

const RAW_KEY = /\b(nav|rec|admin|dash|rv|reg|role|st)_[a-z]+(_[a-z]+)*\b/;
for (const [path, who] of [['/inbox', 'officer1'], ['/reports', 'manager'], ['/administration', 'admin'], ['/notifications', 'officer1'], ['/', 'manager']]) {
  test(`Arabic RTL renders cleanly on ${path}`, async ({ page }) => {
    const errors = []; watchErrors(page, errors);
    await login(page, who);
    await page.goto(path);
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.waitForTimeout(800);
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(RAW_KEY);
    expect(/[؀-ۿ]/.test(text)).toBeTruthy();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    expect(errors).toEqual([]);
  });
}

test('Arabic thread view', async ({ page }) => {
  await login(page, 'officer1');
  await page.goto('/inbox');
  await page.getByTestId('thread-row').first().click();
  await expect(page.getByTestId('thread-message').first()).toBeVisible();
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('إرسال الرد')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'English' }).click();
});

test('mobile layout: sidebar opens and closes, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'officer1');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByText('Communication Inbox')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(nav.getByText('Communication Inbox')).toBeInViewport();
  await nav.getByText('Communication Inbox').click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(nav.getByText('Communication Inbox')).not.toBeInViewport();
  for (const p of ['/', '/inbox', '/reports', '/notifications']) {
    await page.goto(p);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, p).toBeLessThanOrEqual(1);
  }
});
