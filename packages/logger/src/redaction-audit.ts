import { createLogger } from './index.js';

/**
 * Representative sensitive payloads that must never survive logging. Each value
 * is a unique sentinel so the audit can assert its absence in serialized output.
 * Covers every "never log" item: raw signing tokens, Authorization headers,
 * cookies, signature PNGs, pointer streams, PDF bytes, passwords, full document
 * content, and private storage URLs — at the top level and nested.
 */
export function sensitiveSamples(): Record<string, unknown> {
  return {
    // Authentication material
    password: 'SENTINEL_password',
    secret: 'SENTINEL_secret',
    token: 'SENTINEL_token',
    rawToken: 'SENTINEL_rawToken',
    sessionToken: 'SENTINEL_sessionToken',
    csrfToken: 'SENTINEL_csrfToken',
    // HTTP request shape (headers + query + url)
    req: {
      headers: {
        authorization: 'Bearer SENTINEL_authorization',
        cookie: 'esign_sid=SENTINEL_cookie',
        'set-cookie': 'esign_sid=SENTINEL_setcookie',
        referer: 'https://app.example.test/signing?token=SENTINEL_referer',
      },
      query: { token: 'SENTINEL_query_token' },
      url: '/signing/exchange?token=SENTINEL_url_token',
      // Nested body payloads (depth 2-3)
      body: {
        password: 'SENTINEL_body_password',
        signature: 'SENTINEL_signature',
        signaturePng: 'SENTINEL_signaturePng',
        initials: 'SENTINEL_initials',
        points: [{ x: 0.1, y: 0.2, note: 'SENTINEL_points' }],
        strokes: ['SENTINEL_strokes'],
        pdfBytes: 'SENTINEL_pdfBytes',
        documentContent: 'SENTINEL_documentContent',
      },
    },
    // Worker/outbox shape
    event: {
      payload: {
        pdfBytes: 'SENTINEL_event_pdfBytes',
        documentBytes: 'SENTINEL_event_documentBytes',
        signedUrl: 'https://bucket.example/SENTINEL_signedUrl',
      },
    },
    // Private storage locations
    signedUrl: 'https://bucket.example/o/SENTINEL_top_signedUrl?sig=abc',
    presignedUrl: 'https://bucket.example/o/SENTINEL_presignedUrl',
    storageUrl: 'https://bucket.example/o/SENTINEL_storageUrl',
    downloadUrl: 'https://bucket.example/o/SENTINEL_downloadUrl',
    uploadUrl: 'https://bucket.example/o/SENTINEL_uploadUrl',
    previewUrl: 'https://bucket.example/o/SENTINEL_previewUrl',
    // Content buffers
    pdf: 'SENTINEL_pdf',
    content: 'SENTINEL_content',
    bytes: 'SENTINEL_bytes',
    buffer: 'SENTINEL_buffer',
    // A benign field that MUST survive
    correlationId: 'corr-safe-123',
  };
}

export type RedactionAuditResult = {
  readonly leaked: string[];
  readonly output: string;
  readonly correlationIdPresent: boolean;
};

/**
 * Feeds the representative sensitive payloads through the real logger and
 * returns any sentinel that leaked into the serialized output. `leaked` is empty
 * when redaction is complete.
 */
export function runRedactionAudit(): RedactionAuditResult {
  const lines: string[] = [];
  const logger = createLogger({
    name: 'redaction-audit',
    level: 'trace',
    destination: {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  });

  const samples = sensitiveSamples();
  logger.info(samples, 'redaction audit sample');
  logger.error(samples, 'redaction audit sample at error level');

  const output = lines.join('');
  const leaked: string[] = [];
  // Any SENTINEL_ token that appears in output is a leak.
  const matches = output.match(/SENTINEL_[A-Za-z0-9_]+/g) ?? [];
  for (const match of matches) {
    if (!leaked.includes(match)) {
      leaked.push(match);
    }
  }

  return {
    leaked,
    output,
    correlationIdPresent: output.includes('corr-safe-123'),
  };
}
