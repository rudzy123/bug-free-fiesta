import type { RequestActor } from '../request-actor.js';

export const AUTHORIZATION_ACTIONS = [
  'organization.membership.read',
  'document.read',
  'document.write',
  'document.send',
  'document.void',
  'document.download_artifact',
  'signing.session.act',
  'job.process',
  'audit.verify',
] as const;

export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number];

export type AuthorizationResource = {
  readonly organizationId: string;
  readonly documentId?: string;
  readonly signerId?: string;
};

export type AuthorizationPolicy = {
  assertAllowed: (
    actor: RequestActor,
    action: AuthorizationAction,
    resource: AuthorizationResource,
  ) => void;
};
