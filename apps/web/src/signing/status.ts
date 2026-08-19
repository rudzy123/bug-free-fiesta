export type SigningScreen =
  | 'bootstrapping'
  | 'unavailable'
  | 'expired'
  | 'revoked'
  | 'declined'
  | 'completed'
  | 'error'
  | 'network_error'
  | 'ready'
  | 'review'
  | 'submitting';

export function screenFromSession(
  session: {
    readonly signerStatus: 'pending' | 'signed' | 'declined';
    readonly expiresAt: string;
  },
  nowIso: string,
): Exclude<SigningScreen, 'bootstrapping' | 'ready' | 'review' | 'submitting'> | 'workspace' {
  if (session.signerStatus === 'declined') {
    return 'declined';
  }
  if (session.signerStatus === 'signed') {
    return 'completed';
  }
  if (Date.parse(session.expiresAt) <= Date.parse(nowIso)) {
    return 'expired';
  }
  return 'workspace';
}

export function screenFromFailure(input: {
  readonly authentication: boolean;
  readonly network: boolean;
  readonly hadSession: boolean;
}): SigningScreen {
  if (input.network) {
    return 'network_error';
  }
  if (input.authentication) {
    return input.hadSession ? 'revoked' : 'unavailable';
  }
  return 'error';
}
