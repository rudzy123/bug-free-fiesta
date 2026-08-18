import { createServer, type Server } from 'node:http';
import type { Logger } from '@esign/logger';
import type { DatabasePinger } from '@esign/database';
import { errorEnvelope } from '@esign/contracts';
import type { JobPoller } from './poller.js';

export function createWorkerHealthServer(options: {
  host: string;
  port: number;
  logger: Logger;
  poller: JobPoller;
  database: DatabasePinger;
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

    if (req.method === 'GET' && url === '/health/ready') {
      void options.database
        .ping()
        .then(() => {
          if (!options.poller.isRunning()) {
            send(
              503,
              errorEnvelope('not_ready', 'The worker poller is not running.', correlationId),
            );
            return;
          }
          send(200, {
            status: 'ready',
            service: 'worker',
            checks: { database: 'up' },
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
