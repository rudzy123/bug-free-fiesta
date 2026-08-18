import { ValidationError } from './errors.js';
import { SIGNING_MODES, type Signer, type SigningMode } from './entities.js';

export function isSigningMode(value: string): value is SigningMode {
  return (SIGNING_MODES as readonly string[]).includes(value);
}

export function assertedSigningMode(value: string): SigningMode {
  if (!isSigningMode(value)) {
    throw new ValidationError({ field: 'signingMode', reason: 'invalid' });
  }
  return value;
}

/**
 * Ordered: routingOrder is unique and consecutive starting at 1.
 * Parallel: every signer shares routingOrder 1.
 */
export function assertSignerRouting(input: {
  signingMode: SigningMode;
  signers: readonly Pick<Signer, 'routingOrder'>[];
}): void {
  if (input.signers.length < 1) {
    throw new ValidationError({ field: 'signers', reason: 'empty' });
  }
  const orders = input.signers.map((signer) => signer.routingOrder);
  for (const order of orders) {
    if (!Number.isInteger(order) || order < 1) {
      throw new ValidationError({ field: 'routingOrder', reason: 'invalid' });
    }
  }
  if (input.signingMode === 'parallel') {
    if (orders.some((order) => order !== 1)) {
      throw new ValidationError({ field: 'routingOrder', reason: 'parallel_must_be_one' });
    }
    return;
  }
  const unique = new Set(orders);
  if (unique.size !== orders.length) {
    throw new ValidationError({ field: 'routingOrder', reason: 'ordered_must_be_unique' });
  }
  for (let expected = 1; expected <= orders.length; expected += 1) {
    if (!unique.has(expected)) {
      throw new ValidationError({ field: 'routingOrder', reason: 'ordered_must_be_consecutive' });
    }
  }
}
