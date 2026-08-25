import { defineConfig, devices } from '@playwright/test';
import {
  E2E_API_ORIGIN,
  E2E_WEB_ORIGIN,
  E2E_WORKER_ORIGIN,
  e2eApiEnv,
  e2eWebEnv,
  e2eWorkerEnv,
  mergeProcessEnv,
  repoRoot,
} from './e2e/env';

process.env['DATABASE_URL'] ??= e2eApiEnv()['DATABASE_URL'];

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/redact-artifacts.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }], ['list']]
    : [['list']],
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @esign/api exec tsx src/index.ts',
      cwd: repoRoot,
      url: `${E2E_API_ORIGIN}/health/live`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: mergeProcessEnv(e2eApiEnv()),
    },
    {
      command: 'pnpm --filter @esign/worker exec tsx src/index.ts',
      cwd: repoRoot,
      url: `${E2E_WORKER_ORIGIN}/health/live`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: mergeProcessEnv(e2eWorkerEnv()),
    },
    {
      command: 'pnpm --filter @esign/web exec next dev --port 3000',
      cwd: repoRoot,
      url: `${E2E_WEB_ORIGIN}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: mergeProcessEnv(e2eWebEnv()),
    },
  ],
});
