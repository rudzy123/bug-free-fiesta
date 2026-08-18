import { ValidationError } from './errors.js';

const OPAQUE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireOrganizationId(organizationId: string): string {
  return requireOpaqueId(organizationId, 'organizationId');
}

export function requireOpaqueId(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError({ field, reason: 'missing' });
  }
  if (!OPAQUE_ID_PATTERN.test(value)) {
    throw new ValidationError({ field, reason: 'invalid' });
  }
  return value;
}

export function isOpaqueId(value: string): boolean {
  return OPAQUE_ID_PATTERN.test(value);
}

export type OrganizationContext = {
  readonly organizationId: string;
};

export function organizationContext(organizationId: string): OrganizationContext {
  return { organizationId: requireOrganizationId(organizationId) };
}
