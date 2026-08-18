import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function createRequestIdMiddleware(headerName: string): RequestHandler {
  const header = headerName.toLowerCase();

  return (req, res, next) => {
    const incoming = req.header(header);
    const correlationId =
      incoming !== undefined && SAFE_ID.test(incoming) ? incoming : randomUUID();
    req.correlationId = correlationId;
    res.setHeader(header, correlationId);
    next();
  };
}
