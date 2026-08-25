import type { APIRequestContext, APIResponse } from '@playwright/test';
import {
  createDocumentResponseSchema,
  currentAccountUserResponseSchema,
  publicDocumentSchema,
  sendDocumentResponseSchema,
  type CreateDocumentResponse,
  type SendDocumentResponse,
} from '@esign/contracts';
import { createTestPdf, pollUntil } from '@esign/test-utils';
import { seedIds } from '@esign/database';
import {
  E2E_ADMIN_EMAIL,
  E2E_API_ORIGIN,
  E2E_LOCAL_SECRET,
  E2E_OTHER_ADMIN_EMAIL,
  E2E_WEB_ORIGIN,
} from '../env';

type PublicDocument = ReturnType<typeof publicDocumentSchema.parse>;

export type AdminSession = {
  readonly email: string;
  readonly organizationId: string;
};

export type PreparedEnvelope = {
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
  readonly token: string;
  readonly fieldId: string;
};

function requireOk(response: APIResponse, action: string): void {
  if (response.ok()) {
    return;
  }
  throw new Error(`${action} failed with HTTP ${response.status()}`);
}

async function csrfToken(request: APIRequestContext): Promise<string> {
  const state = await request.storageState();
  const cookie = state.cookies.find((entry) => entry.name === 'esign_csrf');
  if (cookie === undefined || cookie.value === '') {
    throw new Error('missing CSRF cookie');
  }
  return cookie.value;
}

