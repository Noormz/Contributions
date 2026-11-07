// FR-08 / FR-17: calculation review workspace, manager approval, returns, reopen.
import { test, expect, findApp, getEntity, fn, listEntity, fmt } from './internal-fixtures.js';
import { login, USERS } from './helpers.js';

test.describe.configure({ mode: 'serial' });

async function officerOf(page, app) {
  const fresh = await getEntity(page, 'ContributionApplication', app.id);
  const { body: officers } = await fn(page, 'listOfficers');
  return Object.entries(USERS).find(([, e]) => e === officers.find((o) => o.id === fresh.assigned_officer_id).email)[0];
}

test('officer reviews an assigned application: queue, start review, documents, live result, draft, submit', async ({ page }) => {
  await login(page, 'manager');
  const bayan = await findApp(page, 'Bayan', '2024');
  const who = await officerOf(page, bayan);
  await login(page, who);
  await page.goto('/calculation-review');
  await expect(page.getByTestId('queue-mine')).toHaveAttribute('data-state', 'checked');
  await page.getByTestId('queue-row').filter({ hasText: bayan.application_reference }).click();
  await expect(page).toHaveURL(new RegExp(`/calculation-review/${bayan.id}`));
  await expect(page.getByTestId('calc-net_profit')).toBeDisabled();
  await page.getByTestId('start-review').click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByTestId('calc-net_profit')).toBeEnabled();

  const docs = page.getByTestId('application-docs');
  await expect(docs).toContainText('Audited Financial Statements 2024');
  await expect(docs).toContainText('Bank Transfer');
  const href = await docs.locator('a').first().getAttribute('href');
  const dl = await page.request.get(href);
  expect(dl.status()).toBe(200);
  expect(dl.headers()['content-type']).toContain('pdf');

  await page.getByTestId('calc-net_profit').fill('1000000');
  await page.getByTestId('calc-subsidiary_share').fill('50000');
  await page.getByTestId('calc-contribution_rate').fill('1');
  await page.getByTestId('calc-adjustments').fill('-500');
  await expect(page.getByTestId('calc-result')).toHaveText(`${fmt(10000)} KWD`);
  await page.getByTestId('save-calc').click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('calc-net_profit')).toHaveValue('1000000');
  await expect(page.getByTestId('calc-result')).toHaveText(`${fmt(10000)} KWD`);
  await page.getByTestId('submit-calc').click();
  await expect(page.getByText('This calculation is waiting for manager approval.')).toBeVisible();
  expect((await getEntity(page, 'ContributionApplication', bayan.id)).status).toBe('pending_manager_approval');
});

test('partial-calculation banner and previous-years copy on Gulf Horizon 2024', async ({ page }) => {
  await login(page, 'manager');
  const gh = await findApp(page, 'Gulf Horizon', '2024');
  await login(page, await officerOf(page, gh));
  await page.goto(`/calculation-review/${gh.id}`);
  await expect(page.getByTestId('partial-banner')).toContainText('Al-Waha');
  const prev = page.getByTestId('previous-calcs');
  await expect(prev).toContainText('FY 2023');
  await expect(prev).toContainText(fmt(42000));
  await page.getByTestId('copy-inputs').first().click();
  await expect(page.getByTestId('calc-net_profit')).toHaveValue('4200000');
  await expect(page.getByTestId('calc-previous_contribution')).toHaveValue('42000');
  await expect(page.getByTestId('calc-result')).toHaveText(`${fmt(42000)} KWD`);
});

