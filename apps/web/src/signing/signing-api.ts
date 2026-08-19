import {
  signerConsentResponseSchema,
  signerDocumentResponseSchema,
  signerFieldsResponseSchema,
  signerSessionResponseSchema,
  type CompleteSigningRequest,
  type CompleteSigningResponse,
  type SignerConsentResponse,
  type SignerDocumentResponse,
  type SignerField,
  type SignerFieldsResponse,
  type SignerSessionResponse,
} from '@esign/contracts';
import { readSigningCsrfToken } from './csrf';

export type {
  SignerConsentResponse,
  SignerDocumentResponse,
  SignerField,
  SignerFieldsResponse,
  SignerSessionResponse,
};

export class SigningRequestError extends Error {
  public constructor(
    public readonly authentication: boolean,
    public readonly network: boolean,
    public readonly forbidden: boolean,
    public readonly correlationId: string | undefined,
  ) {
    super('Signing request failed.');
    this.name = 'SigningRequestError';
  }
}

export type SigningApi = {
  exchange(token: string): Promise<{ sessionId: string; expiresAt: string }>;
  getSession(): Promise<SignerSessionResponse>;
  getDocument(): Promise<SignerDocumentResponse>;
  getFields(): Promise<SignerFieldsResponse>;
  getConsent(): Promise<SignerConsentResponse>;
  issuePreview(): Promise<{
    url: string;
    tokenHeader: string;
    token: string;
    contentType: string;
  }>;
  fetchPreviewBlob(input: { url: string; tokenHeader: string; token: string }): Promise<Blob>;
  recordViewed(): Promise<void>;
  recordConsent(copyId: string): Promise<void>;
  decline(reason: string | undefined): Promise<void>;
  complete(
    request: CompleteSigningRequest,
    idempotencyKey: string,
  ): Promise<CompleteSigningResponse>;
};

const API_PREFIX = '/signing/api';

export function createBrowserSigningApi(): SigningApi {
  return {
    async exchange(token: string) {
      const response = await signingFetch('/exchange', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      await assertOk(response);
      const body = (await response.json()) as { sessionId: string; expiresAt: string };
      return { sessionId: body.sessionId, expiresAt: body.expiresAt };
    },
    async getSession() {
      const response = await signingFetch('/session');
      await assertOk(response);
      return signerSessionResponseSchema.parse(await response.json());
    },
    async getDocument() {
      const response = await signingFetch('/document');
      await assertOk(response);
      return signerDocumentResponseSchema.parse(await response.json());
    },
    async getFields() {
      const response = await signingFetch('/fields');
      await assertOk(response);
      return signerFieldsResponseSchema.parse(await response.json());
    },
    async getConsent() {
      const response = await signingFetch('/consent');
      await assertOk(response);
      return signerConsentResponseSchema.parse(await response.json());
    },
    async issuePreview() {
      const response = await signingFetch('/previews', { method: 'POST' });
      await assertOk(response);
      const body = (await response.json()) as {
        url: string;
        tokenHeader: string;
        token: string;
        contentType: string;
      };
      return body;
    },
    async fetchPreviewBlob(input) {
      const grantId = input.url.split('/').pop();
      if (grantId === undefined || grantId === '') {
        throw new SigningRequestError(false, false, false, undefined);
      }
      const headers = new Headers();
      headers.set(input.tokenHeader, input.token);
      const response = await fetch(`${API_PREFIX}/document-previews/${grantId}`, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      await assertOk(response);
      return response.blob();
    },
    async recordViewed() {
      const response = await signingFetch('/viewed', { method: 'POST' });
      await assertOk(response);
    },
    async recordConsent(copyId: string) {
      const response = await signingFetch('/consent', {
        method: 'POST',
        body: JSON.stringify({ copyId, accepted: true }),
      });
      await assertOk(response);
    },
    async decline(reason: string | undefined) {
      const response = await signingFetch('/decline', {
        method: 'POST',
        body: JSON.stringify(reason === undefined || reason.trim() === '' ? {} : { reason }),
      });
      await assertOk(response);
    },
    async complete(request, idempotencyKey) {
      const response = await signingFetch('/complete', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify(request),
      });
      await assertOk(response);
      const body = (await response.json()) as CompleteSigningResponse;
      return { status: body.status === 'pending' ? 'pending' : 'accepted' };
    },
  };
}

async function signingFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = init.method ?? 'GET';
  if (method !== 'GET') {
    const csrf = readSigningCsrfToken(document.cookie);
    if (csrf !== undefined) {
      headers.set('x-csrf-token', csrf);
    }
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }
  try {
    return await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new SigningRequestError(false, true, false, undefined);
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  let correlationId: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { correlationId?: string };
    };
    correlationId = body.error?.correlationId;
  } catch {
    correlationId = undefined;
  }
  throw new SigningRequestError(
    response.status === 401,
    response.status >= 502 || response.status === 408,
    response.status === 403,
    correlationId,
  );
}
