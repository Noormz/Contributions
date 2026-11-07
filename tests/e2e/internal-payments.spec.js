// FR-10 / FR-11 / FR-18 / FR-21: payments, verification, gateway, allocation override,
// receipt vouchers, completion, archive, clearance letters.
import fs from 'node:fs';
import { test, expect, findApp, getEntity, fn, pick, listEntity, fmt } from './internal-fixtures.js';
import { login, SAMPLE_PDF } from './helpers.js';

test.describe.configure({ mode: 'serial' });

const dialog = (page) => page.getByRole('dialog');

test('company rep records a cheque payment with mandatory evidence', async ({ page }) => {
  await login(page, 'manager');
  const kni = await findApp(page, 'Kuwait National', '2023');
  await login(page, 'repKni');
  await page.goto('/payments');
  await expect(page.getByTestId('kfas-bank-details')).toBeVisible();
  await page.getByTestId('record-payment').click();
  await pick(page, 'pay-application', new RegExp(`${kni.application_reference}`));
  await pick(page, 'pay-method', 'Cheque');
  await page.getByTestId('pay-amount').fill('1234.5');
  await page.getByTestId('pay-cheque').fill('778899');
  await page.getByTestId('pay-save').click();
  await expect(dialog(page).getByRole('alert')).toHaveText('Upload the supporting payment document.');
  await dialog(page).locator('input[type=file]').setInputFiles(SAMPLE_PDF);
  await expect(dialog(page).getByText('sample.pdf')).toBeVisible();
  await page.getByTestId('pay-save').click();
  await expect(dialog(page)).toBeHidden();
  const row = page.getByTestId('payments-table').getByRole('row').filter({ hasText: '1,234.500' });
  await expect(row).toContainText('Pending');
  await expect(row).toContainText(kni.application_reference);
});

test('accounts verifies a pending cheque (auto-allocated) and rejects another with a reason', async ({ page }) => {
  await login(page, 'accounts');
  const kni = await findApp(page, 'Kuwait National', '2023');
  const pending = await listEntity(page, 'Payment', { company_id: kni.company_id, payment_status: 'pending' });
  const big = pending.find((p) => p.payment_amount === 50000);
  const small = pending.find((p) => p.payment_amount === 1234.5);
  await page.goto(`/records/Payment/${big.id}`);
  await page.getByTestId('payment-verify').click();
  await page.getByTestId('payment-dialog-confirm').click();
  await expect(page.getByText('Payment verified and allocated.')).toBeVisible();
  await expect(page.getByTestId('allocations')).toContainText('FY 2023');
  await expect(page.getByTestId('allocations')).toContainText(fmt(50000));
  expect((await getEntity(page, 'Payment', big.id)).payment_status).toBe('verified');

  await page.goto(`/records/Payment/${small.id}`);
  await page.getByTestId('payment-reject').click();
  await expect(page.getByTestId('payment-dialog-confirm')).toBeDisabled();
  await page.getByTestId('payment-dialog-text').fill('Cheque not signed');
  await page.getByTestId('payment-dialog-confirm').click();
  await expect(page.getByText('Payment rejected. The company has been notified.')).toBeVisible();
  const rejected = await getEntity(page, 'Payment', small.id);
  expect(rejected.payment_status).toBe('rejected');
  expect(rejected.internal_notes).toContain('Cheque not signed');
});

