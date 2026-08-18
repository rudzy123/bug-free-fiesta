import type { Logger } from '@esign/logger';

export type JobPoller = {
  start: () => void;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  lastPollAtUtc: () => Date | undefined;
};

/**
 * Placeholder outbox polling boundary. Does not claim jobs or finalize documents.
 */
export function createJobPoller(options: {
  intervalMs: number;
  logger: Logger;
  poll?: () => Promise<{ jobsClaimed?: number } | void>;
}): JobPoller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let inFlight: Promise<void> | undefined;
  let lastPollAtUtc: Date | undefined;

  const pollOnce = async (): Promise<void> => {
    options.logger.debug('polling for jobs');
    let jobsClaimed = 0;
    if (options.poll) {
      const result = await options.poll();
      if (result && typeof result.jobsClaimed === 'number') {
        jobsClaimed = result.jobsClaimed;
      }
    }
    lastPollAtUtc = new Date();
    options.logger.info(
      { lastPollAtUtc: lastPollAtUtc.toISOString(), jobsClaimed },
      jobsClaimed > 0 ? 'job poll completed' : 'job poll completed with no work',
    );
  };

  const schedule = (): void => {
    timer = setTimeout(() => {
      inFlight = pollOnce()
        .catch((error: unknown) => {
          options.logger.error(
            { errorName: error instanceof Error ? error.name : 'unknown' },
            'job poll failed',
          );
        })
        .finally(() => {
          inFlight = undefined;
          if (running) {
            schedule();
          }
        });
    }, options.intervalMs);
    timer.unref();
  };

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      options.logger.info({ intervalMs: options.intervalMs }, 'job poller started');
      inFlight = pollOnce().finally(() => {
        inFlight = undefined;
        if (running) {
          schedule();
        }
      });
    },
    async stop() {
      running = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (inFlight !== undefined) {
        await inFlight;
      }
      options.logger.info('job poller stopped');
    },
    isRunning: () => running,
    lastPollAtUtc: () => lastPollAtUtc,
  };
}
