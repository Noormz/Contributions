// FR-15 / §6: officer email composer, threaded inbox, BCC, reply matching, unmatched linking.
import { test, expect } from '@playwright/test';
import { login, SAMPLE_PDF, api } from './helpers.js';

// Fail on uncaught page errors and console errors (expected 401/403/404 resource logs are tolerated).
function watchErrors(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource: the server responded with a status of (401|403|404)/.test(t)) return;
    errors.push(`console: ${t}`);
  });
}

test.describe.configure({ mode: 'serial' });

let threadId;
let threadRef;
const SUBJECT = `Missing auditor page ${Date.now()}`;

test('officer composes an email with recipients, CC, application link, template and attachment', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.goto('/inbox');
  await page.getByTestId('inbox-compose').click();
  await page.getByTestId('compose-company').click();
  await page.getByRole('option', { name: 'Bayan Telecom Co.' }).click();
  await expect(page.getByTestId('compose-contact-finance@bayantel.example')).toBeVisible();
  await page.getByTestId('compose-contact-ceo@bayantel.example').click(); // second recipient
  await page.getByPlaceholder('Copy recipients, comma separated').fill('audit.cc@bayantel.example');
  await page.getByTestId('compose-application').click();
  await page.getByRole('option', { name: /APP-\d{4}-\d{6}/ }).first().click();
  // template fills subject/body, then we personalise
  await page.getByRole('dialog').getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: 'Application returned' }).click();
  await expect(page.getByTestId('compose-subject')).not.toHaveValue('');
  await page.getByTestId('compose-subject').fill(SUBJECT);
  await page.getByTestId('compose-body').fill('Dear team,\n\nPlease upload the signed auditor report page.\n\nRegards');
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(SAMPLE_PDF);
  await expect(page.getByRole('dialog').getByText('sample.pdf')).toBeVisible();
  await page.getByTestId('compose-send').click();

  await expect(page).toHaveURL(/\/inbox\/[a-f0-9]+$/);
  threadId = page.url().split('/').pop();
  threadRef = (await page.getByTestId('thread-reference').textContent()).trim();
  expect(threadRef).toMatch(/^THR-\d{4}-\d{6}$/);
  const msg = page.getByTestId('thread-message').first();
  await expect(msg).toHaveAttribute('data-direction', 'outbound');
  await expect(msg.getByTestId('bcc-indicator')).toBeVisible();
  await expect(msg).toContainText('ceo@bayantel.example');
  await expect(msg).toContainText('audit.cc@bayantel.example');
  await expect(msg).toContainText(`[Ref: ${threadRef}]`);
  await expect(msg.getByTestId('message-attachment')).toContainText('sample.pdf');
  await expect(page.getByRole('link', { name: /APP-\d{4}-\d{6}/ })).toBeVisible();

  // Sent-mail log shows the reference and BCC to the officer
  await page.goto('/mailbox');
  await page.getByTestId('mailbox-filter').fill(threadRef);
  const row = page.getByTestId('mail-row').filter({ hasText: threadRef }).first();
  await expect(row).toContainText(`[Ref: ${threadRef}]`);
  await expect(row).toContainText('BCC: officer1@portal.local');
  await expect(row).toContainText('CC: audit.cc@bayantel.example');
  expect(errors).toEqual([]);
});

