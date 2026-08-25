import { IntegrityError } from './errors.js';
import { requireOrganizationId } from './organization-context.js';

export const AUDIT_GENESIS_PREVIOUS_EVENT_HASH = '0'.repeat(64);

export function tenantObjectKeyPrefix(organizationId: string): string {
  return `org/${requireOrganizationId(organizationId)}/`;
}

/**
 * Rejects path traversal and other unsafe object-key segments before any
 * filesystem or cloud key materialization. Content-addressed digests never
 * need `.` / `..` / empty / backslash segments. A single trailing `/` is
 * allowed so list prefixes can remain boundary-safe (`…/revisions/`).
 */
export function assertSafeObjectKeySegments(key: string): string {
  if (key.includes('\\') || key.includes('\0')) {
    throw new IntegrityError({ reason: 'object_key_unsafe_segment' });
  }
  const forCheck = key.endsWith('/') ? key.slice(0, -1) : key;
  if (forCheck === '' || forCheck.startsWith('/')) {
    throw new IntegrityError({ reason: 'object_key_unsafe_segment' });
  }
  const segments = forCheck.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new IntegrityError({ reason: 'object_key_unsafe_segment' });
    }
  }
  return key;
}

export function tenantObjectKey(organizationId: string, relativeKey: string): string {
  const prefix = tenantObjectKeyPrefix(organizationId);
  const trimmed = relativeKey.replace(/^\/+/, '');
  assertSafeObjectKeySegments(trimmed);
  if (trimmed.startsWith('org/')) {
    if (!trimmed.startsWith(prefix)) {
      throw new IntegrityError({ reason: 'object_key_tenant_mismatch' });
    }
    return trimmed;
  }
  return assertSafeObjectKeySegments(`${prefix}${trimmed}`);
}

export function assertTenantObjectKey(organizationId: string, key: string): string {
  assertSafeObjectKeySegments(key);
  const prefix = tenantObjectKeyPrefix(organizationId);
  if (!key.startsWith(prefix)) {
    throw new IntegrityError({ reason: 'object_key_not_tenant_prefixed' });
  }
  return key;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sourceRevisionObjectKey(organizationId: string, sha256Digest: string): string {
  return digestObjectKey(organizationId, 'revisions', sha256Digest);
}

export function artifactObjectKey(organizationId: string, sha256Digest: string): string {
  return digestObjectKey(organizationId, 'artifacts', sha256Digest);
}

export function signatureImageObjectKey(organizationId: string, sha256Digest: string): string {
  return digestObjectKey(organizationId, 'signatures', sha256Digest);
}

function digestObjectKey(
  organizationId: string,
  kind: 'revisions' | 'artifacts' | 'signatures',
  sha256Digest: string,
): string {
  if (!SHA256_HEX.test(sha256Digest)) {
    throw new IntegrityError({ reason: 'invalid_sha256_digest' });
  }
  return tenantObjectKey(organizationId, `${kind}/${sha256Digest}`);
}
