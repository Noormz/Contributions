// Shared Playwright helpers. Demo users come from server/seed.js.
import { expect } from '@playwright/test';
import path from 'node:path';

export const PASSWORD = 'Portal#2026';
export const USERS = {
  admin: 'admin@portal.local',
  manager: 'manager@portal.local',
  officer1: 'officer1@portal.local',
  officer2: 'officer2@portal.local',
  officer3: 'officer3@portal.local',
  accounts: 'accounts@portal.local',
  rep1: 'rep1@gulfhorizon.example', // Gulf Horizon (2023 completed, 2024 under review, 2025 draft)
  repWaha: 'rep@alwaha.example', // Al-Waha (2023 accounts processing w/ partial payment, 2024 pending approval)
  repKni: 'rep@kni.example', // KNI (2023 payment pending verification, 2024 returned)
  repBayan: 'rep@bayantel.example', // Bayan (2024 assigned)
  repSahel: 'rep@sahel.example', // Sahel (2024 calculation returned by manager)
  repDesert: 'rep@desertpearl.example', // Desert Pearl (no applications)
};

export const SAMPLE_PDF = path.resolve('tests/e2e/fixtures/sample.pdf');

// Logs in through the API (fast) and stores the token the SPA reads.
export async function login(page, who) {
  const email = USERS[who] || who;
  const res = await page.request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  const { access_token } = await res.json();
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('portal_access_token', t), access_token);
  await page.goto('/');
  await expect(page.getByTestId('current-user')).toBeVisible();
  return access_token;
}

// Logs in through the real login form.
export async function loginViaForm(page, who) {
  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"], #email').first().fill(USERS[who] || who);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /log in|sign in|دخول/i }).first().click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

// Calls a server function with the stored token (for setup/assertions).
export async function api(page, method, url, data) {
  const token = await page.evaluate(() => localStorage.getItem('portal_access_token'));
  const res = await page.request.fetch(url, { method, data, headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

export const devMail = async (page, to) => (await page.request.get(`/api/dev/mailbox?to=${encodeURIComponent(to)}`)).json();
