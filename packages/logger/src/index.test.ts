import { describe, expect, it } from 'vitest';
import { createLogger } from './index.js';

describe('logger redaction', () => {
  it('removes query strings and tokens from logged objects', () => {
    const lines: string[] = [];
    const logger = createLogger({
      name: 'redact-test',
      level: 'info',
      destination: {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    });
    logger.info(
      {
        req: {
          query: { token: 'super-secret-signing-token' },
          url: '/signing/exchange?token=super-secret-signing-token',
          originalUrl: '/signing/exchange?token=super-secret-signing-token',
        },
        rawToken: 'super-secret-signing-token',
      },
      'should not leak',
    );
    const joined = lines.join('');
    expect(joined).toContain('should not leak');
    expect(joined).not.toContain('super-secret-signing-token');
  });
});
