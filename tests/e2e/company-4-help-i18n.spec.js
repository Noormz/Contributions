// FR-04 help & inquiries; NFR usability: Arabic/RTL and mobile layout on company screens.
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
test.afterEach(async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('app_language', 'en')).catch(() => {});
  expect(errors, 'browser console errors').toEqual([]);
});

const noOverflow = async (page) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, 'no horizontal page overflow').toBeLessThanOrEqual(iw + 1);
};

// i18n keys look like snake_case words (e.g. "w_step_basic", "nav_dashboard").
const rawKeys = async (page) => {
  const text = await page.locator('main').innerText();
  return (text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || []).filter((k) => !k.includes('@'));
};

test('help page: guided answers, FAQ, inquiry submission and responses', async ({ page }) => {
  await login(page, 'rep1');
  await page.goto('/help');
  await expect(page.getByTestId('guided-status')).toContainText(/financial year 2025|financial year 2024|financial year 2023/i);
  await expect(page.getByTestId('clearance-eligibility')).toHaveText(/not yet/i);
  await expect(page.getByTestId('guided-status')).not.toContainText(/KWD/); // amounts are internal-only

  await page.getByRole('button', { name: 'Which documents do I need to apply?' }).click();
  await expect(page.getByText(/Audited financial statements for the year/)).toBeVisible();

  await page.getByTestId('inquiry-submit').click();
  await expect(page.getByText('Select a category.')).toBeVisible();
  await page.getByTestId('inquiry-category').selectOption({ label: 'Clearance letter' });
  await page.getByTestId('inquiry-subject').fill('Clearance for tender 2026');
  await page.getByTestId('inquiry-description').fill('Which conditions must be met before you issue a clearance letter?');
  await page.getByTestId('inquiry-submit').click();
  await expect(page.getByTestId('inquiry-sent')).toContainText(/INQ-\d{4}-\d{6}/);
  await expect(page.getByTestId('my-inquiries')).toContainText('Clearance for tender 2026');
});

test('responded inquiry shows the officer response to the company', async ({ page }) => {
  await login(page, 'repWaha');
  await page.goto('/help');
  const item = page.getByTestId('my-inquiries').locator('li').filter({ hasText: 'Remaining balance for 2023' });
  await expect(item).toContainText(/Response/);
  await expect(item.locator('[data-status]')).toHaveAttribute('data-status', 'responded');
  await item.getByRole('link').click();
  await expect(page.getByText(/instalment options/).first()).toBeVisible();
});

test('Arabic: company screens switch to RTL with translated text and no layout overflow', async ({ page }) => {
  await login(page, 'repKni');
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const path of ['/', '/company-profile', '/applications', '/applications/new', '/help', '/payments', '/inbox']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('current-user')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await rawKeys(page), `untranslated keys on ${path}`).toEqual([]);
    // Known issue (reported, PaymentsPage.jsx is outside this track): the two date filters overflow in RTL.
    await noOverflow(page);
  }
  await page.goto('/applications/new');
  await expect(page.getByTestId('application-wizard')).toContainText('طلب مساهمة جديد');
  await page.goto('/company-profile');
  await expect(page.getByTestId('company-tab-profile')).toHaveText('الملف');
});

test('mobile: dashboard, wizard and application detail fit a phone and the menu opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'rep1');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My Applications' })).toBeInViewport();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My Applications' }).click();
  await expect(page.getByTestId('applications-list')).toBeVisible();
  await noOverflow(page);
  await page.getByTestId('application-row').first().getByRole('link').first().click();
  await expect(page.getByTestId('application-detail')).toBeVisible();
  await noOverflow(page);
  await page.goto('/applications/new');
  await expect(page.getByTestId('application-wizard')).toBeVisible();
  await noOverflow(page);
});