test('payment gateway: failure is recorded, then a successful payment settles the balance', async ({ page }) => {
  await login(page, 'manager');
  const waha = await findApp(page, 'Al-Waha', '2023');
  const before = (await fn(page, 'companyBalances', { company_id: waha.company_id })).body.rows.find((r) => r.application_id === waha.id);
  expect(before.remaining).toBe(10500);

  await login(page, 'repWaha');
  await page.goto(`/applications/${waha.id}`);
  await page.getByTestId('action-pay').click();
  await expect(page.getByTestId('pay-amount')).toHaveValue('10500');
  await page.getByTestId('pay-amount').fill('1000');
  await page.getByTestId('pay-confirm').click();
  await expect(page).toHaveURL(/\/pay\/checkout\//);
  await expect(page.getByTestId('test-mode-banner')).toBeVisible();
  await expect(page.getByTestId('checkout-amount')).toHaveText(`${fmt(1000)} KWD`);
  await page.getByTestId('gateway-fail').click();
  await expect(page.getByTestId('gateway-result')).toContainText('Payment failed');
  await page.getByTestId('gateway-back').click();
  await expect(page.getByTestId('payment-actions')).toContainText('Rejected');

  await page.goto(`/applications/${waha.id}`);
  await page.getByTestId('action-pay').click();
  await page.getByTestId('pay-confirm').click();
  await expect(page.getByTestId('checkout-amount')).toHaveText(`${fmt(10500)} KWD`);
  const gref = await page.getByTestId('gateway-ref').innerText();
  await page.getByTestId('gateway-pay').click();
  await expect(page.getByTestId('gateway-result')).toContainText('Payment successful');
  await expect(page.getByTestId('txn-ref')).toHaveText(/^TXN\d+/);
  await page.getByTestId('gateway-back').click();
  await expect(page.getByTestId('payment-actions')).toContainText('Verified');
  await expect(page.getByTestId('payment-actions')).toContainText(gref);

  await login(page, 'manager');
  const after = (await fn(page, 'companyBalances', { company_id: waha.company_id })).body.rows.find((r) => r.application_id === waha.id);
  expect(after.remaining).toBe(0);
  const txs = await listEntity(page, 'PaymentGatewayTransaction', { company_id: waha.company_id });
  expect(txs.map((t) => t.status).sort()).toEqual(['completed', 'failed']);
});

test('accounts issues a receipt voucher (signed PDF generated, no upload), company downloads it, application completed, archive downloaded', async ({ page }) => {
  await login(page, 'accounts');
  const waha = await findApp(page, 'Al-Waha', '2023');
  const pg = (await listEntity(page, 'Payment', { company_id: waha.company_id, payment_method: 'payment_gateway', payment_status: 'verified' }))[0];
  await page.goto('/receipt-vouchers');
  await page.getByTestId('issue-document').click();
  await pick(page, 'issue-company', 'Al-Waha Real Estate Co.');
  await pick(page, 'issue-application', new RegExp(waha.application_reference));
  await pick(page, 'issue-payment', new RegExp(pg.payment_reference));
  await expect(dialog(page).getByTestId('issue-signed-note')).toBeVisible();
  await expect(dialog(page).locator('input[type=file]')).toHaveCount(0);
  await page.getByTestId('issue-save').click();
  await expect(page.getByText(/RV-\d{4}-\d{6} issued\. The company has been notified\./)).toBeVisible();
  const voucher = (await listEntity(page, 'ReceiptVoucher', { application_id: waha.id }))[0];
  expect(voucher.related_payment_id).toBe(pg.id);
  expect(voucher.uploaded_by).toBe('Hamad Al-Azmi');

  await login(page, 'repWaha');
  await page.goto('/receipt-vouchers');
  const row = page.getByTestId('issued-table').getByRole('row').filter({ hasText: voucher.voucher_number });
  await expect(row).toBeVisible();
  await expect(page.getByTestId('issue-document')).toHaveCount(0);
  await expect(row.getByTestId('issued-download')).toHaveCount(0); // one version only
  const href = await row.getByTestId('issued-pdf').getAttribute('href');
  const dl = await page.request.get(href);
  expect(dl.status()).toBe(200);
  expect(dl.headers()['content-type']).toContain('application/pdf');
  expect(dl.headers()['content-disposition']).toContain('attachment');

  await login(page, 'accounts');
  await page.goto(`/applications/${waha.id}`);
  await page.getByTestId('action-complete').click();
  await page.getByTestId('complete-confirm').click();
  await expect(page.getByTestId('action-success')).toBeVisible();
  expect((await getEntity(page, 'ContributionApplication', waha.id)).status).toBe('completed');

  await login(page, 'manager');
  await page.goto(`/applications/${waha.id}`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('action-archive').click()]);
  expect(download.suggestedFilename()).toBe(`${waha.application_reference}-archive.zip`);
  const size = fs.statSync(await download.path()).size;
  expect(size).toBeGreaterThan(1000);
});

test('completing an application with an outstanding balance is refused with a clear message', async ({ page }) => {
  await login(page, 'accounts');
  const kni = await findApp(page, 'Kuwait National', '2023');
  await page.goto(`/applications/${kni.id}`);
  await page.getByTestId('action-complete').click();
  await page.getByTestId('complete-confirm').click();
  await expect(page.getByTestId('complete-error')).toContainText(/receipt voucher|outstanding balance/i);
  expect((await getEntity(page, 'ContributionApplication', kni.id)).status).toBe('accounts_processing');
});

