import type { RequestHandler } from 'express';
import { errorEnvelope } from '@esign/contracts';
import { PUBLIC_ERROR_MESSAGES } from '@esign/application';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rejects request bodies whose declared media type is not explicitly allowed.
 * A body is considered present when a non-zero Content-Length or a
 * Transfer-Encoding header is set; bodyless requests are never blocked. The
 * media type is compared on its base only (parameters such as charset are
 * ignored). Unsupported types get a stable 415 envelope instead of being
 * silently parsed or misinterpreted.
 */
export function createStrictContentType(allowedTypes: readonly string[]): RequestHandler {
  const allowed = new Set(allowedTypes.map((type) => type.toLowerCase()));

  return (req, res, next) => {
    if (!BODY_METHODS.has(req.method) || !hasBody(req)) {
      next();
      return;
    }
    const baseType = baseContentType(req.headers['content-type']);
    if (baseType === undefined || !allowed.has(baseType)) {
      res
        .status(415)
        .json(
          errorEnvelope(
            'unsupported_media_type',
            PUBLIC_ERROR_MESSAGES.unsupported_media_type,
            req.correlationId ?? 'unknown',
          ),
        );
      return;
    }
    next();
  };
}

function hasBody(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  if (req.headers['transfer-encoding'] !== undefined) {
    return true;
  }
  const contentLength = req.headers['content-length'];
  if (typeof contentLength !== 'string') {
    return false;
  }
  const length = Number.parseInt(contentLength, 10);
  return Number.isFinite(length) && length > 0;
}

function baseContentType(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) {
    return undefined;
  }
  const base = raw.split(';', 1)[0]?.trim().toLowerCase();
  return base === undefined || base === '' ? undefined : base;
}
