import { loadWebConfig } from '@esign/config';
import { ACCOUNT_CSRF_HEADER_NAME_DEFAULT, IDEMPOTENCY_KEY_HEADER } from '@esign/contracts';
import { NextResponse } from 'next/server';

const ALLOWED_SIGNING_PATHS = new Set([
  'exchange',
  'session',
  'document',
  'fields',
  'consent',
  'previews',
  'viewed',
  'decline',
  'complete',
]);

export function isAllowedSigningPath(parts: readonly string[]): boolean {
  if (parts.length !== 1) {
    return false;
  }
  const first = parts[0];
  return first !== undefined && ALLOWED_SIGNING_PATHS.has(first);
}

/**
 * Builds headers for the API hop. Never copies browser-controlled
 * `X-Forwarded-For` (SEC-003). When a trusted edge in front of Next sets
 * `x-real-ip`, forward that single verified address so the API can use
 * `TRUST_PROXY=1` safely.
 */
export function buildUpstreamSigningHeaders(request: Request, origin: string): Headers {
  const headers = new Headers();
  copyHeader(request, headers, 'cookie');
  copyHeader(request, headers, 'content-type');
  copyHeader(request, headers, ACCOUNT_CSRF_HEADER_NAME_DEFAULT);
  copyHeader(request, headers, 'x-preview-token');
  copyHeader(request, headers, 'x-correlation-id');
  copyHeader(request, headers, IDEMPOTENCY_KEY_HEADER);
  copyHeader(request, headers, 'user-agent');
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp !== undefined && realIp !== '') {
    headers.set('x-forwarded-for', realIp);
  }
  headers.set('origin', origin);
  return headers;
}

export async function proxyToApi(request: Request, apiPath: string): Promise<Response> {
  const config = loadWebConfig();
  const origin = new URL(request.url).origin;
  const headers = buildUpstreamSigningHeaders(request, origin);

  const method = request.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : Buffer.from(await request.arrayBuffer());

  let upstream: Response;
  try {
    upstream = await fetch(`${config.NEXT_PUBLIC_API_BASE_URL}${apiPath}`, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'external_service',
          message: 'The signing service is temporarily unavailable.',
          correlationId: 'web-proxy',
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType !== null) {
    responseHeaders.set('content-type', contentType);
  }
  responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  responseHeaders.set('Pragma', 'no-cache');
  responseHeaders.set('Referrer-Policy', 'no-referrer');
  const setCookies = upstream.headers.getSetCookie();
  for (const cookie of setCookies) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function copyHeader(from: Request, to: Headers, name: string): void {
  const value = from.headers.get(name);
  if (value !== null && value !== '') {
    to.set(name, value);
  }
}
