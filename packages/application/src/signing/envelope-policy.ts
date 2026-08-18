import type { SigningEnvelopePolicy } from '@esign/domain';

export function createSigningEnvelopePolicy(options?: {
  requiresAccountAuth?: boolean;
}): SigningEnvelopePolicy {
  const required = options?.requiresAccountAuth === true;
  return {
    requiresAccountAuth: () => required,
  };
}
