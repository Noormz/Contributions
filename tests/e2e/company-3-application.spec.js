// FR-05..13: contribution application wizard end to end as a company representative.
import { test, expect } from '@playwright/test';
import { login, api, SAMPLE_PDF } from './helpers.js';

let errors = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d|ERR_NETWORK_CHANGED/.test(m.text())) errors.push(m.text());
  });
});
test.afterEach(() => expect(errors, 'browser console errors').toEqual([]));

const upload = (page, testId) => page.locator(`[data-testid="${testId}"] + input[type=file]`).setInputFiles(SAMPLE_PDF);

async function pickYear(page, year) {
  await page.getByTestId('wizard-financial-year').click();
  await page.getByRole('option', { name: year, exact: true }).click();
}

test('full application: multiple statements, profile change, partial subsidiary, documents, evidence per method, submit, confirmation', async ({ page }) => {
  await login(page, 'repDesert');
  await page.goto('/applications/new');
  await expect(page.getByTestId('wizard-step-0')).toBeVisible();

  // Step 1 — basic
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('step-issues')).toContainText(/financial year/i);
  await pickYear(page, '2024');
  await page.getByTestId('wizard-declared-amount').fill('5000');
  await page.getByTestId('wizard-next').click();

  // Step 2 — financial statements (two)
  await expect(page.getByTestId('wizard-step-1')).toBeVisible();
  await expect(page).toHaveURL(/\/applications\/[a-f0-9]+\/edit/);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('step-issues')).toContainText(/at least one financial statement/i);
  await upload(page, 'fs-file');
  await expect(page.getByRole('button', { name: 'Remove file' })).toBeVisible();
  await page.getByTestId('fs-name').fill('Audited financial statements 2024');
  await page.getByTestId('fs-add').click();
  await expect(page.getByTestId('statement-list').locator('li')).toHaveCount(1);
  await upload(page, 'fs-file');
  await expect(page.getByRole('button', { name: 'Remove file' })).toBeVisible();
  await page.getByTestId('fs-name').fill('Consolidated statements 2024');
  await page.getByTestId('fs-year').fill('2024');
  await page.getByTestId('fs-end').fill('2024-12-31');
  await page.getByTestId('fs-add').click();
  await expect(page.getByTestId('statement-list').locator('li')).toHaveCount(2);
  await page.getByTestId('wizard-next').click();

  // Step 3 — profile verification with one requested change
  await expect(page.getByTestId('step-profile')).toBeVisible();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('step-issues')).toContainText(/confirm/i);
  await page.getByTestId('profile-toggle-auditor_name').click();
  await page.getByTestId('profile-input-auditor_name').fill('Grant Thornton');
  await page.getByTestId('profile-confirm').click();
  await page.getByTestId('wizard-next').click();

  // Step 4 — subsidiary with incomplete statement
  await expect(page.getByTestId('step-subsidiaries')).toBeVisible();
  await page.getByTestId('sub-name').fill('Pearl Logistics W.L.L.');
  await page.getByTestId('sub-pct').fill('75');
  await page.getByTestId('sub-incomplete').click();
  await page.getByTestId('sub-add').click();
  await expect(page.getByText(/explain why/i)).toBeVisible();
  await page.getByTestId('sub-incomplete-reason').fill('Audit not finalised until March');
  await page.getByTestId('sub-add').click();
  await expect(page.getByTestId('partial-notice')).toBeVisible();
  await page.getByTestId('wizard-next').click();

  // Step 5 — calculation working + additional attachment
  await expect(page.getByTestId('step-documents')).toBeVisible();
  await upload(page, 'calc-working-upload');
  await expect(page.getByTestId('step-documents').locator('ul li')).toHaveCount(1);
  await page.getByTestId('extra-desc').fill('Board resolution');
  await upload(page, 'extra-upload');
  await expect(page.getByTestId('step-documents').locator('ul li')).toHaveCount(2);
  await page.getByTestId('additional-comments').fill('Subsidiary statements will follow.');
  await page.getByTestId('wizard-next').click();

  // Step 6 — payment methods with evidence per method
  await expect(page.getByTestId('step-payment')).toBeVisible();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('step-issues')).toContainText(/payment method/i);
  await page.getByTestId('pm-bank_transfer').click();
  await page.getByTestId('pm-cheque').click();
  // No bank account is configured in the seed: companies are told to request it from KFAS.
  await expect(page.getByTestId('kfas-bank-details')).toContainText('info@kfas.org.kw');
  await upload(page, 'evidence-upload-bank_transfer');
  await expect(page.getByTestId('evidence-bank_transfer').locator('ul li')).toHaveCount(1);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('step-issues')).toContainText(/cheque/i);
  await upload(page, 'evidence-upload-cheque');
  await expect(page.getByTestId('evidence-cheque').locator('ul li')).toHaveCount(1);
  await page.getByTestId('wizard-next').click();

  // Step 7 — review & acknowledgements
  await expect(page.getByTestId('step-review')).toBeVisible();
  await expect(page.getByTestId('step-review')).toContainText('Grant Thornton');
  await expect(page.getByTestId('step-review')).toContainText('Bank Transfer, Cheque');
  await page.getByTestId('wizard-submit').click();
  await expect(page.getByTestId('step-issues')).toContainText(/acknowledgements/i);
  await page.getByTestId('ack-accuracy').click();
  await page.getByTestId('ack-terms').click();
  await page.getByTestId('wizard-submit').click();

  // Confirmation
  await expect(page).toHaveURL(/\/confirmation$/);
  const ref = (await page.getByTestId('confirmation-reference').textContent()).trim();
  expect(ref).toMatch(/^APP-\d{4}-\d{6}$/);
  await expect(page.getByTestId('confirmation-documents').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('application-confirmation')).toContainText('شركة لؤلؤة الصحراء للخدمات ذ.م.م');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('confirmation-pdf').click()]);
  expect(download.suggestedFilename()).toBe(`${ref}-confirmation.pdf`);

  // Listed as assigned (auto-assignment), and the profile change was applied & recorded
  await page.goto('/applications');
  const row = page.getByTestId('application-row').filter({ hasText: ref });
  await expect(row.locator('[data-status]')).toHaveAttribute('data-status', 'assigned');
  const me = (await api(page, 'GET', '/api/auth/me')).body;
  const company = (await api(page, 'GET', `/api/entities/Company/${me.company_id}`)).body;
  expect(company.auditor_name).toBe('Grant Thornton');
  expect(company.profile_locked).toBe(true);
  const hist = (await api(page, 'GET', `/api/entities/CompanyProfileChangeHistory?q=${encodeURIComponent(JSON.stringify({ company_id: me.company_id, field_name: 'auditor_name' }))}`)).body.items;
  expect(hist[0].related_application_reference).toBe(ref);
});

