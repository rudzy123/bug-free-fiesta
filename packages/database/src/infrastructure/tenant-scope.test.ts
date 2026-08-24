import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { IntegrityError, ValidationError, type Document } from '@esign/domain';
import { createPrismaAuditWriter } from './prisma-audit-writer.js';
import { createPrismaJobPublisher } from './prisma-job-publisher.js';
import {
  createPrismaDocumentRepository,
  createPrismaFinalizedArtifactRepository,
  createPrismaMembershipRepository,
  createPrismaSignerRepository,
  createPrismaTenantRepositories,
} from './prisma-tenant-repositories.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '44444444-4444-4444-8444-444444444444';
const SIGNER = '55555555-5555-4555-8555-555555555555';
const MEMBERSHIP = '77777777-7777-4777-8777-777777777777';
const USER = '33333333-3333-4333-8333-333333333333';

const INFRA_DIR = dirname(fileURLToPath(import.meta.url));

function document(organizationId = ORG): Document {
  const now = new Date('2026-08-17T12:00:00.000Z');
  return {
    id: DOC,
    organizationId,
    ownerMembershipId: MEMBERSHIP,
    title: 'NDA',
    state: 'draft',
    signingMode: 'ordered',
    inspectionStatus: 'pending',
    sourceDisplayName: null,
    expiresAt: null,
    currentRevisionId: null,
    signingRevisionId: null,
    version: 1,
    leaseOwner: null,
    leaseUntil: null,
    finalizationAttemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Prisma tenant repositories', () => {
  it('queries documents by the compound organizationId and id', async () => {
    const findUnique = vi.fn(async () => null);
    const repo = createPrismaDocumentRepository({ document: { findUnique } } as never);
    await repo.findById({ organizationId: ORG, documentId: DOC });
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId_id: { organizationId: ORG, id: DOC } },
    });
  });

  it('lists documents with an organizationId where clause', async () => {
    const findMany = vi.fn(async () => []);
    const repo = createPrismaDocumentRepository({ document: { findMany } } as never);
    await repo.listByOrganization({ organizationId: ORG });
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('refuses to query tenant documents without organizationId', async () => {
    const findUnique = vi.fn();
    const repo = createPrismaDocumentRepository({ document: { findUnique } } as never);
    await expect(repo.findById({ organizationId: '', documentId: DOC })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does not persist a document under a mismatched organizationId', async () => {
    const create = vi.fn();
    const repo = createPrismaDocumentRepository({ document: { create } } as never);
    await expect(
      repo.create({ organizationId: ORG, document: document(OTHER) }),
    ).rejects.toBeInstanceOf(IntegrityError);
    expect(create).not.toHaveBeenCalled();
  });

  it('scopes signer and membership lookups to organizationId', async () => {
    const signerFind = vi.fn(async () => null);
    const membershipFind = vi.fn(async () => null);
    await createPrismaSignerRepository({ signer: { findUnique: signerFind } } as never).findById({
      organizationId: ORG,
      signerId: SIGNER,
    });
    await createPrismaMembershipRepository({
      organizationMembership: { findUnique: membershipFind },
    } as never).findByUser({ organizationId: ORG, userId: USER });
    expect(signerFind).toHaveBeenCalledWith({
      where: { organizationId_id: { organizationId: ORG, id: SIGNER } },
    });
    expect(membershipFind).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: ORG, userId: USER } },
    });
  });

  it('never loads a finalized artifact by documentId alone', async () => {
    const findFirst = vi.fn(async () => null);
    const repo = createPrismaFinalizedArtifactRepository({
      finalizedArtifact: { findFirst },
    } as never);
    await repo.findByDocument({ organizationId: ORG, documentId: DOC });
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, documentId: DOC },
    });
  });

  it('exposes tenant-scoped methods on every tenant repository', () => {
    const repos = createPrismaTenantRepositories({} as never);
    expect(Object.keys(repos).sort()).toEqual(
      [
        'auditLogs',
        'backgroundJobs',
        'consentRecords',
        'documents',
        'finalizedArtifacts',
        'idempotencyRecords',
        'memberships',
        'organizations',
        'outboxEvents',
        'previewGrants',
        'revisions',
        'signatureFields',
        'signers',
        'signingSessions',
        'uploadSessions',
      ].sort(),
    );
  });
});

