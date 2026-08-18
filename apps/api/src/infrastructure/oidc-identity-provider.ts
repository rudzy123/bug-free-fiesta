import { ExternalServiceError, type IdentityProvider } from '@esign/domain';

/**
 * Production identity adapter boundary. A complete OIDC authorization-code
 * integration requires customer credentials and is documented in
 * docs/security/authentication-setup.md. This adapter fails closed.
 */
export function createOidcIdentityProvider(): IdentityProvider {
  return {
    async authenticate() {
      throw new ExternalServiceError({ reason: 'oidc_not_configured' });
    },
  };
}