export function createAdminApi(request: APIRequestContext) {
  const mutationHeaders = async (
    extra: Record<string, string> = {},
  ): Promise<Record<string, string>> => ({
    Origin: E2E_WEB_ORIGIN,
    'content-type': 'application/json',
    'x-csrf-token': await csrfToken(request),
    ...extra,
  });

  return {
    async login(email: string = E2E_ADMIN_EMAIL): Promise<AdminSession> {
      const response = await request.post(`${E2E_API_ORIGIN}/auth/login`, {
        headers: { Origin: E2E_WEB_ORIGIN, 'content-type': 'application/json' },
        data: { email, secret: E2E_LOCAL_SECRET },
      });
      requireOk(response, 'login');
      const me = await request.get(`${E2E_API_ORIGIN}/auth/me`);
      requireOk(me, 'load current user');
      const body = currentAccountUserResponseSchema.parse(await me.json());
      const membership = body.memberships.find((row) =>
        email === E2E_OTHER_ADMIN_EMAIL
          ? row.organizationId === seedIds.orgSouth
          : row.organizationId === seedIds.orgNorth && row.role === 'owner',
      );
      if (membership === undefined) {
        throw new Error('login succeeded without an owner membership');
      }
      return { email, organizationId: membership.organizationId };
    },

    async getDocument(
      organizationId: string,
      documentId: string,
    ): Promise<{ status: number; document: PublicDocument | null }> {
      const response = await request.get(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}`,
      );
      if (!response.ok()) {
        return { status: response.status(), document: null };
      }
      return {
        status: response.status(),
        document: publicDocumentSchema.parse(await response.json()),
      };
    },

    async waitForInspection(
      organizationId: string,
      documentId: string,
      status: 'accepted' | 'rejected' = 'accepted',
    ): Promise<PublicDocument> {
      return pollUntil(
        async () => {
          const loaded = await this.getDocument(organizationId, documentId);
          if (loaded.document === null) {
            throw new Error(`document ${documentId} was not found while waiting for inspection`);
          }
          return loaded.document;
        },
        (document) => document.inspectionStatus === status,
        {
          timeoutMs: 20_000,
          intervalMs: 200,
          message: `inspection did not become ${status}`,
        },
      );
    },

    async waitForState(
      organizationId: string,
      documentId: string,
      state: string,
    ): Promise<PublicDocument> {
      return pollUntil(
        async () => {
          const loaded = await this.getDocument(organizationId, documentId);
          if (loaded.document === null) {
            throw new Error(`document ${documentId} was not found while waiting for state`);
          }
          return loaded.document;
        },
        (document) => document.state === state,
        {
          timeoutMs: 30_000,
          intervalMs: 250,
          message: `document state did not become ${state}`,
        },
      );
    },

    async createAndUploadPdf(
      organizationId: string,
      options: { title?: string; extra?: string; bytes?: Uint8Array } = {},
    ): Promise<CreateDocumentResponse> {
      const created = await request.post(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents`,
        {
          headers: await mutationHeaders({
            'idempotency-key': `create-${crypto.randomUUID()}`,
          }),
          data: {
            title: options.title ?? `E2E ${crypto.randomUUID()}`,
            filename: 'agreement.pdf',
          },
        },
      );
      requireOk(created, 'create draft');
      const draft = createDocumentResponseSchema.parse(await created.json());
      if (draft.upload.token === null) {
        throw new Error('create draft omitted the upload token');
      }
      const pdf = options.bytes ?? (await createTestPdf({ pageCount: 1 }));
      const body = options.extra === undefined ? pdf : concatPdfMarker(pdf, options.extra);
      const uploaded = await request.put(`${E2E_API_ORIGIN}${draft.upload.url}`, {
        headers: {
          'content-type': 'application/pdf',
          [draft.upload.tokenHeader]: draft.upload.token,
        },
        data: Buffer.from(body),
      });
      requireOk(uploaded, 'upload source PDF');
      return draft;
    },

    async addSignerAndSignatureField(
      organizationId: string,
      documentId: string,
      options: {
        email?: string;
        displayName?: string;
        pageNumber?: number;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      } = {},
    ): Promise<{ signerId: string; fieldId: string }> {
      const signers = await request.put(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/signers`,
        {
          headers: await mutationHeaders(),
          data: {
            signingMode: 'ordered',
            signers: [
              {
                email: options.email ?? `signer-${crypto.randomUUID()}@example.test`,
                displayName: options.displayName ?? 'Alex Signer',
                routingOrder: 1,
              },
            ],
          },
        },
      );
      requireOk(signers, 'replace signers');
      const withSigners = publicDocumentSchema.parse(await signers.json());
      const signerId = withSigners.signers[0]?.signerId;
      if (signerId === undefined) {
        throw new Error('replace signers returned no signer');
      }
      const fields = await request.put(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/fields`,
        {
          headers: await mutationHeaders(),
          data: {
            fields: [
              {
                signerId,
                type: 'signature',
                pageNumber: options.pageNumber ?? 1,
                x: options.x ?? 0.1,
                y: options.y ?? 0.1,
                width: options.width ?? 0.25,
                height: options.height ?? 0.1,
              },
            ],
          },
        },
      );
      requireOk(fields, 'replace fields');
      const withFields = publicDocumentSchema.parse(await fields.json());
      const fieldId = withFields.fields[0]?.fieldId;
      if (fieldId === undefined) {
        throw new Error('replace fields returned no field');
      }
      return { signerId, fieldId };
    },

    async send(organizationId: string, documentId: string): Promise<SendDocumentResponse> {
      const response = await request.post(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/send`,
        {
          headers: await mutationHeaders({
            'idempotency-key': `send-${crypto.randomUUID()}`,
          }),
          data: {},
        },
      );
      requireOk(response, 'send document');
      return sendDocumentResponseSchema.parse(await response.json());
    },

    async prepareEnvelope(
      organizationId: string,
      options: { title?: string } = {},
    ): Promise<PreparedEnvelope> {
      const draft = await this.createAndUploadPdf(
        organizationId,
        options.title === undefined ? {} : { title: options.title },
      );
      await this.waitForInspection(organizationId, draft.documentId);
      const { signerId, fieldId } = await this.addSignerAndSignatureField(
        organizationId,
        draft.documentId,
      );
      const sent = await this.send(organizationId, draft.documentId);
      const invitation = sent.invitations[0];
      if (invitation === undefined || invitation.token === null) {
        throw new Error('send omitted the one-time signing token');
      }
      return {
        documentId: draft.documentId,
        signerId,
        sessionId: invitation.sessionId,
        token: invitation.token,
        fieldId,
      };
    },

    async voidDocument(organizationId: string, documentId: string): Promise<PublicDocument> {
      const response = await request.post(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/void`,
        {
          headers: await mutationHeaders({
            'idempotency-key': `void-${crypto.randomUUID()}`,
          }),
          data: {},
        },
      );
      requireOk(response, 'void document');
      return publicDocumentSchema.parse(await response.json());
    },

    async revokeSession(
      organizationId: string,
      documentId: string,
      sessionId: string,
    ): Promise<void> {
      const response = await request.post(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/sessions/${sessionId}/revoke`,
        {
          headers: await mutationHeaders(),
          data: {},
        },
      );
      requireOk(response, 'revoke session');
    },

    async verifyAudit(
      organizationId: string,
      documentId: string,
    ): Promise<{
      ok: boolean;
      status: number;
      body: unknown;
    }> {
      const response = await request.post(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/audit/verify`,
        {
          headers: await mutationHeaders(),
          data: {},
        },
      );
      return { ok: response.ok(), status: response.status(), body: await response.json() };
    },

    async downloadArtifact(
      organizationId: string,
      documentId: string,
    ): Promise<{ status: number; body: Buffer; contentType: string | undefined }> {
      const response = await request.get(
        `${E2E_API_ORIGIN}/organizations/${organizationId}/documents/${documentId}/artifact`,
      );
      return {
        status: response.status(),
        body: Buffer.from(await response.body()),
        contentType: response.headers()['content-type'],
      };
    },

    async raw(
      method: 'GET' | 'POST' | 'PUT',
      path: string,
      options: { data?: unknown; headers?: Record<string, string> } = {},
    ): Promise<APIResponse> {
      return request.fetch(`${E2E_API_ORIGIN}${path}`, {
        method,
        headers: {
          Origin: E2E_WEB_ORIGIN,
          ...(method === 'GET' ? {} : await mutationHeaders()),
          ...options.headers,
        },
        data: options.data,
      });
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;

function concatPdfMarker(pdf: Uint8Array, marker: string): Uint8Array {
  const extra = new TextEncoder().encode(`\n${marker}\n`);
  const merged = new Uint8Array(pdf.byteLength + extra.byteLength);
  merged.set(pdf);
  merged.set(extra, pdf.byteLength);
  return merged;
}
