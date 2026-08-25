import { describe, expect, it } from 'vitest';
import { buildUpstreamSigningHeaders } from './_proxy';

describe('signing API proxy headers (SEC-003)', () => {
  it('does not forward a browser-supplied X-Forwarded-For', () => {
    const request = new Request('http://localhost:3000/signing/api/session', {
      headers: {
        'x-forwarded-for': '203.0.113.9, 198.51.100.1',
        cookie: 'esign_sign=session',
        'user-agent': 'vitest',
      },
    });
    const headers = buildUpstreamSigningHeaders(request, 'http://localhost:3000');
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('cookie')).toBe('esign_sign=session');
    expect(headers.get('origin')).toBe('http://localhost:3000');
  });

  it('sets X-Forwarded-For from a trusted x-real-ip when present', () => {
    const request = new Request('http://localhost:3000/signing/api/session', {
      headers: {
        'x-forwarded-for': 'attacker-spoof',
        'x-real-ip': '203.0.113.50',
      },
    });
    const headers = buildUpstreamSigningHeaders(request, 'http://localhost:3000');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.50');
  });
});
