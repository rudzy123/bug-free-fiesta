import { IntegrityError, requireOpaqueId, requireOrganizationId } from '@esign/domain';

export function tenantScope(organizationId: string): { organizationId: string } {
  return { organizationId: requireOrganizationId(organizationId) };
}

export function tenantCompoundWhere(
  organizationId: string,
  id: string,
  idField: string,
): {
  organizationId_id: { organizationId: string; id: string };
} {
  return {
    organizationId_id: {
      organizationId: requireOrganizationId(organizationId),
      id: requireOpaqueId(id, idField),
    },
  };
}

export function assertSameOrganization(left: string, right: string): void {
  if (requireOrganizationId(left) !== requireOrganizationId(right)) {
    throw new IntegrityError({ reason: 'organization_id_mismatch' });
  }
}
