import { describe, expect, it } from 'vitest';
import { normalizeIp, parseForwardedFor, resolveClientIp } from './client-ip.js';

describe('normalizeIp', () => {
  it('strips IPv4-mapped IPv6 prefixes', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('trims whitespace, control characters, zone ids, and lowercases', () => {
    expect(normalizeIp('  203.0.113.5 ')).toBe('203.0.113.5');
    expect(normalizeIp('FE80::1%eth0')).toBe('fe80::1');
    expect(normalizeIp('203.0.113.5\r\n')).toBe('203.0.113.5');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeIp('')).toBe('');
    expect(normalizeIp('   ')).toBe('');
  });
});

describe('parseForwardedFor', () => {
  it('splits a comma list and normalizes each entry', () => {
    expect(parseForwardedFor('203.0.113.9, 10.0.0.1 ,::ffff:10.0.0.2')).toEqual([
      '203.0.113.9',
      '10.0.0.1',
      '10.0.0.2',
    ]);
  });

  it('joins array-valued headers and drops empties', () => {
    expect(parseForwardedFor(['203.0.113.9', '10.0.0.1'])).toEqual(['203.0.113.9', '10.0.0.1']);
    expect(parseForwardedFor(undefined)).toEqual([]);
    expect(parseForwardedFor(' , ,')).toEqual([]);
  });
});

describe('resolveClientIp — spoof resistance under the documented proxy topology', () => {
  it('ignores X-Forwarded-For entirely when no proxy is trusted (count 0)', () => {
    // Default topology: a client connecting directly cannot set its own IP.
    expect(
      resolveClientIp({
        socketAddress: '::ffff:198.51.100.4',
        forwardedFor: '1.2.3.4, 5.6.7.8',
        trustedProxyCount: 0,
      }),
    ).toBe('198.51.100.4');
  });

  it('with one trusted proxy, uses the address the proxy appended', () => {
    // Legitimate: the proxy (socket peer) appends the real client IP it saw.
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.1',
        forwardedFor: '203.0.113.9',
        trustedProxyCount: 1,
      }),
    ).toBe('203.0.113.9');
  });

  it('with one trusted proxy, a client cannot spoof by prepending entries', () => {
    // Attacker sends "1.2.3.4"; the trusted proxy appends the real client IP,
    // which is the only entry we trust. The forged leftmost value is ignored.
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.1',
        forwardedFor: '1.2.3.4, 203.0.113.9',
        trustedProxyCount: 1,
      }),
    ).toBe('203.0.113.9');
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.1',
        forwardedFor: 'attacker-1, attacker-2, 203.0.113.9',
        trustedProxyCount: 1,
      }),
    ).toBe('203.0.113.9');
  });

  it('with two trusted proxies, resolves past both appended hops', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.2',
        forwardedFor: '203.0.113.9, 10.0.0.1',
        trustedProxyCount: 2,
      }),
    ).toBe('203.0.113.9');
    // Extra forged leftmost entries are still ignored.
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.2',
        forwardedFor: 'spoof, 203.0.113.9, 10.0.0.1',
        trustedProxyCount: 2,
      }),
    ).toBe('203.0.113.9');
  });

  it('fails closed to the socket peer when the chain is shorter than the topology', () => {
    // Missing/stripped header under a 1-proxy topology: never trust a client value.
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.1',
        forwardedFor: undefined,
        trustedProxyCount: 1,
      }),
    ).toBe('10.0.0.1');
  });

  it('normalizes the resolved address', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.1',
        forwardedFor: '::ffff:203.0.113.9',
        trustedProxyCount: 1,
      }),
    ).toBe('203.0.113.9');
  });
});
