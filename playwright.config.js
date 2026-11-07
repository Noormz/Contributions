// UI end-to-end tests against an isolated, freshly seeded stack (API :3399, web :5399).
import { defineConfig } from '@playwright/test';

const DATA_DIR = process.env.E2E_DATA_DIR || 'data-e2e';
const API = process.env.E2E_API_PORT || '3399';
const WEB = process.env.E2E_WEB_PORT || '5399';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: process.env.E2E_OUT || 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: `node server/seed.js && node server/index.js`,
      url: `http://localhost:${API}/api/health`,
      env: { DATA_DIR, PORT: API, APP_URL: `http://localhost:${WEB}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Production build via `vite preview` (no HMR, so source edits cannot reload pages mid-test).
      command: `npx vite build --outDir .build-e2e-${WEB} --emptyOutDir && npx vite preview --outDir .build-e2e-${WEB} --port ${WEB} --strictPort`,
      url: `http://localhost:${WEB}`,
      env: { VITE_API_TARGET: `http://localhost:${API}`, VITE_CACHE_DIR: `node_modules/.vite-${WEB}` },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
