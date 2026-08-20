import { Router } from 'express';
import type { HealthService } from '../../application/health-service.js';
import type { ObservabilityMetrics } from '@esign/observability';
import { errorEnvelope } from '@esign/contracts';

export function createHealthRouter(health: HealthService, metrics: ObservabilityMetrics): Router {
  const router = Router();

  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'api',
      correlationId: req.correlationId,
    });
  });

  router.get('/health/live', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'api',
      correlationId: req.correlationId,
    });
  });

  router.get('/health/ready', (req, res, next) => {
    const startedNs = process.hrtime.bigint();
    void health
      .ready()
      .then((result) => {
        metrics.recordDbQuery({
          operation: 'readiness_ping',
          outcome: result.database === 'up' ? 'ok' : 'error',
          durationSeconds: Number(process.hrtime.bigint() - startedNs) / 1e9,
        });
        if (!result.ready) {
          res.status(503).json({
            ...errorEnvelope(
              'not_ready',
              'The API is not ready to accept traffic.',
              req.correlationId,
            ),
            checks: { database: result.database },
          });
          return;
        }
        res.status(200).json({
          status: 'ready',
          service: 'api',
          checks: { database: result.database },
          correlationId: req.correlationId,
        });
      })
      .catch(next);
  });

  return router;
}
