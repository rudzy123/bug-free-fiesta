import { Router } from 'express';
import type { HealthService } from '../../application/health-service.js';
import { errorEnvelope } from '@esign/contracts';

export function createHealthRouter(health: HealthService): Router {
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
    void health
      .ready()
      .then((result) => {
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
