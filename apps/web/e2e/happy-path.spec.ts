import { expect, test } from '@playwright/test';
import { auditVerificationReportSchema } from '@esign/contracts';
import { pollUntil } from '@esign/test-utils';
import { createAdminApi } from './support/api';
import { signInBrowser } from './support/ui';
import { E2E_ADMIN_EMAIL } from './env';

test(
  'admin send through signer completion and audit verification',
  {
    tag: ['@smoke', '@regression'],
  },
  async ({ page, request }) => {
    const api = createAdminApi(request);
    const admin = await api.login(E2E_ADMIN_EMAIL);
    expect(admin.organizationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const draft = await api.createAndUploadPdf(admin.organizationId, {
      title: `Happy path ${crypto.randomUUID()}`,
    });
    const inspected = await api.waitForInspection(admin.organizationId, draft.documentId);
    expect(inspected.inspectionStatus).toBe('accepted');

    const { signerId, fieldId } = await api.addSignerAndSignatureField(
      admin.organizationId,
      draft.documentId,
    );
    expect(signerId).toBeTruthy();
    expect(fieldId).toBeTruthy();

    const sent = await api.send(admin.organizationId, draft.documentId);
    const invitation = sent.invitations[0];
    if (invitation === undefined || invitation.token === null) {
      throw new Error('send omitted the one-time signing token');
    }
    expect(sent.state).toBe('sent');

    await signInBrowser(page, invitation.token);
    await expect(page).not.toHaveURL(/token=/);

    const processing = await pollUntil(
      async () => (await api.getDocument(admin.organizationId, draft.documentId)).document,
      (document) =>
        document !== null &&
        (document.state === 'completed' ||
          document.state === 'finalizing' ||
          document.state === 'finalized'),
      {
        timeoutMs: 20_000,
        intervalMs: 200,
        message: 'document did not enter post-sign processing',
      },
    );
    expect(processing).not.toBeNull();

    const finalized = await api.waitForState(admin.organizationId, draft.documentId, 'finalized');
    expect(finalized.state).toBe('finalized');

    const downloaded = await api.downloadArtifact(admin.organizationId, draft.documentId);
    expect(downloaded.status).toBe(200);
    expect(downloaded.contentType).toContain('application/pdf');
    expect(downloaded.body.subarray(0, 5).toString()).toBe('%PDF-');

    const verification = await api.verifyAudit(admin.organizationId, draft.documentId);
    expect(verification.status).toBe(200);
    const report = auditVerificationReportSchema.parse(verification.body);
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  },
);