test('dev mailbox (no login) shows the email to the company', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await page.goto('/dev/mailbox');
  await page.getByTestId('mailbox-filter').fill('ceo@bayantel.example');
  await expect(page.getByTestId('mail-row').filter({ hasText: threadRef }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('company rep sees the thread and replies in the portal; officer is notified', async ({ browser }) => {
  const rep = await browser.newPage();
  const errors = []; watchErrors(rep, errors);
  await login(rep, 'repBayan');
  await rep.goto('/inbox');
  await rep.getByTestId('thread-row').filter({ hasText: SUBJECT }).click();
  await expect(rep).toHaveURL(new RegExp(`/inbox/${threadId}$`));
  await expect(rep.getByTestId('bcc-indicator')).toHaveCount(0); // BCC is internal-only
  await expect(rep.getByText('BCC:')).toHaveCount(0);
  await rep.getByTestId('reply-body').fill('We have uploaded the page to the portal.');
  await rep.getByTestId('reply-send').click();
  await expect(rep.getByTestId('thread-message').filter({ hasText: 'We have uploaded the page' })).toHaveAttribute('data-direction', 'inbound');
  expect(errors).toEqual([]);
  await rep.close();

  const officer = await browser.newPage();
  const oerr = []; watchErrors(officer, oerr);
  await login(officer, 'officer1');
  await expect(officer.getByTestId('notification-count')).toBeVisible();
  await officer.getByTestId('notification-bell').click();
  const item = officer.getByTestId('notification-item').filter({ hasText: threadRef }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(officer).toHaveURL(new RegExp(`/inbox/${threadId}$`));
  await expect(officer.locator('[data-status="replied"]')).toBeVisible();
  expect(oerr).toEqual([]);
  await officer.close();
});

test('simulated email reply with reference is matched; without reference goes to Unmatched and can be linked', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.goto(`/inbox/${threadId}`);
  await expect(page.getByTestId('thread-message').first()).toBeVisible();
  const before = await page.getByTestId('thread-message').count();
  await page.getByTestId('simulate-reply').click();
  await expect(page.getByTestId('sim-subject')).toHaveValue(new RegExp(`\\[Ref: ${threadRef}\\]`));
  await page.getByTestId('sim-body').fill('Reply sent from Outlook.');
  await page.getByTestId('sim-send').click();
  await expect(page.getByTestId('thread-message')).toHaveCount(before + 1);
  const last = page.getByTestId('thread-message').last();
  await expect(last).toHaveAttribute('data-direction', 'inbound');
  await expect(last).toContainText('via email');

  // No reference → unmatched
  await page.getByTestId('simulate-reply').click();
  await page.getByTestId('sim-subject').fill('Question without any reference');
  await page.getByTestId('sim-body').fill('Hello, a general question.');
  await page.getByTestId('sim-send').click();
  await expect(page.getByTestId('link-thread')).toBeVisible();
  await expect(page.locator('[data-status="unmatched"]')).toBeVisible();
  await page.goto('/inbox');
  await expect(page.getByTestId('unmatched-section')).toContainText('Question without any reference');
  await page.getByTestId('unmatched-section').getByText('Question without any reference').first().click();
  await page.getByTestId('link-thread').click();
  await page.getByTestId('link-search').fill(threadRef);
  await page.getByTestId('link-candidate').filter({ hasText: threadRef }).click();
  await expect(page).toHaveURL(new RegExp(`/inbox/${threadId}$`));
  await expect(page.getByTestId('thread-message')).toHaveCount(before + 2);
  await expect(page.getByTestId('thread-message').filter({ hasText: 'a general question' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('another company cannot open the thread', async ({ page }) => {
  await login(page, 'repKni');
  await page.goto(`/inbox/${threadId}`);
  await expect(page.getByText('You do not have permission to access this conversation.')).toBeVisible();
  const r = await api(page, 'POST', '/api/functions/getThread', { thread_id: threadId });
  expect(r.status).toBe(403);
});

test('thread panel and close/reopen', async ({ page }) => {
  const errors = []; watchErrors(page, errors);
  await login(page, 'officer1');
  await page.goto(`/inbox/${threadId}`);
  await page.getByTestId('close-thread').click();
  await expect(page.getByTestId('reopen-thread')).toBeVisible();
  await expect(page.getByTestId('reply-body')).toHaveCount(0);
  await page.getByTestId('reopen-thread').click();
  await expect(page.getByTestId('reply-body')).toBeVisible();
  expect(errors).toEqual([]);
});
