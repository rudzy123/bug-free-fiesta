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
    }
  }
}
