import { expect, type Page } from '@playwright/test';

export async function drawOnCanvas(
  page: Page,
  pointerType: 'mouse' | 'touch' = 'mouse',
): Promise<void> {
  const canvas = page.getByRole('application', { name: 'Signature' });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('signature canvas was not visible');
  }
  if (pointerType === 'mouse') {
    await canvas.hover({ position: { x: 24, y: 24 } });
    await page.mouse.down();
    await canvas.hover({ position: { x: 80, y: 36 } });
    await page.mouse.move(box.x + 120, box.y + 48, { steps: 12 });
    await page.mouse.up();
    return;
  }
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType,
    clientX: box.x + 20,
    clientY: box.y + 20,
    pressure: 0.6,
    bubbles: true,
    cancelable: true,
    isPrimary: true,
  });
  for (let index = 1; index <= 10; index += 1) {
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType,
      clientX: box.x + 20 + index * 6,
      clientY: box.y + 20 + index * 2,
      pressure: 0.6,
      bubbles: true,
      cancelable: true,
      isPrimary: true,
    });
  }
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType,
    clientX: box.x + 80,
    clientY: box.y + 40,
    pressure: 0.6,
    bubbles: true,
    cancelable: true,
    isPrimary: true,
  });
}

export async function completeConsentAndIntent(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'I agree to this disclosure' }).click();
  await page.getByRole('checkbox', { name: 'I intend to sign this document.' }).check();
}

export async function openSigningWithToken(page: Page, token: string): Promise<void> {
  await page.goto(`/signing?token=${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/signing$/);
}

export async function signInBrowser(page: Page, token: string): Promise<void> {
  await openSigningWithToken(page, token);
  await expect(page.getByRole('heading', { name: 'Sign document' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Document preview' })).toBeVisible();
  await drawOnCanvas(page, 'mouse');
  await completeConsentAndIntent(page);
  await expect(page.getByRole('button', { name: 'Review and submit' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit signature' }).click();
  await expect(
    page.getByRole('heading', { name: /Submitting your signature|Signing complete/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Signing complete' })).toBeVisible({
    timeout: 30_000,
  });
}
