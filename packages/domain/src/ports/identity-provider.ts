export type AuthenticatedIdentity = {
  readonly email: string;
};

/**
 * Provider-agnostic authentication boundary. Implementations verify identity
 * without leaking whether an account exists. Application code never hashes
 * end-user passwords; production uses an external identity provider.
 */
export type IdentityProvider = {
  authenticate: (input: { email: string; secret: string }) => Promise<AuthenticatedIdentity | null>;
};
