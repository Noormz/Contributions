// Administration: users & roles, lookups, settings, email templates, FAQ, reminders.
import { test, expect } from '@playwright/test';
import { login, PASSWORD } from './helpers.js';

function watchErrors(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource: the server responded with a status of (401|403|404)/.test(t)) return;
    errors.push(`console: ${t}`);
  });
}

const stamp = Date.now();
const loginApi = (page, email, password) => page.request.post('/api/auth/login', { data: { email, password } });

test('users: list, create internal user, change role, deactivate blocks login', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'admin');
  await page.goto('/administration');
  await expect(page.getByTestId('user-row').first()).toBeVisible();
  expect(await page.getByTestId('user-row').count()).toBeGreaterThanOrEqual(13);

  const email = `analyst${stamp}@portal.local`;
  await page.getByTestId('users-create').click();
  await page.getByTestId('user-email').fill(email);
  await page.getByTestId('user-name').fill('QA Analyst');
  await page.getByTestId('user-role').click();
  await page.getByRole('option', { name: 'Contributions Officer' }).click();
  await page.getByTestId('user-password').fill('Analyst#2026');
  await page.getByTestId('user-save').click();
  await expect(page.getByRole('status')).toContainText(`User ${email} created.`);
  expect((await loginApi(page, email, 'Analyst#2026')).ok()).toBeTruthy();

  await page.getByTestId('users-search').fill(email);
  const row = page.getByTestId('user-row').filter({ hasText: email });
  await expect(row).toContainText('Contributions Officer');
  await row.getByTestId('user-edit').click();
  await page.getByTestId('user-role').click();
  await page.getByRole('option', { name: 'Accounts Unit' }).click();
  await page.getByTestId('user-save').click();
  await expect(row).toContainText('Accounts Unit');

  await row.getByTestId('user-edit').click();
  await page.getByTestId('user-active').click();
  await page.getByTestId('user-save').click();
  await expect(page.getByRole('status')).toContainText('User updated.');
  const refused = await loginApi(page, email, 'Analyst#2026');
  expect(refused.status()).toBe(403);
  expect((await refused.json()).message).toMatch(/deactivated/i);
  expect(errors).toEqual([]);
});

test('users: link a new company representative to a company', async ({ page, browser }) => {
  await login(page, 'admin');
  await page.goto('/administration');
  const email = `rep${stamp}@desertpearl.example`;
  await page.getByTestId('users-create').click();
  await page.getByTestId('user-email').fill(email);
  await page.getByTestId('user-name').fill('Second Desert Rep');
  await page.getByTestId('user-role').click();
  await page.getByRole('option', { name: 'Company Representative' }).click();
  await page.getByTestId('user-password').fill('Desert#2026');
  await page.getByTestId('user-save').click();
  await expect(page.getByRole('alert')).toContainText('must be linked to a company');
  await page.getByTestId('user-company').click();
  await page.getByRole('option', { name: 'Desert Pearl Services W.L.L.' }).click();
  await page.getByTestId('user-save').click();
  await expect(page.getByRole('status')).toContainText('created');

  const rep = await browser.newPage();
  const res = await loginApi(rep, email, 'Desert#2026');
  const { access_token } = await res.json();
  await rep.goto('/login');
  await rep.evaluate((t) => localStorage.setItem('portal_access_token', t), access_token);
  await rep.goto('/company-profile');
  await expect(rep.getByText('Desert Pearl Services W.L.L.').first()).toBeVisible();
  await rep.close();
});

