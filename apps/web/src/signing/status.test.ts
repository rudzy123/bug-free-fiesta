import { describe, expect, it } from 'vitest';
import { screenFromFailure, screenFromSession } from './status';

describe('signing status mapping', () => {
  it('maps declined, completed, and expired sessions', () => {
    expect(
      screenFromSession(
        { signerStatus: 'declined', expiresAt: '2026-12-01T00:00:00.000Z' },
        '2026-08-18T00:00:00.000Z',
      ),
    ).toBe('declined');
    expect(
      screenFromSession(
        { signerStatus: 'signed', expiresAt: '2026-12-01T00:00:00.000Z' },
        '2026-08-18T00:00:00.000Z',
      ),
    ).toBe('completed');
    expect(
      screenFromSession(
        { signerStatus: 'pending', expiresAt: '2026-08-01T00:00:00.000Z' },
        '2026-08-18T00:00:00.000Z',
      ),
    ).toBe('expired');
    expect(
      screenFromSession(
        { signerStatus: 'pending', expiresAt: '2026-12-01T00:00:00.000Z' },
        '2026-08-18T00:00:00.000Z',
      ),
    ).toBe('workspace');
  });

  it('uses generic unavailable for unknown tokens and revoked after a session existed', () => {
    expect(screenFromFailure({ authentication: true, network: false, hadSession: false })).toBe(
      'unavailable',
    );
    expect(screenFromFailure({ authentication: true, network: false, hadSession: true })).toBe(
      'revoked',
    );
    expect(screenFromFailure({ authentication: false, network: true, hadSession: false })).toBe(
      'network_error',
    );
  });
});