test('manager returns with required comments, officer sees them and resubmits, manager approves', async ({ page }) => {
  await login(page, 'manager');
  const bayan = await findApp(page, 'Bayan', '2024');
  const who = await officerOf(page, bayan);
  await page.goto('/approvals');
  const row = page.getByRole('row').filter({ hasText: bayan.application_reference });
  await row.getByTestId('review-approval').click();
  await expect(page.getByRole('dialog')).toContainText(fmt(10000));
  await page.getByTestId('return-to-officer').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The warning appears inside the dialog, next to the comments box, which gets focus.
  await expect(page.getByRole('dialog').getByTestId('approval-error')).toContainText('Write a reason before returning');
  await expect(page.getByTestId('approval-comments')).toBeFocused();
  await page.getByTestId('approval-comments').fill('Please exclude the subsidiary share.');
  await page.getByTestId('return-to-officer').click();
  await expect(page.getByText(`${bayan.application_reference} returned to the officer.`)).toBeVisible();

  await login(page, who);
  await page.goto(`/calculation-review/${bayan.id}`);
  await expect(page.getByTestId('manager-comments')).toContainText('Please exclude the subsidiary share.');
  await page.getByTestId('calc-subsidiary_share').fill('0');
  await expect(page.getByTestId('calc-result')).toHaveText(`${fmt(9500)} KWD`);
  await page.getByTestId('submit-calc').click();
  await expect(page.getByText('This calculation is waiting for manager approval.')).toBeVisible();

  await login(page, 'manager');
  await page.goto('/approvals');
  await page.getByRole('row').filter({ hasText: bayan.application_reference }).getByTestId('review-approval').click();
  await page.getByTestId('approval-comments').fill('Approved.');
  await page.getByTestId('approve-calc').click();
  await expect(page.getByText(`${bayan.application_reference} approved and forwarded to the Accounts Unit.`)).toBeVisible();
  const after = await getEntity(page, 'ContributionApplication', bayan.id);
  expect(after.status).toBe('accounts_processing');
  expect(after.contribution_due).toBe(9500);
  await page.getByRole('tab', { name: /Approved by me/ }).click();
  await expect(page.getByRole('tabpanel')).toContainText(bayan.application_reference);
  await page.getByRole('tab', { name: /Returned by me/ }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Please exclude the subsidiary share.');
});

test('seeded manager return on Sahel: officer resubmits, manager approves from the application page', async ({ page }) => {
  await login(page, 'manager');
  const sahel = await findApp(page, 'Sahel', '2024');
  await login(page, await officerOf(page, sahel));
  await page.goto(`/calculation-review/${sahel.id}`);
  await expect(page.getByTestId('manager-comments')).toContainText('disposed subsidiary');
  await page.getByTestId('calc-adjustments').fill('-600');
  await expect(page.getByTestId('calc-result')).toHaveText(`${fmt(7000)} KWD`);
  await page.getByTestId('submit-calc').click();
  await expect(page.getByText('This calculation is waiting for manager approval.')).toBeVisible();

  await login(page, 'manager');
  await page.goto(`/applications/${sahel.id}`);
  await page.getByTestId('action-approve').click();
  await page.getByTestId('approve-confirm').click();
  await expect(page.getByTestId('action-success')).toBeVisible();
  expect((await getEntity(page, 'ContributionApplication', sahel.id)).status).toBe('accounts_processing');
});

test('reopen an approved calculation, submit a revised amount, manager approves it', async ({ page }) => {
  await login(page, 'manager');
  const bayan = await findApp(page, 'Bayan', '2024');
  const who = await officerOf(page, bayan);
  await login(page, who);
  await page.goto(`/calculation-review/${bayan.id}`);
  await expect(page.getByTestId('calc-net_profit')).toBeDisabled();
  await page.getByTestId('reopen-calc').click();
  await expect(page.getByTestId('dialog-confirm')).toBeDisabled();
  await page.getByTestId('dialog-text').fill('Subsidiary statements received');
  await page.getByTestId('dialog-confirm').click();
  await expect(page.getByText('Calculation reopened: Subsidiary statements received')).toBeVisible();
  await page.getByTestId('calc-net_profit').fill('1200000');
  await expect(page.getByTestId('calc-result')).toHaveText(`${fmt(11500)} KWD`);
  await page.getByTestId('submit-revised').click();
  await expect(page.getByText('This calculation is waiting for manager approval.')).toBeVisible();

  await login(page, 'manager');
  await page.goto('/approvals');
  await page.getByRole('row').filter({ hasText: bayan.application_reference }).getByTestId('review-approval').click();
  await page.getByTestId('approve-calc').click();
  await expect(page.getByText(`${bayan.application_reference} approved and forwarded to the Accounts Unit.`)).toBeVisible();
  const after = await getEntity(page, 'ContributionApplication', bayan.id);
  expect(after.status).toBe('accounts_processing');
  expect(after.contribution_due).toBe(11500);
  const versions = await listEntity(page, 'CalculationVersion', { application_id: bayan.id });
  expect(versions.length).toBeGreaterThanOrEqual(3);
});
