import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TENANT_REPOSITORY_TYPE_GUARDS } from './repositories.js';

const REPO_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'repositories.ts'),
  'utf8',
);

const TENANT_TYPES = [
  'MembershipRepository',
  'DocumentRepository',
  'DocumentRevisionRepository',
  'SignerRepository',
  'SigningSessionRepository',
  'SignatureFieldRepository',
  'ConsentRecordRepository',
  'FinalizedArtifactRepository',
  'AuditLogRepository',
  'OutboxEventRepository',
  'BackgroundJobRepository',
  'IdempotencyRecordRepository',
];

function methodsOf(typeName: string): string[] {
  const match = REPO_SOURCE.match(new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\};`));
  if (!match?.[1]) {
    throw new Error(`Could not find ${typeName}`);
  }
  return [...match[1].matchAll(/(\w+): \(input: \{([^}]+)\}/g)].map((entry) => {
    const method = entry[1];
    const args = entry[2];
    if (!method || args === undefined) {
      throw new Error(`Could not parse method in ${typeName}`);
    }
    return `${method}:${args}`;
  });
}

describe('tenant repository interfaces', () => {
  it('compiles only when every tenant-owned method requires organizationId', () => {
    expect(Object.values(TENANT_REPOSITORY_TYPE_GUARDS).every((value) => value === true)).toBe(
      true,
    );
  });

  it('declares organizationId on every tenant-owned repository method', () => {
    for (const typeName of TENANT_TYPES) {
      const methods = methodsOf(typeName);
      expect(methods.length, typeName).toBeGreaterThan(0);
      for (const method of methods) {
        expect(method, `${typeName}.${method}`).toContain('organizationId');
      }
    }
  });
});
