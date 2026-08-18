import { IntegrityError } from './errors.js';
import { requireOrganizationId } from './organization-context.js';

export const AUDIT_GENESIS_PREVIOUS_EVENT_HASH = '0'.repeat(64);

export function tenantObjectKeyPrefix(organizationId: string): string {
  return `org/${requireOrganizationId(organizationId)}/`;
}

export function tenantObjectKey(organizationId: string, relativeKey: string): string {
  const prefix = tenantObjectKeyPrefix(organizationId);
  const trimmed = relativeKey.replace(/^\/+/, '');
  if (trimmed.startsWith('org/')) {
    if (!trimmed.startsWith(prefix)) {
      throw new IntegrityError({ reason: 'object_key_tenant_mismatch' });
    }
    return trimmed;
  }
  return `${prefix}${trimmed}`;
}

export function assertTenantObjectKey(organizationId: string, key: string): string {
  const prefix = tenantObjectKeyPrefix(organizationId);
  if (!key.startsWith(prefix)) {
    throw new IntegrityError({ reason: 'object_key_not_tenant_prefixed' });
  }
  return key;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sourceRevisionObjectKey(organizationId: string, sha256Digest: string): string {
  if (!SHA256_HEX.test(sha256Digest)) {
    throw new IntegrityError({ reason: 'invalid_sha256_digest' });
  }
  return tenantObjectKey(organizationId, `revisions/${sha256Digest}`);
}
