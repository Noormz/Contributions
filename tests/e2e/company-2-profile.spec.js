// FR-03 / FR-06 / FR-20: company profile, lock, change history, users, relationships.
import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

let errors = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d|ERR_NETWORK_CHANGED/.test(m.text())) errors.push(m.text());
  });
});
test.afterEach(() => expect(errors, 'browser console errors').toEqual([]));

test('locked profile (application in progress) cannot be edited by the company', async ({ page }) => {
  await login(page, 'rep1');
  await page.goto('/company-profile');
  await expect(page.getByTestId('locked-badge')).toBeVisible();
  await expect(page.getByTestId('profile-locked')).toContainText(/locked/i);
  await expect(page.getByTestId('profile-edit')).toHaveCount(0);
  await expect(page.getByTestId('company-header')).toContainText('COFS-10021');
  await expect(page.getByTestId('company-tab-balance')).toHaveCount(0); // balances are internal only (FR-11)
});

test('unlocked company edits its profile and the change is recorded in history', async ({ page }) => {
  await login(page, 'repDesert');
  await page.goto('/company-profile');
  await expect(page.getByTestId('locked-badge')).toHaveCount(0);
  await page.getByTestId('profile-edit').click();
  await expect(page.getByTestId('cp-cofs_file_number')).toHaveCount(0); // COFS is internal-only
  await page.getByTestId('cp-telephone').fill('+965 2299 8877');
  await page.getByTestId('profile-reason').fill('New switchboard number');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-msg')).toContainText(/updated/i);
  await expect(page.getByText('+965 2299 8877')).toBeVisible();
  await page.getByTestId('company-tab-history').click();
  const row = page.getByRole('row').filter({ hasText: '+965 2299 8877' });
  await expect(row).toContainText('Telephone');
  await expect(row).toContainText('New switchboard number');
});

test('company representative adds another user for the company', async ({ page }) => {
  await login(page, 'repDesert');
  await page.goto('/company-profile?tab=users');
  await expect(page.getByTestId('company-user-row')).toHaveCount(1);
  await page.getByTestId('company-user-add').click();
  await page.getByTestId('company-user-full_name').fill('Reem Accountant');
  await page.getByTestId('company-user-email').fill('reem@desertpearl.example');
  await page.getByTestId('company-user-job_title').fill('Accountant');
  await page.getByTestId('company-user-password').fill('Desert#2026x');
  await page.getByTestId('company-user-save').click();
  await expect(page.getByTestId('company-user-row')).toHaveCount(2);
  await expect(page.getByTestId('company-user-row').filter({ hasText: 'reem@desertpearl.example' })).toBeVisible();

  // the new user can log in and sees the same company
  const res = await page.request.post('/api/auth/login', { data: { email: 'reem@desertpearl.example', password: 'Desert#2026x' } });
  expect(res.ok()).toBeTruthy();
});

test('company representative records a subsidiary relationship', async ({ page }) => {
  await login(page, 'repDesert');
  await page.goto('/company-profile?tab=relationships');
  await page.getByTestId('relationship-add').click();
  await page.getByTestId('relationship-save').click();
  await expect(page.getByRole('dialog')).toContainText(/related company/i);
  await page.getByTestId('relationship-name').fill('Pearl Logistics W.L.L.');
  await page.getByTestId('relationship-pct').fill('75');
  await page.locator('#rel-fy').fill('2024');
  await page.getByTestId('relationship-save').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'Pearl Logistics W.L.L.' });
  await expect(row).toContainText('75%');
  await expect(row).toContainText('Subsidiary');
});

test('internal officer sees the company profile with balance tab and can set the COFS number', async ({ page }) => {
  await login(page, 'officer1');
  await page.goto('/companies');
  await page.getByRole('link', { name: 'Desert Pearl Services W.L.L.' }).click();
  await expect(page.getByTestId('company-header')).toBeVisible();
  await expect(page.getByTestId('company-tab-balance')).toBeVisible();
  await page.getByTestId('profile-edit').click();
  await page.getByTestId('cp-cofs_file_number').fill('COFS-20999');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('company-header')).toContainText('COFS-20999');
});
