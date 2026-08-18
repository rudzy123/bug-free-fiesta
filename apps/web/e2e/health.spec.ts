import { expect, test } from '@playwright/test';

test('health page is available and labeled', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByRole('heading', { name: 'Web health' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('running');
});

test('health JSON handler returns ok', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { status: string; service: string };
  expect(body.status).toBe('ok');
  expect(body.service).toBe('web');
});
