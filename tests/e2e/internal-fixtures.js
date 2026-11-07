// Fixtures for the internal-workflow specs: fails a test on any page error or
// console error (expected 4xx resource logs are ignored), plus data lookups.
import { test as base, expect } from '@playwright/test';
import { api } from './helpers.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource: the server responded with a status of 4\d\d/.test(t)) return;
      errors.push(`console: ${t}`);
    });
    await use(page);
    expect(errors, 'browser errors').toEqual([]);
  },
});
export { expect };

const q = (o) => encodeURIComponent(JSON.stringify(o));

export async function findApp(page, company, year) {
  const r = await api(page, 'GET', `/api/entities/ContributionApplication?q=${q({ company_name: { $regex: company }, financial_year: year })}`);
  expect(r.status).toBe(200);
  const a = r.body.items[0];
  expect(a, `${company} ${year}`).toBeTruthy();
  return a;
}

export async function getEntity(page, entity, id) {
  const r = await api(page, 'GET', `/api/entities/${entity}/${id}`);
  expect(r.status, `${entity} ${id}`).toBe(200);
  return r.body;
}

export async function listEntity(page, entity, query = {}) {
  const r = await api(page, 'GET', `/api/entities/${entity}?q=${q(query)}&limit=500`);
  expect(r.status).toBe(200);
  return r.body.items;
}

export async function fn(page, name, params = {}) {
  const r = await api(page, 'POST', `/api/functions/${name}`, params);
  return r;
}

// Picks an option in a Radix Select whose trigger has the given test id.
export async function pick(page, triggerTestId, optionName, scope) {
  await (scope || page).getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionName }).first().click();
}

export const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