test('lookups: add, edit, delete with in-app confirmation', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'admin');
  await page.goto('/administration');
  await page.getByRole('tab', { name: 'System Lookups' }).click();
  await expect(page.getByTestId('lookup-row').first()).toBeVisible();
  const value = `QA Sector ${stamp}`;
  await page.getByTestId('lookup-add').click();
  await page.getByTestId('lookup-category').fill('business_sector');
  await page.getByTestId('lookup-code').fill(`qa_${stamp}`);
  await page.getByTestId('lookup-value-en').fill(value);
  await page.getByTestId('lookup-value-ar').fill('قطاع اختبار');
  await page.getByTestId('lookup-save').click();
  const row = page.getByTestId('lookup-row').filter({ hasText: value });
  await expect(row).toBeVisible();
  await row.getByTestId('lookup-edit').click();
  await page.getByTestId('lookup-value-en').fill(`${value} (edited)`);
  await page.getByTestId('lookup-save').click();
  const edited = page.getByTestId('lookup-row').filter({ hasText: `${value} (edited)` });
  await expect(edited).toBeVisible();
  // the public registration lookup endpoint sees it
  const pub = await (await page.request.get('/api/public/lookups?category=business_sector')).json();
  expect(pub.some((l) => l.value_en === `${value} (edited)`)).toBeTruthy();
  await edited.getByTestId('lookup-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('lookup-row').filter({ hasText: value })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings: edit a value inline (audited)', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'admin');
  await page.goto('/administration');
  await page.getByRole('tab', { name: 'Application Settings' }).click();
  const row = page.locator('[data-testid="setting-row"][data-key="pending_review_reminder_days"]');
  await row.getByTestId('setting-value').click();
  await row.getByTestId('setting-value-input').fill('5');
  await row.getByTestId('setting-value-save').click();
  await expect(row.getByTestId('setting-value')).toHaveText('5');
  await page.reload();
  await page.getByRole('tab', { name: 'Application Settings' }).click();
  await expect(page.locator('[data-testid="setting-row"][data-key="pending_review_reminder_days"]').getByTestId('setting-value')).toHaveText('5');
  await page.goto('/audit-logs');
  await expect(page.getByText('SystemSettings').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('email templates: create and edit; offered in the composer', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'admin');
  await page.goto('/administration');
  await page.getByTestId('tab-templates').click();
  await page.getByTestId('templates-add').click();
  await page.getByTestId('templates-field-template_key').fill(`qa_request_${stamp}`);
  await page.getByTestId('templates-field-template_name').fill(`QA document request ${stamp}`);
  await page.getByTestId('templates-field-subject_en').fill('Document request for {{company}}');
  await page.getByTestId('templates-field-body_en').fill('Dear {{name}},\n\nPlease send the missing documents for {{company}}.');
  await page.getByTestId('templates-save').click();
  const row = page.getByTestId('templates-row').filter({ hasText: `QA document request ${stamp}` });
  await expect(row).toBeVisible();
  await row.getByTestId('templates-edit').click();
  await expect(page.getByTestId('templates-field-template_key')).toBeDisabled();
  await page.getByTestId('templates-field-template_name').fill(`QA document request ${stamp} v2`);
  await page.getByTestId('templates-save').click();
  await expect(page.getByTestId('templates-row').filter({ hasText: `QA document request ${stamp} v2` })).toBeVisible();

  await page.goto('/inbox');
  await page.getByTestId('inbox-compose').click();
  await page.getByTestId('compose-company').click();
  await page.getByRole('option', { name: 'Sahel Insurance Co.' }).click();
  await page.getByRole('dialog').getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: `QA document request ${stamp} v2` }).click();
  await expect(page.getByTestId('compose-subject')).toHaveValue('Document request for Sahel Insurance Co.');
  expect(errors).toEqual([]);
});

test('FAQ: entry created by admin appears on the company Help page', async ({ page, browser }) => {
  await login(page, 'admin');
  await page.goto('/administration');
  await page.getByTestId('tab-faq').click();
  const q = `How do I update my COFS number ${stamp}?`;
  await page.getByTestId('faq-add').click();
  await page.getByTestId('faq-field-question_en').fill(q);
  await page.getByTestId('faq-field-question_ar').fill('كيف أحدث رقم ملف COFS؟');
  await page.getByTestId('faq-field-answer_en').fill('Ask your contributions officer; COFS numbers are maintained by the Contributions Unit.');
  await page.getByTestId('faq-save').click();
  await expect(page.getByTestId('faq-row').filter({ hasText: q })).toBeVisible();

  const rep = await browser.newPage();
  await login(rep, 'rep1');
  await rep.goto('/help');
  await expect(rep.getByText(q)).toBeVisible();
  await rep.close();
});

test('reminders run on demand', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/administration');
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('run-reminders').click();
  await expect(page.getByTestId('reminders-result')).toHaveText(/\d+ reminder\(s\) sent\./);
});

test('non-admins cannot use administration', async ({ page }) => {
  await login(page, 'manager');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByText('Administration')).toHaveCount(0);
  await page.goto('/administration');
  await expect(page.getByTestId('users-create')).toHaveCount(0);
  const token = await page.evaluate(() => localStorage.getItem('portal_access_token'));
  const r = await page.request.post('/api/functions/createUser', { data: { email: 'x@y.z', password: PASSWORD, role: 'system_admin' }, headers: { Authorization: `Bearer ${token}` } });
  expect(r.status()).toBe(403);
});