describe('Prisma audit writer and job publisher', () => {
  it('reads and writes audit rows with organizationId', async () => {
    const findFirst = vi.fn(async () => null);
    const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      ...args.data,
      chainVersion: 1,
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
    }));
    const executeRaw = vi.fn(async () => 0);
    const writer = createPrismaAuditWriter({
      $executeRaw: executeRaw,
      auditLog: { findFirst, create },
    } as never);
    await writer.append({
      id: '88888888-8888-4888-8888-888888888888',
      organizationId: ORG,
      documentId: DOC,
      type: 'document_created',
      actorType: 'account_user',
      actorId: USER,
      occurredAt: new Date('2026-08-17T12:00:00.000Z'),
      payload: { documentId: DOC },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, documentId: DOC },
      orderBy: { sequence: 'desc' },
    });
    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      organizationId: ORG,
      documentId: DOC,
    });
    expect(executeRaw).toHaveBeenCalled();
  });

  it('publishes outbox jobs with organizationId', async () => {
    const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      ...args.data,
      attemptCount: 0,
      processedAt: null,
      lastErrorCode: null,
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
    }));
    const publisher = createPrismaJobPublisher({ outboxEvent: { create } } as never);
    await publisher.publish({
      id: '99999999-9999-4999-8999-999999999999',
      organizationId: ORG,
      documentId: DOC,
      type: 'finalize_document',
      payload: { documentId: DOC },
    });
    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      organizationId: ORG,
      documentId: DOC,
    });
  });

  it('does not write audit or jobs without organizationId', async () => {
    const findFirst = vi.fn();
    const create = vi.fn();
    await expect(
      createPrismaAuditWriter({
        $executeRaw: vi.fn(async () => 0),
        auditLog: { findFirst, create },
      } as never).append({
        id: '88888888-8888-4888-8888-888888888888',
        organizationId: '',
        documentId: DOC,
        type: 'document_created',
        actorType: 'system',
        actorId: 'system',
        occurredAt: new Date(),
        payload: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createPrismaJobPublisher({ outboxEvent: { create } } as never).publish({
        id: '99999999-9999-4999-8999-999999999999',
        organizationId: '',
        type: 'finalize_document',
        payload: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('tenant query source guards', () => {
  it('does not look up tenant-owned rows by primary key alone', () => {
    const files = readdirSync(INFRA_DIR).filter(
      (name) => name.startsWith('prisma-') && name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    const violations: string[] = [];
    for (const file of files) {
      if (file === 'prisma-token-lookup.ts' || file === 'prisma-account-session.ts') {
        continue;
      }
      const source = readFileSync(join(INFRA_DIR, file), 'utf8');
      if (
        /findUnique\(\{\s*where:\s*\{\s*id:/.test(source) &&
        file !== 'prisma-tenant-repositories.ts'
      ) {
        violations.push(file);
      }
    }
    const tenantRepos = readFileSync(join(INFRA_DIR, 'prisma-tenant-repositories.ts'), 'utf8');
    expect(tenantRepos).toContain('tenantCompoundWhere');
    expect(tenantRepos).toContain('tenantScope');
    expect(tenantRepos).not.toMatch(/document\.findUnique\(\{\s*where:\s*\{\s*id:/);
    expect(tenantRepos).not.toMatch(/signer\.findUnique\(\{\s*where:\s*\{\s*id:/);
    expect(tenantRepos).not.toMatch(
      /finalizedArtifact\.find(?:Unique|First)\(\{\s*where:\s*\{\s*documentId:/,
    );
    expect(violations).toEqual([]);
  });
});
