import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import type { ObservabilityMetrics } from '@esign/observability';

function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function tokensEqual(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Prometheus scrape endpoint. Exposes only aggregate, non-sensitive series.
 * When `bearerToken` is set, requires `Authorization: Bearer <token>`.
 * Production config requires the token (SEC-009).
 */
export function createMetricsRouter(
  metrics: ObservabilityMetrics,
  options?: { bearerToken?: string },
): Router {
  const router = Router();
  const expected = options?.bearerToken?.trim() || undefined;
  router.get('/metrics', (req, res) => {
    if (expected !== undefined) {
      const presented = extractBearerToken(req);
      if (presented === null || !tokensEqual(presented, expected)) {
        res
          .status(401)
          .setHeader('Cache-Control', 'no-store')
          .json({
            error: { code: 'unauthorized', message: 'Metrics scrape unauthorized' },
          });
        return;
      }
    }
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(metrics.render());
  });
  return router;
}
