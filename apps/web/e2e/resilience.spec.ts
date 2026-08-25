import { chmod } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createAdminApi } from './support/api';
import { createSignerApi } from './support/signer-api';
import {
  corruptDocumentAuditHash,
  waitForInspectRetry,
  withAuditInsertFailure,
} from './support/db';
import { objectStorageRoot } from './env';
import { auditVerificationReportSchema } from '@esign/contracts';

test.describe('resilience', { tag: ['@resilience', '@regression'] }, () => {
  test('worker retries inspection after a transient object-storage outage', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId, {
      title: `Retry ${crypto.randomUUID()}`,
    });
    try {
      await chmod(objectStorageRoot, 0o000);
      await waitForInspectRetry(draft.documentId).catch(() => undefined);
    } finally {
      await chmod(objectStorageRoot, 0o755);
    }
    const inspected = await api.waitForInspection(admin.organizationId, draft.documentId);
    expect(inspected.inspectionStatus).toBe('accepted');
  });

  test('corrupt source PDF is rejected by inspection', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId, {
      extra: '%ESIGN-LOCAL-REJECT%',
    });
    const inspected = await api.waitForInspection(
      admin.organizationId,
      draft.documentId,
      'rejected',
    );
    expect(inspected.inspectionStatus).toBe('rejected');
    expect(inspected.availableForSigning).toBe(false);
  });

  test('invalid signature field is rejected', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId);
    await api.waitForInspection(admin.organizationId, draft.documentId);
    const { signerId } = await api.addSignerAndSignatureField(
      admin.organizationId,
      draft.documentId,
    );
    const invalid = await api.raw(
      'PUT',
      `/organizations/${admin.organizationId}/documents/${draft.documentId}/fields`,
      {
        data: {
          fields: [
            {
              signerId,
              type: 'signature',
              pageNumber: 99,
              x: 0.1,
              y: 0.1,
              width: 0.2,
              height: 0.1,
            },
          ],
        },
      },
    );
    expect(invalid.status()).toBe(400);
  });

  test('object-storage outage fails closed on upload', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    await chmod(objectStorageRoot, 0o000);
    try {
      await expect(
        api.createAndUploadPdf(admin.organizationId, { title: `Outage ${crypto.randomUUID()}` }),
      ).rejects.toThrow(/upload source PDF failed/i);
    } finally {
      await chmod(objectStorageRoot, 0o755);
    }
  });

  test('concurrent send of the same document yields one success', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId);
    await api.waitForInspection(admin.organizationId, draft.documentId);
    await api.addSignerAndSignatureField(admin.organizationId, draft.documentId);
    const [first, second] = await Promise.all([
      api.raw('POST', `/organizations/${admin.organizationId}/documents/${draft.documentId}/send`, {
        data: {},
        headers: { 'idempotency-key': `send-a-${crypto.randomUUID()}` },
      }),
      api.raw('POST', `/organizations/${admin.organizationId}/documents/${draft.documentId}/send`, {
        data: {},
        headers: { 'idempotency-key': `send-b-${crypto.randomUUID()}` },
      }),
    ]);
    const statuses = [first.status(), second.status()];
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);
  });

  test('database transaction failure leaves the document unsent', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId);
    await api.waitForInspection(admin.organizationId, draft.documentId);
    await api.addSignerAndSignatureField(admin.organizationId, draft.documentId);
    await withAuditInsertFailure(draft.documentId, async () => {
      const failed = await api.raw(
        'POST',
        `/organizations/${admin.organizationId}/documents/${draft.documentId}/send`,
        {
          data: {},
          headers: { 'idempotency-key': `send-fail-${crypto.randomUUID()}` },
        },
      );
      expect(failed.status()).toBe(500);
    });
    const after = await api.getDocument(admin.organizationId, draft.documentId);
    expect(after.document?.state).toBe('prepared');
  });

  test('audit verification reports a corrupted chain', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const draft = await api.createAndUploadPdf(admin.organizationId);
    await api.waitForInspection(admin.organizationId, draft.documentId);
    await corruptDocumentAuditHash(draft.documentId);
    const verification = await api.verifyAudit(admin.organizationId, draft.documentId);
    expect(verification.status).toBe(200);
    const report = auditVerificationReportSchema.parse(verification.body);
    expect(report.ok).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
  });

  test('two concurrent finalization requests keep a single outcome', async ({ request }) => {
    const api = createAdminApi(request);
    const admin = await api.login();
    const envelope = await api.prepareEnvelope(admin.organizationId);
    const signer = createSignerApi(request);
    expect((await signer.exchange(envelope.token)).status()).toBe(200);
    await signer.recordConsent();
    const [first, second] = await Promise.all([
      signer.complete({ idempotencyKey: crypto.randomUUID() }),
      signer.complete({ idempotencyKey: crypto.randomUUID() }),
    ]);
    const statuses = [first.status(), second.status()].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    await api.waitForState(admin.organizationId, envelope.documentId, 'finalized');
    const downloaded = await api.downloadArtifact(admin.organizationId, envelope.documentId);
    expect(downloaded.status).toBe(200);
  });
});
