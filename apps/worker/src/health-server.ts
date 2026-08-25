import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { Logger } from '@esign/logger';
import type { DatabasePinger } from '@esign/database';
import type { ObservabilityMetrics } from '@esign/observability';
import { errorEnvelope } from '@esign/contracts';
import {
  isJobQueueStale,
  type Clock,
  type JobQueueHealth,
  type JobQueueMetrics,
} from '@esign/domain';
import type { JobPoller } from './poller.js';

function metricsAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (expectedToken === undefined || expectedToken.trim() === '') {
    return true;
  }
  const match = /^Bearer\s+(.+)$/i.exec((authorizationHeader ?? '').trim());
  const presented = match?.[1]?.trim();
  if (presented === undefined) {
    return false;
  }
  const left = Buffer.from(presented);
  const right = Buffer.from(expectedToken);
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createWorkerHealthServer(options: {
  host: string;
  port: number;
  logger: Logger;
  poller: JobPoller;
  database: DatabasePinger;
  queueHealth: JobQueueHealth;
  metrics: JobQueueMetrics;
  observability: ObservabilityMetrics;
  clock: Clock;
  staleAfterMs: number;
  pollStaleAfterMs: number;
  metricsBearerToken?: string;
}): Server {
  const server = createServer((req, res) => {
    const correlationId = 'worker-health';
    const url = req.url ?? '/';

    const send = (status: number, body: unknown): void => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && (url === '/health' || url === '/health/live')) {
      send(200, { status: 'ok', service: 'worker', correlationId });
      return;
    }

    if (req.method === 'GET' && url === '/metrics') {
      if (!metricsAuthorized(req.headers.authorization, options.metricsBearerToken)) {
        send(401, errorEnvelope('authentication', 'Metrics scrape unauthorized', correlationId));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(options.observability.render());
      return;
    }

    if (req.method === 'GET' && url === '/health/ready') {
      void options.database
        .ping()
        .then(async () => {
          const now = options.clock.nowUtc();
          const lastPoll = options.poller.lastPollAtUtc();
          const pollerRunning = options.poller.isRunning();
          const pollStale =
            lastPoll !== undefined && now.getTime() - lastPoll.getTime() > options.pollStaleAfterMs;
          const depth = await options.queueHealth.snapshot(now);
          options.metrics.recordQueueDepth(depth);
          const staleQueue = isJobQueueStale({
            depth,
            now,
            staleAfterMs: options.staleAfterMs,
          });
          const queue = {
            pending: depth.pending,
            processing: depth.processing,
            failed: depth.failed,
            expiredLeases: depth.expiredLeaseCount,
            oldestAvailableAt: depth.oldestAvailableAt?.toISOString() ?? null,
            stale: staleQueue,
          };
          if (!pollerRunning || pollStale) {
            send(503, {
              ...errorEnvelope('not_ready', 'The worker poller is not running.', correlationId),
              checks: {
                database: 'up',
                poller: pollerRunning ? 'stale' : 'down',
                queue: staleQueue ? 'stale' : 'ok',
              },
              queue,
              metrics: options.metrics.snapshot(),
            });
            return;
          }
          send(200, {
            status: 'ready',
            service: 'worker',
            checks: {
              database: 'up',
              poller: 'up',
              queue: staleQueue ? 'stale' : 'ok',
            },
            queue,
            metrics: options.metrics.snapshot(),
            correlationId,
          });
        })
        .catch(() => {
          send(
            503,
            errorEnvelope('not_ready', 'The worker is not ready to accept work.', correlationId),
          );
        });
      return;
    }

    send(404, errorEnvelope('not_found', 'The requested resource was not found.', correlationId));
  });

  server.on('error', (error) => {
    options.logger.error({ errorName: error.name }, 'worker health server error');
  });

  return server;
}
