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

  it('redacts authorization, cookie, referer headers and body secrets', () => {
    const lines: string[] = [];
    const logger = createLogger({
      name: 'redact-headers-test',
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
          headers: {
            authorization: 'Bearer super-secret-bearer',
            cookie: 'esign_sid=super-secret-cookie',
            referer: 'https://app.example.test/signing?token=super-secret-referer',
          },
        },
        secret: 'super-secret-shared',
        sessionToken: 'super-secret-session',
        csrfToken: 'super-secret-csrf',
      },
      'header redaction',
    );
    const joined = lines.join('');
    expect(joined).toContain('header redaction');
    expect(joined).not.toContain('super-secret-bearer');
    expect(joined).not.toContain('super-secret-cookie');
    expect(joined).not.toContain('super-secret-referer');
    expect(joined).not.toContain('super-secret-shared');
    expect(joined).not.toContain('super-secret-session');
    expect(joined).not.toContain('super-secret-csrf');
  });
});
