import { expect, test, type Page, type Route } from '@playwright/test';

const SESSION = {
  documentId: '11111111-1111-4111-8111-111111111111',
  signerId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  sessionStatus: 'active',
  title: 'Offer letter',
  signingMode: 'ordered',
  expiresAt: '2026-12-01T00:00:00.000Z',
  signerDisplayName: 'Alex Signer',
  signerStatus: 'pending',
  consentRequired: true,
  consented: false,
};

const FIELD = {
  fieldId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'signature',
  pageNumber: 1,
  x: 0.1,
  y: 0.2,
  width: 0.4,
  height: 0.15,
  required: true,
};

async function mockSigningApi(page: Page, options?: { failSessionOnce?: boolean }): Promise<void> {
  let sessionFailed = false;
  await page.route(/\/signing\/api(?:\/|$)/, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (url.searchParams.has('token')) {
      throw new Error('signing API request included a token query string');
    }

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { Allow: 'GET,POST,OPTIONS' } });
      return;
    }

    if (path.includes('/exchange') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: SESSION.sessionId, expiresAt: SESSION.expiresAt }),
        headers: {
          'set-cookie': 'esign_sign_csrf=test-csrf; Path=/signing; SameSite=Strict',
        },
      });
      return;
    }

    if (path.includes('/session') && method === 'GET') {
      if (options?.failSessionOnce && !sessionFailed) {
        sessionFailed = true;
        await route.abort('connectionrefused');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SESSION),
      });
      return;
    }

    if (path.endsWith('/document')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documentId: SESSION.documentId,
          title: SESSION.title,
          signingMode: SESSION.signingMode,
          pageCount: 1,
          signerDisplayName: SESSION.signerDisplayName,
        }),
      });
      return;
    }

    if (path.endsWith('/fields')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fields: [FIELD] }),
      });
      return;
    }

    if (path.endsWith('/consent') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          copyId: 'esign-consent-v3',
          version: '3.2.1',
          title: 'Electronic signature consent',
          text: 'Exact disclosure text from the API.',
          required: true,
          accepted: false,
        }),
      });
      return;
    }

    if (path.endsWith('/consent') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          consentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          copyId: 'esign-consent-v3',
          acceptedAt: '2026-08-18T00:00:00.000Z',
        }),
      });
      return;
    }

    if (path.endsWith('/previews')) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          url: '/document-previews/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          expiresAt: '2026-08-18T00:05:00.000Z',
          tokenHeader: 'x-preview-token',
          token: 'preview-token',
          contentType: 'application/pdf',
        }),
      });
      return;
    }

    if (path.includes('/document-previews/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4',
        headers: { 'Cache-Control': 'no-store' },
      });
      return;
    }

    if (path.endsWith('/viewed')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ viewed: true }),
      });
      return;
    }

    if (path.endsWith('/complete')) {
      const body = route.request().postData() ?? '';
      if (body.includes('organizationId') || body.includes('pageNumber')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'accepted' }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

async function completeConsentAndIntent(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'I agree to this disclosure' }).click();
  await page.getByRole('checkbox', { name: 'I intend to sign this document.' }).check();
}

async function drawOnCanvas(page: Page, pointerType: 'mouse' | 'touch'): Promise<void> {
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

test(
  'signing page sends no-store and no-referrer',
  { tag: ['@smoke', '@security'] },
  async ({ page }) => {
    await mockSigningApi(page);
    const response = await page.goto('/signing');
    expect(response).not.toBeNull();
    const headers = response?.headers() ?? {};
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
  },
);

test(
  'mouse drawing, consent version, and review-before-submit',
  { tag: ['@regression'] },
  async ({ page }) => {
    await mockSigningApi(page);
    await page.goto('/signing?token=fixture-token');
    await expect(page.getByRole('heading', { name: 'Sign document' })).toBeVisible();
    await expect(page).toHaveURL(/\/signing$/);
    await expect(page.getByText('Consent version 3.2.1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
    await drawOnCanvas(page, 'mouse');
    await completeConsentAndIntent(page);
    await expect(page.getByRole('button', { name: 'Review and submit' })).toBeEnabled();
    await page.getByRole('button', { name: 'Review and submit' }).click();
    await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible();
    await page.getByRole('button', { name: 'Submit signature' }).click();
    await expect(page.getByRole('heading', { name: 'Signing complete' })).toBeVisible();
  },
);

test(
  'touch-like pointer input can capture a signature',
  { tag: ['@regression'] },
  async ({ page }) => {
    await mockSigningApi(page);
    await page.goto('/signing?token=fixture-token');
    await expect(page.getByRole('heading', { name: 'Sign document' })).toBeVisible();
    await drawOnCanvas(page, 'touch');
    await completeConsentAndIntent(page);
    await expect(page.getByRole('button', { name: 'Review and submit' })).toBeEnabled();
  },
);

test(
  'network failure offers a safe retry',
  { tag: ['@resilience', '@regression'] },
  async ({ page }) => {
    await mockSigningApi(page, { failSessionOnce: true });
    await page.goto('/signing');
    await expect(page.getByRole('heading', { name: 'Connection interrupted' })).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Sign document' })).toBeVisible();
  },
);
