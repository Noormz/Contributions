// FR-01 / FR-02: company registration with email verification, login, password reset.
import { test, expect } from '@playwright/test';
import { SAMPLE_PDF, devMail } from './helpers.js';

let errors = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/status of 4\d\d|ERR_NETWORK_CHANGED/.test(m.text())) return; // expected validation/auth responses
    errors.push(m.text());
  });
});
test.afterEach(() => expect(errors, 'browser console errors').toEqual([]));

const NEW_PASSWORD = 'Newco#2026a';

async function fillRegistration(page, { email, cr, nameEn = 'Test Holding Co.', nameAr = 'شركة الاختبار القابضة' }) {
  const f = (id, v) => page.getByTestId(`reg-${id}`).fill(v);
  await f('company_name_ar', nameAr);
  await f('company_name_en', nameEn);
  await f('previous_company_name', 'Old Test Co.');
  await f('commercial_registration_number', cr);
  await f('business_license_number', 'BL-7788');
  await f('year_of_establishment', '2010');
  await page.locator('#company_type').selectOption({ index: 1 });
  await page.locator('#business_sector').selectOption({ label: 'Investment' });
  await f('capital', '2500000');
  await f('auditor_name', 'KPMG');
  await page.getByTestId('is-wll').click();
  const files = page.locator('[data-testid="registration-form"] input[type=file]');
  await expect(files).toHaveCount(2);
  await files.first().setInputFiles(SAMPLE_PDF); // business licence (input is replaced by a file chip)
  await expect(files).toHaveCount(1);
  await files.first().setInputFiles(SAMPLE_PDF); // MOCI proof
  await expect(files).toHaveCount(0);
  await page.locator('#governorate').selectOption({ label: 'Hawalli' });
  await f('area', 'Salmiya');
  await f('street', 'Salem Al-Mubarak St.');
  await f('building', '12');
  await f('telephone', '+965 2222 3333');
  await f('official_email', 'info@testholding.example');
  await f('ceo_name_en', 'Ali Test');
  await f('ceo_name_ar', 'علي الاختبار');
  await f('ceo_job_title', 'CEO');
  await f('ceo_email', 'ceo@testholding.example');
  await f('financial_manager_name', 'Mona Finance');
  await f('financial_manager_position', 'CFO');
  await f('financial_manager_email', 'cfo@testholding.example');
  await f('financial_manager_mobile', '+965 6000 1111');
  await f('contact_email', email);
  await f('password', NEW_PASSWORD);
  await f('confirm_password', NEW_PASSWORD);
  await page.getByTestId('reg-confirm').click();
}

async function readOtp(page, email) {
  await expect.poll(async () => (await devMail(page, email)).filter((m) => m.category === 'verification').length).toBeGreaterThan(0);
  const mail = (await devMail(page, email)).find((m) => m.category === 'verification');
  return mail.body.match(/\b\d{6}\b/)[0];
}

test('registration validates, verifies email by OTP, creates the company and lands on the dashboard', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('reg-submit').click();
  await expect(page.getByTestId('reg-error')).toBeVisible();
  await expect(page.getByTestId('reg-company_name_ar')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('reg-company_name_ar').locator('xpath=following-sibling::p')).toHaveText(/required/i);

  const email = 'owner@testholding.example';
  await fillRegistration(page, { email, cr: '700100' });
  await page.getByTestId('reg-submit').click();
  await expect(page.getByTestId('otp-input')).toBeVisible();

  await page.getByTestId('otp-input').fill('000000');
  await page.getByTestId('otp-submit').click();
  await expect(page.getByTestId('otp-error')).toBeVisible();

  await page.getByTestId('otp-input').fill(await readOtp(page, email));
  await page.getByTestId('otp-submit').click();
  await expect(page.getByTestId('registration-done')).toBeVisible();
  await page.getByTestId('registration-continue').click();
  await expect(page.getByTestId('current-user')).toBeVisible();

  await page.goto('/company-profile');
  await expect(page.getByTestId('company-header')).toContainText('700100');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('شركة الاختبار القابضة');
  await expect(page.getByText('Previous name', { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId('company-header')).toContainText(/W\.L\.L\./);
  await expect(page.getByText('Business licence document').locator('xpath=ancestor::div[1]').getByRole('link', { name: /download/i })).toBeVisible();
});

test('registration with an already registered CR number shows the server error and allows correction', async ({ page }) => {
  const email = 'dup@dupco.example';
  await page.goto('/register');
  await fillRegistration(page, { email, cr: '345120', nameEn: 'Dup Co.', nameAr: 'شركة مكررة' });
  await page.getByTestId('reg-submit').click();
  await page.getByTestId('otp-input').fill(await readOtp(page, email));
  await page.getByTestId('otp-submit').click();
  await expect(page.getByTestId('otp-error')).toContainText(/already registered/i);
  await page.getByRole('button', { name: /edit company details/i }).click();
  await page.getByTestId('reg-commercial_registration_number').fill('700200');
  await page.getByTestId('reg-submit').click();
  await expect(page.getByTestId('registration-done')).toBeVisible();
});

test('login form works with email and with username; wrong password is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('owner@testholding.example');
  await page.getByTestId('login-password').fill('wrong-password1');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toBeVisible();
  await page.getByTestId('login-password').fill(NEW_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('current-user')).toContainText(/Mona Finance|testholding/i);
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByTestId('login-email').fill('officer1');
  await page.getByTestId('login-password').fill('Portal#2026');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('current-user')).toContainText('Khaled');
});

test('forgot password emails a reset link that sets a new password', async ({ page }) => {
  const email = 'owner@testholding.example';
  await page.goto('/forgot-password');
  await page.getByTestId('forgot-email').fill(email);
  await page.getByTestId('forgot-submit').click();
  await expect(page.getByTestId('reset-sent')).toBeVisible();
  await expect.poll(async () => (await devMail(page, email)).filter((m) => m.category === 'password_reset').length).toBeGreaterThan(0);
  const mail = (await devMail(page, email)).find((m) => m.category === 'password_reset');
  const token = mail.body.match(/token=([a-f0-9]+)/)[1];
  await page.goto(`/reset-password?token=${token}`);
  await page.getByTestId('reset-password').fill('short');
  await page.getByTestId('reset-confirm').fill('short');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByTestId('reset-password').fill('Changed#2026b');
  await page.getByTestId('reset-confirm').fill('Changed#2026b');
  await page.getByTestId('reset-submit').click();
  await page.getByTestId('reset-login').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill('Changed#2026b');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('current-user')).toBeVisible();
});