test('save draft and resume later; duplicate financial year is blocked', async ({ page }) => {
  await login(page, 'repDesert');
  await page.goto('/applications/new');
  await pickYear(page, '2023');
  await page.getByTestId('wizard-save-draft').click();
  await expect(page).toHaveURL(/\/applications\/[a-f0-9]+\/edit/);
  const editUrl = page.url();

  await page.goto('/applications');
  const draft = page.getByTestId('application-row').filter({ has: page.locator('[data-status="draft"]') });
  await expect(draft).toHaveCount(1);
  await draft.getByRole('link', { name: /continue/i }).click();
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByTestId('application-wizard')).toContainText('2023');

  // 2024 was already submitted in the previous test
  await page.goto('/applications/new');
  await pickYear(page, '2024');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-error')).toContainText(/already exists/i);
  await expect(page).toHaveURL(/\/applications\/new$/);
});

test('returned application shows officer comments and can be updated and resubmitted to the same officer', async ({ page }) => {
  await login(page, 'repKni');
  await page.goto('/applications?status=returned');
  const row = page.getByTestId('application-row').filter({ hasText: '2024' });
  await expect(row).toHaveCount(1);
  await row.getByRole('link').first().click();
  await expect(page.getByTestId('returned-comments')).toContainText('signed auditor report');
  const appId = page.url().split('/').pop();
  const before = (await api(page, 'GET', `/api/entities/ContributionApplication/${appId}`)).body;

  await page.getByTestId('action-edit').click();
  await expect(page.getByTestId('application-wizard')).toBeVisible();
  // a returned application opens on the review step; go back to statements to add the signed page
  await expect(page.getByTestId('step-review')).toBeVisible();
  await page.getByRole('button', { name: /edit/i }).nth(1).click();
  await expect(page.getByTestId('step-statements')).toBeVisible();
  await page.locator('[data-testid="fs-file"] + input[type=file]').setInputFiles(SAMPLE_PDF);
  await expect(page.getByRole('button', { name: 'Remove file' })).toBeVisible();
  await page.getByTestId('fs-name').fill('Signed auditor report page');
  await page.getByTestId('fs-add').click();
  await expect(page.getByTestId('statement-list').locator('li')).toHaveCount(2);
  for (let i = 0; i < 5; i++) await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('step-review')).toBeVisible();
  await page.getByTestId('wizard-submit').click();
  await expect(page).toHaveURL(/\/confirmation$/);

  const after = (await api(page, 'GET', `/api/entities/ContributionApplication/${appId}`)).body;
  expect(after.status).toBe('assigned');
  expect(after.assigned_officer_id).toBe(before.assigned_officer_id);
  expect(after.application_reference).toBe(before.application_reference);
});

test('company view of an application: all tabs render, no internal-only data', async ({ page }) => {
  await login(page, 'rep1');
  await page.goto('/applications?status=completed');
  await page.getByTestId('application-row').first().getByRole('link').first().click();
  await expect(page.getByTestId('application-detail')).toBeVisible();
  await expect(page.getByTestId('tab-assignments')).toHaveCount(0);
  await expect(page.getByTestId('tab-comments')).toHaveCount(0);
  await expect(page.getByTestId('application-detail')).not.toContainText(/Assigned officer/i);

  for (const tab of ['overview', 'documents', 'subsidiaries', 'calculation', 'payments', 'communications', 'activity']) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  }
  await page.getByTestId('tab-documents').click();
  await expect(page.getByTestId('docs-financial_statement')).toContainText('Audited Financial Statements 2023');
  await page.getByTestId('tab-calculation').click();
  await expect(page.getByTestId('calc-summary')).toHaveCount(0);
  await expect(page.getByText('42,000.000 KWD').first()).toBeVisible();
  await page.getByTestId('tab-payments').click();
  await expect(page.getByTestId('balance-panel')).toBeVisible();
  await expect(page.getByTestId('balance-table')).toHaveCount(0);
  await expect(page.getByTestId('balance-panel')).not.toContainText(/past dues|unallocated/i);
  await page.getByTestId('tab-activity').click();
  await expect(page.getByTestId('company-history')).toContainText(/Completed/);
  await expect(page.getByTestId('company-history')).not.toContainText(/Khaled|Noura|Fahad|Mariam/);

  // an application of another company is refused with a friendly message
  const others = (await api(page, 'GET', `/api/entities/ContributionApplication?q=${encodeURIComponent('{}')}`)).body.items;
  expect(others.every((a) => a.company_name === 'Gulf Horizon Investment Co.')).toBe(true);
  await page.goto('/applications/000000000000000000000000');
  await expect(page.getByTestId('application-error')).toContainText(/could not be found/i);
});
