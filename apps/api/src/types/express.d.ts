import type { AccountSession, AccountUserActor, OrganizationContext } from '@esign/domain';

export {};

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      cookies: Map<string, string>;
      accountSession?: AccountSession;
      accountActor?: AccountUserActor;
      organization?: OrganizationContext;
      signingToken?: string;
      /** Spoof-resistant client IP resolved from the configured trusted-proxy topology. */
      clientIp?: string;
      /** Aborted when the request times out or the client disconnects. */
      abortSignal?: AbortSignal;
    }
  }
}