test('accounts issues a clearance letter', async ({ page }) => {
  await login(page, 'accounts');
  const waha = await findApp(page, 'Al-Waha', '2023');
  await page.goto('/clearance-letters');
  await page.getByTestId('issue-document').click();
  await pick(page, 'issue-company', 'Al-Waha Real Estate Co.');
  await pick(page, 'issue-application', new RegExp(waha.application_reference));
  await page.getByTestId('issue-save').click();
  await expect(page.getByText(/CL-\d{4}-\d{6} issued/)).toBeVisible();
  const row = page.getByTestId('issued-table').getByRole('row').filter({ hasText: 'Al-Waha' });
  await expect(row).toContainText('Issued');
  await expect(row).toContainText('12 months');
});

test('allocation override: reason required, cannot exceed amount, completed apps protected, balances reflect the change', async ({ page }) => {
  await login(page, 'accounts');
  // Completed application (Al-Waha 2023) must stay fully paid.
  const waha = await findApp(page, 'Al-Waha', '2023');
  const wp = (await listEntity(page, 'Payment', { company_id: waha.company_id, payment_method: 'bank_transfer', payment_status: 'verified' }))[0];
  await page.goto(`/records/Payment/${wp.id}`);
  await page.getByTestId('payment-override').click();
  await page.getByTestId('alloc-2023').fill('5000');
  await page.getByTestId('payment-dialog-text').fill('Test');
  await page.getByTestId('payment-dialog-confirm').click();
  await expect(dialog(page)).toContainText(/is completed; this allocation would leave 3,000 KWD outstanding/);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Open application (KNI 2023, due 96,000) with the verified 50,000 cheque.
  const kni = await findApp(page, 'Kuwait National', '2023');
  const p = (await listEntity(page, 'Payment', { company_id: kni.company_id, payment_status: 'verified' })).find((x) => x.payment_amount === 50000);
  await page.goto(`/records/Payment/${p.id}`);
  await page.getByTestId('payment-override').click();
  await expect(page.getByTestId('alloc-2023')).toHaveValue('50000');
  await page.getByTestId('alloc-2023').fill('60000');
  await expect(dialog(page)).toContainText('exceeds the payment amount');
  await expect(page.getByTestId('payment-dialog-confirm')).toBeDisabled();
  await page.getByTestId('alloc-2023').fill('30000');
  await expect(page.getByTestId('payment-dialog-confirm')).toBeDisabled();
  await page.getByTestId('payment-dialog-text').fill('Company asked to hold 20,000 as credit');
  await page.getByTestId('payment-dialog-confirm').click();
  await expect(page.getByText('Allocation updated.')).toBeVisible();
  await expect(page.getByTestId('allocations')).toContainText(fmt(30000));
  await expect(page.getByTestId('allocations')).toContainText('Manual');

  await login(page, 'manager');
  const bal = (await fn(page, 'companyBalances', { company_id: kni.company_id })).body;
  const row = bal.rows.find((r) => r.application_id === kni.id);
  expect(row.remaining).toBe(66000);
  expect(bal.unallocated_credit).toBe(20000);
  await page.goto(`/applications/${kni.id}`);
  await page.getByTestId('tab-payments').click();
  const table = page.getByTestId('balance-table');
  await expect(table.getByRole('row').filter({ hasText: kni.application_reference })).toContainText(fmt(66000));
  await expect(page.getByTestId('balance-panel')).toContainText('Unallocated credit');
  await expect(page.getByTestId('balance-panel')).toContainText(fmt(bal.total_remaining));
  await page.goto(`/companies/${kni.company_id}`);
  await page.getByTestId('company-tab-balance').click();
  await expect(page.getByTestId('balance-table')).toContainText(fmt(66000));
});

test('rep is notified when an online payment fails', async ({ page }) => {
  await login(page, 'repWaha');
  const notes = (await fn(page, 'companyStatus', {})).status;
  expect(notes).toBe(200);
  const list = await listEntity(page, 'Notification', { category: 'payment' });
  expect(list.some((n) => /failed/.test(n.title))).toBeTruthy();
});
