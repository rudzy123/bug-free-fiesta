import { expect, test } from '@playwright/test';
import { publicDocumentSchema } from '@esign/contracts';
import { seedIds } from '@esign/database';
import { createAdminApi } from './support/api';
import { createSignerApi } from './support/signer-api';
import { expireSigningSession } from './support/db';
import { openSigningWithToken } from './support/ui';
import { E2E_ADMIN_EMAIL, E2E_OTHER_ADMIN_EMAIL } from './env';

test.describe('signing and tenant security', { tag: ['@security', '@regression'] }, () => {
  test('expired link cannot be exchanged', async ({ page, request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    await expireSigningSession(envelope.sessionId);
    await openSigningWithToken(page, envelope.token);
    await expect(page.getByRole('heading', { name: /not available|has ended/i })).toBeVisible();
  });

  test('revoked link cannot be used', async ({ page, request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    await api.revokeSession(admin.organizationId, envelope.documentId, envelope.sessionId);
    await openSigningWithToken(page, envelope.token);
    await expect(page.getByRole('heading', { name: /not available/i })).toBeVisible();
  });

  test('one-time exchange token cannot be reused', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    expect((await signer.exchange(envelope.token)).status()).toBe(401);
  });

  test('ordered signer two cannot act before signer one', async ({ request, playwright }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId);
    await api.waitForInspection(admin.organizationId, draft.documentId);
    const signersResponse = await api.raw(
      'PUT',
      `/organizations/${admin.organizationId}/documents/${draft.documentId}/signers`,
      {
        data: {
          signingMode: 'ordered',
          signers: [
            {
              email: `first-${crypto.randomUUID()}@example.test`,
              displayName: 'First Signer',
              routingOrder: 1,
            },
            {
              email: `second-${crypto.randomUUID()}@example.test`,
              displayName: 'Second Signer',
              routingOrder: 2,
            },
          ],
        },
      },
    );
    expect(signersResponse.status()).toBe(200);
    const signersBody = publicDocumentSchema.parse(await signersResponse.json());
    const firstId = signersBody.signers[0]?.signerId;
    const secondId = signersBody.signers[1]?.signerId;
    if (firstId === undefined || secondId === undefined) {
      throw new Error('expected two signers');
    }
    const fields = await api.raw(
      'PUT',
      `/organizations/${admin.organizationId}/documents/${draft.documentId}/fields`,
      {
        data: {
          fields: [
            {
              signerId: firstId,
              type: 'signature',
              pageNumber: 1,
              x: 0.1,
              y: 0.1,
              width: 0.2,
              height: 0.1,
            },
            {
              signerId: secondId,
              type: 'signature',
              pageNumber: 1,
              x: 0.5,
              y: 0.1,
              width: 0.2,
              height: 0.1,
            },
          ],
        },
      },
    );
    expect(fields.status()).toBe(200);
    const sent = await api.send(admin.organizationId, draft.documentId);
    const secondInvite = sent.invitations.find((row) => row.signerId === secondId);
    if (secondInvite?.token === null || secondInvite === undefined) {
      throw new Error('missing second invitation');
    }
    const other = await playwright.request.newContext();
    try {
      const signer = createSignerApi(other);
      expect((await signer.exchange(secondInvite.token)).status()).toBe(200);
      await signer.recordConsent();
      expect((await signer.complete()).status()).toBe(409);
    } finally {
      await other.dispose();
    }
  });

  test('tampered document id is not found', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const unknown = crypto.randomUUID();
    const loaded = await api.getDocument(admin.organizationId, unknown);
    expect(loaded.status).toBe(404);
  });

  test('cross-tenant document access is denied', async ({ request, playwright }) => {
    const api = createAdminApi(request);
    await api.login(E2E_ADMIN_EMAIL);
    const wrongOrgPath = await api.getDocument(seedIds.orgNorth, seedIds.documentSouth);
    expect(wrongOrgPath.status).toBe(404);

    const other = await playwright.request.newContext();
    try {
      const beau = createAdminApi(other);
      await beau.login(E2E_OTHER_ADMIN_EMAIL);
      const cross = await beau.getDocument(seedIds.orgNorth, seedIds.documentNorth);
      expect([403, 404]).toContain(cross.status);
    } finally {
      await other.dispose();
    }
  });

  test('missing consent is rejected', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    expect((await signer.complete()).status()).toBe(400);
  });

  test('empty signature is rejected', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    await signer.recordConsent();
    expect((await signer.complete({ includeSignature: false })).status()).toBe(400);
  });

  test('oversized signature is rejected', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    await signer.recordConsent();
    const png = new Uint8Array(260_000);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;
    png[4] = 0x0d;
    png[5] = 0x0a;
    png[6] = 0x1a;
    png[7] = 0x0a;
    const status = (await signer.complete({ png })).status();
    expect([400, 413]).toContain(status);
  });

  test('signer cannot submit another signer field', async ({ request, playwright }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId);
    await api.waitForInspection(admin.organizationId, draft.documentId);
    const signersResponse = await api.raw(
      'PUT',
      `/organizations/${admin.organizationId}/documents/${draft.documentId}/signers`,
      {
        data: {
          signingMode: 'ordered',
          signers: [
            {
              email: `first-${crypto.randomUUID()}@example.test`,
              displayName: 'First Signer',
              routingOrder: 1,
            },
            {
              email: `second-${crypto.randomUUID()}@example.test`,
              displayName: 'Second Signer',
              routingOrder: 2,
            },
          ],
        },
      },
    );
    expect(signersResponse.status()).toBe(200);
    const signersBody = publicDocumentSchema.parse(await signersResponse.json());
    const firstId = signersBody.signers[0]?.signerId;
    const secondId = signersBody.signers[1]?.signerId;
    if (firstId === undefined || secondId === undefined) {
      throw new Error('expected two signers');
    }
    const fields = await api.raw(
      'PUT',
      `/organizations/${admin.organizationId}/documents/${draft.documentId}/fields`,
      {
        data: {
          fields: [
            {
              signerId: firstId,
              type: 'signature',
              pageNumber: 1,
              x: 0.1,
              y: 0.1,
              width: 0.2,
              height: 0.1,
            },
            {
              signerId: secondId,
              type: 'signature',
              pageNumber: 1,
              x: 0.5,
              y: 0.1,
              width: 0.2,
              height: 0.1,
            },
          ],
        },
      },
    );
    expect(fields.status()).toBe(200);
    const fieldBody = publicDocumentSchema.parse(await fields.json());
    const secondFieldId = fieldBody.fields.find((field) => field.signerId === secondId)?.fieldId;
    if (secondFieldId === undefined) {
      throw new Error('missing second signer field');
    }
    const sent = await api.send(admin.organizationId, draft.documentId);
    const firstInvite = sent.invitations.find((row) => row.signerId === firstId);
    if (firstInvite?.token === null || firstInvite === undefined) {
      throw new Error('missing first invitation');
    }
    const other = await playwright.request.newContext();
    try {
      const signer = createSignerApi(other);
      expect((await signer.exchange(firstInvite.token)).status()).toBe(200);
      await signer.recordConsent();
      expect((await signer.complete({ fieldIds: [secondFieldId] })).status()).toBe(400);
    } finally {
      await other.dispose();
    }
  });

  test('duplicate submit replays the same outcome', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    await signer.recordConsent();
    const key = crypto.randomUUID();
    const first = await signer.complete({ idempotencyKey: key });
    expect(first.status()).toBe(200);
    const second = await signer.complete({ idempotencyKey: key });
    expect(second.status()).toBe(200);
  });

  test('complete rejects client-supplied document ids', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    await signer.recordConsent();
    const response = await signer.complete({
      extra: { documentId: crypto.randomUUID() },
    });
    expect(response.status()).toBe(400);
  });

  test('document voided while the signer page is open', async ({ page, request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    await openSigningWithToken(page, envelope.token);
    await expect(page.getByRole('heading', { name: 'Sign document' })).toBeVisible();
    await api.voidDocument(admin.organizationId, envelope.documentId);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /not available|no longer available/i }),
    ).toBeVisible();
  });
});
