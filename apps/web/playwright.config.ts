import { defineConfig, devices } from '@playwright/test';
import {
  E2E_API_ORIGIN,
  E2E_WEB_ORIGIN,
  E2E_WORKER_ORIGIN,
  e2eApiEnv,
  e2eWebEnv,
  e2eWorkerEnv,
  repoRoot,
} from './e2e/env';

process.env['DATABASE_URL'] ??= e2eApiEnv()['DATABASE_URL'];

function mergeEnv(overrides: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return { ...merged, ...overrides };
}

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
  retries: process.env['CI'] ? 2 : 0,
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
      reuseExistingServer: false,
      timeout: 120_000,
      env: mergeEnv(e2eApiEnv()),
    },
    {
      command: 'pnpm --filter @esign/worker exec tsx src/index.ts',
      cwd: repoRoot,
      url: `${E2E_WORKER_ORIGIN}/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: mergeEnv(e2eWorkerEnv()),
    },
    {
      command: 'pnpm --filter @esign/web dev',
      cwd: repoRoot,
      url: `${E2E_WEB_ORIGIN}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: mergeEnv(e2eWebEnv()),
    },
  ],
});
