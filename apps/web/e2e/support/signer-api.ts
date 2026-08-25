import type { APIRequestContext, APIResponse } from '@playwright/test';
import { createTestPng } from '@esign/test-utils';
import { signerConsentResponseSchema, signerFieldsResponseSchema } from '@esign/contracts';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from '../env';

async function signingCsrf(request: APIRequestContext): Promise<string> {
  const state = await request.storageState();
  const cookie = state.cookies.find((entry) => entry.name === 'esign_sign_csrf');
  if (cookie === undefined || cookie.value === '') {
    throw new Error('missing signing CSRF cookie');
  }
  return cookie.value;
}

function inkPayload(png: Uint8Array) {
  return {
    pngBase64: Buffer.from(png).toString('base64'),
    durationMs: 400,
    strokes: [
      {
        points: [
          { x: 0.1, y: 0.1, t: 0, p: 0.5 },
          { x: 0.4, y: 0.35, t: 120, p: 0.6 },
        ],
      },
    ],
  };
}

export function createSignerApi(request: APIRequestContext) {
  return {
    async exchange(token: string): Promise<APIResponse> {
      return request.post(`${E2E_API_ORIGIN}/signing/exchange`, {
        headers: { Origin: E2E_WEB_ORIGIN, 'content-type': 'application/json' },
        data: { token },
      });
    },

    async getSession(): Promise<APIResponse> {
      return request.get(`${E2E_API_ORIGIN}/signing/session`);
    },

    async recordConsent(copyId?: string): Promise<APIResponse> {
      const consent =
        copyId === undefined
          ? signerConsentResponseSchema.parse(
              await (await request.get(`${E2E_API_ORIGIN}/signing/consent`)).json(),
            )
          : { copyId };
      return request.post(`${E2E_API_ORIGIN}/signing/consent`, {
        headers: {
          Origin: E2E_WEB_ORIGIN,
          'content-type': 'application/json',
          'x-csrf-token': await signingCsrf(request),
        },
        data: { copyId: consent.copyId, accepted: true },
      });
    },

    async complete(
      options: {
        fieldIds?: readonly string[];
        includeSignature?: boolean;
        png?: Uint8Array;
        idempotencyKey?: string;
        extra?: Record<string, unknown>;
      } = {},
    ): Promise<APIResponse> {
      const fields = signerFieldsResponseSchema.parse(
        await (await request.get(`${E2E_API_ORIGIN}/signing/fields`)).json(),
      );
      const consent = signerConsentResponseSchema.parse(
        await (await request.get(`${E2E_API_ORIGIN}/signing/consent`)).json(),
      );
      const fieldIds = options.fieldIds ?? fields.fields.map((field) => field.fieldId);
      const body: Record<string, unknown> = {
        consentCopyId: consent.copyId,
        intentToSign: true,
        fieldIds,
        ...options.extra,
      };
      if (options.includeSignature !== false) {
        body['signature'] = inkPayload(options.png ?? createTestPng({ width: 32, height: 16 }));
      }
      return request.post(`${E2E_API_ORIGIN}/signing/complete`, {
        headers: {
          Origin: E2E_WEB_ORIGIN,
          'content-type': 'application/json',
          'x-csrf-token': await signingCsrf(request),
          'idempotency-key': options.idempotencyKey ?? crypto.randomUUID(),
        },
        data: body,
      });
    },
  };
}

export type SignerApi = ReturnType<typeof createSignerApi>;
