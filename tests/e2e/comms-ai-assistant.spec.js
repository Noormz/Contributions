// AI assistant in the browser (offline provider in tests): opens from any page, answers from data the
// person may see, links stay inside the portal, and another company's records are not revealed.
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

const ask = async (page, q) => {
  await page.getByTestId('ai-input').fill(q);
  await page.getByTestId('ai-send').click();
};

test('company rep asks about own application; another company stays hidden', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'rep1');
  const apps = await page.request.get('/api/entities/ContributionApplication?limit=50').then((r) => r.json());
  const mine = apps.items.find((a) => a.application_reference);
  await page.getByTestId('ai-open').click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await expect(page.getByTestId('ai-panel')).toContainText(/Offline mode/);
  await ask(page, `What is the status of ${mine.application_reference}?`);
  const answer = page.getByTestId('ai-answer').last();
  await expect(answer).toContainText(mine.application_reference);
  await answer.getByRole('link', { name: mine.application_reference }).first().click();
  await expect(page).toHaveURL(new RegExp(`/applications/${mine.id}`));

  await ask(page, 'Status of APP-2026-000006?'); // Kuwait National Industries (another company)
  await expect(page.getByTestId('ai-answer').last()).not.toContainText('Kuwait National');
  await page.getByTestId('ai-close').click();
  await expect(page.getByTestId('ai-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('officer gets an overview and help answers in Arabic', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.getByTestId('ai-open').click();
  await ask(page, 'Give me an overview of applications by status');
  await expect(page.getByTestId('ai-answer').last()).toContainText(/applications by status/i);
  await ask(page, 'كيف أحصل على شهادة مخالصة؟');
  await expect(page.getByTestId('ai-answer').last()).toContainText(/دون اتصال/);
  expect(errors).toEqual([]);
});
