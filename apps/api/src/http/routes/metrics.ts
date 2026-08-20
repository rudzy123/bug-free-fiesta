import { Router } from 'express';
import type { ObservabilityMetrics } from '@esign/observability';

/**
 * Prometheus scrape endpoint. Exposes only aggregate, non-sensitive series
 * (bounded labels: route templates, status classes, job types, error
 * categories). Mounted before overload/rate-limit so scrapes are never
 * throttled. Restrict network access to this route at the deployment edge.
 */
export function createMetricsRouter(metrics: ObservabilityMetrics): Router {
  const router = Router();
  router.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(metrics.render());
  });
  return router;
}
