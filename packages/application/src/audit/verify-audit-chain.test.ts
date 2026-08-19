import { describe, expect, it } from 'vitest';
import {
  AUDIT_CHAIN_SCHEMA_VERSION,
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  AuthorizationError,
  NotFoundError,
  artifactObjectKey,
  computeAuditEventHash,
  type AuditEvent,
  type Document,
  type FinalizedArtifact,
} from '@esign/domain';
import { createMembershipAuthorizationPolicy } from '../authorization/membership-policy.js';
import { createMemoryDocumentRepository } from '../documents/memory-adapters.js';
import { createMemoryAuditWriter } from '../documents/memory-adapters.js';
import { createMemoryFinalizedArtifactStore } from '../documents/memory-adapters.js';
import { createMemoryObjectStorage } from '../ports/memory-object-storage.js';
import { createSha256Hashing } from '../ports/node-crypto.js';
import {
  createDisabledCheckpointStore,
  createMemoryCheckpointStore,
} from './memory-checkpoint-store.js';
import {
  createMemoryAuditVerificationMetrics,
  createRecordingAuditVerificationAlertSink,
} from './metrics.js';
import {
  createVerifyAuditChain,
  createVerifyOrganizationAuditChains,
} from './verify-audit-chain.js';
import { createRunScheduledAuditVerification } from './scheduled-verification.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '21111111-1111-4111-8111-111111111111';
const DOC = '44444444-4444-4444-8444-444444444444';
const DOC_B = '44444444-4444-4444-8444-444444444445';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-19T12:00:00.000Z');
const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');

function documentRecord(id: string, organizationId = ORG): Document {
  return {
    id,
    organizationId,
    ownerMembershipId: '22222222-2222-4222-8222-222222222222',
    title: 'NDA',
    state: 'finalized',
    signingMode: 'ordered',
    inspectionStatus: 'accepted',
    sourceDisplayName: 'nda.pdf',
    expiresAt: null,
    currentRevisionId: null,
    signingRevisionId: null,
    version: 1,
    leaseOwner: null,
    leaseUntil: null,
    finalizationAttemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function adminActor(organizationId = ORG) {
  return {
    type: 'account_user' as const,
    userId: ACTOR,
    membership: {
      membershipId: '77777777-7777-4777-8777-777777777777',
      organizationId,
      role: 'admin' as const,
    },
  };
}

function hashInput(event: Omit<AuditEvent, 'eventHash' | 'createdAt'>): string {
  return computeAuditEventHash({
    schemaVersion: event.chainVersion,
    previousEventHash: event.previousEventHash,
    sequence: event.sequence,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    occurredAt: event.occurredAt,
    payload: event.payload,
  });
}

function makeEvent(
  overrides: Partial<AuditEvent> & Pick<AuditEvent, 'sequence' | 'type' | 'previousEventHash'>,
): AuditEvent {
  const base = {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${overrides.sequence}`,
    organizationId: ORG,
    documentId: DOC,
    actorType: 'account_user' as const,
    actorId: ACTOR,
    occurredAt: NOW,
    payload: { documentId: DOC },
    requestId: null,
    chainVersion: AUDIT_CHAIN_SCHEMA_VERSION,
    createdAt: NOW,
    ...overrides,
  };
  return {
    ...base,
    eventHash: overrides.eventHash ?? hashInput(base),
  };
}

async function validChain(): Promise<AuditEvent[]> {
  const writer = createMemoryAuditWriter();
  await writer.append({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
    organizationId: ORG,
    documentId: DOC,
    type: 'document_created',
    actorType: 'account_user',
    actorId: ACTOR,
    occurredAt: NOW,
    payload: { documentId: DOC },
  });
  const hashing = createSha256Hashing();
  const digest = hashing.sha256Hex(PDF);
  await writer.append({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    organizationId: ORG,
    documentId: DOC,
    type: 'document_finalized',
    actorType: 'worker',
    actorId: 'job-1',
    occurredAt: NOW,
    payload: { documentId: DOC, finalizedSha256: digest },
  });
  return writer.events.filter((event) => event.documentId === DOC);
}

async function harness(options: {
  events?: AuditEvent[];
  documents?: Document[];
  artifact?: FinalizedArtifact | null;
  corruptStored?: boolean;
  checkpoints?:
    | ReturnType<typeof createMemoryCheckpointStore>
    | ReturnType<typeof createDisabledCheckpointStore>;
}) {
  const hashing = createSha256Hashing();
  const digest = hashing.sha256Hex(PDF);
  const storage = createMemoryObjectStorage();
  const documents = createMemoryDocumentRepository(
    options.documents ?? [documentRecord(DOC), documentRecord(DOC_B)],
  );
  const artifacts = createMemoryFinalizedArtifactStore(
    options.artifact === null
      ? []
      : [
          options.artifact ?? {
            id: '99999999-9999-4999-8999-999999999999',
            organizationId: ORG,
            documentId: DOC,
            objectKey: artifactObjectKey(ORG, digest),
            contentType: 'application/pdf',
            sizeBytes: BigInt(PDF.byteLength),
            sha256Digest: digest,
            createdAt: NOW,
          },
        ],
  );
  const body = options.corruptStored === true ? new TextEncoder().encode('%PDF-tampered\n') : PDF;
  const putDigest = hashing.sha256Hex(body);
  const artifactKey = options.artifact?.objectKey ?? artifactObjectKey(ORG, digest);
  await storage.putObject({
    organizationId: ORG,
    key: artifactKey,
    body,
    contentType: 'application/pdf',
    expectedSha256Digest: putDigest,
  });
  const audit = createMemoryAuditWriter(options.events ?? []);
  const metrics = createMemoryAuditVerificationMetrics();
  const alerts = createRecordingAuditVerificationAlertSink();
  const checkpoints = options.checkpoints ?? createMemoryCheckpointStore();
  const verify = createVerifyAuditChain({
    authorization: createMembershipAuthorizationPolicy(),
    documents,
    auditLogs: audit.logs,
    artifacts,
    storage,
    hashing,
    clock: { nowUtc: () => new Date(NOW.getTime()) },
    checkpoints,
    metrics,
    alerts,
  });
  const verifyOrg = createVerifyOrganizationAuditChains({
    authorization: createMembershipAuthorizationPolicy(),
    documents,
    auditLogs: audit.logs,
    artifacts,
    storage,
    hashing,
    clock: { nowUtc: () => new Date(NOW.getTime()) },
    checkpoints,
    metrics,
    alerts,
  });
  return { verify, verifyOrg, audit, metrics, alerts, hashing, digest, checkpoints };
}

describe('audit chain verification', () => {
  it('accepts a valid chain and anchors a checkpoint', async () => {
    const events = await validChain();
    const h = await harness({ events });
    const report = await h.verify({ organizationId: ORG, documentId: DOC, actor: adminActor() });
    expect(report.ok).toBe(true);
    expect(report.eventCount).toBe(2);
    expect(report.headSequence).toBe(1);
    expect(report.failures).toEqual([]);
    expect(h.metrics.snapshot().verifiedOk).toBe(1);
    expect(h.alerts.alerts).toHaveLength(0);
    const anchored = await h.checkpoints.getLatest({ organizationId: ORG, documentId: DOC });
    expect(anchored?.eventHash).toBe(report.headEventHash);
  });

  it('fails an empty chain', async () => {
    const h = await harness({ events: [] });
    const report = await h.verify({ organizationId: ORG, documentId: DOC, actor: adminActor() });
    expect(report.ok).toBe(false);
    expect(report.failures.map((item) => item.code)).toEqual(['EMPTY_CHAIN']);
    expect(h.alerts.alerts[0]?.severity).toBe('high');
  });

  it('detects changed metadata', async () => {
    const events = await validChain();
    const mutated = events.map((event, index) =>
      index === 0
        ? makeEvent({ ...event, type: 'document_voided', eventHash: event.eventHash })
        : event,
    );
    const h = await harness({ events: mutated });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.failures.some((item) => item.code === 'HASH_MISMATCH')).toBe(true);
  });

  it('detects changed timestamps', async () => {
    const events = await validChain();
    const mutated = events.map((event, index) =>
      index === 0
        ? makeEvent({
            ...event,
            occurredAt: new Date('2026-01-01T00:00:00.000Z'),
            eventHash: event.eventHash,
          })
        : event,
    );
    const h = await harness({ events: mutated });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.failures.some((item) => item.code === 'HASH_MISMATCH')).toBe(true);
  });

  it('detects a removed event', async () => {
    const writer = createMemoryAuditWriter();
    await writer.append({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
      organizationId: ORG,
      documentId: DOC,
      type: 'document_created',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC },
    });
    await writer.append({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      organizationId: ORG,
      documentId: DOC,
      type: 'revision_added',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC, revisionId: '88888888-8888-4888-8888-888888888888' },
    });
    await writer.append({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      organizationId: ORG,
      documentId: DOC,
      type: 'document_sent',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC },
    });
    const gap = [writer.events[0]!, writer.events[2]!];
    const h = await harness({ events: gap, artifact: null });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.failures.some((item) => item.code === 'SEQUENCE_GAP')).toBe(true);
  });

  it('detects reordered events', async () => {
    const events = await validChain();
    const reordered = [events[1]!, events[0]!];
    const h = await harness({ events: reordered });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.failures.some((item) => item.code === 'SEQUENCE_REORDER')).toBe(true);
  });

  it('detects a replaced event', async () => {
    const events = await validChain();
    const replacement = makeEvent({
      sequence: 1,
      type: 'document_voided',
      previousEventHash: events[0]!.eventHash,
      payload: { documentId: DOC, reason: 'replaced' },
    });
    const h = await harness({ events: [events[0]!, replacement] });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.ok).toBe(true);
    const swappedHash = {
      ...replacement,
      eventHash: events[1]!.eventHash,
    };
    const tampered = await harness({ events: [events[0]!, swappedHash] });
    const failed = await tampered.verify({ organizationId: ORG, documentId: DOC });
    expect(failed.failures.some((item) => item.code === 'HASH_MISMATCH')).toBe(true);
  });

  it('detects a broken previous hash', async () => {
    const events = await validChain();
    const broken = makeEvent({
      ...events[1]!,
      previousEventHash: 'f'.repeat(64),
      eventHash: events[1]!.eventHash,
    });
    const h = await harness({ events: [events[0]!, broken] });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.failures.some((item) => item.code === 'PREVIOUS_HASH_MISMATCH')).toBe(true);
  });

  it('detects a modified finalized object', async () => {
    const events = await validChain();
    const h = await harness({ events, corruptStored: true });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.failures.some((item) => item.code === 'ARTIFACT_DIGEST_MISMATCH')).toBe(true);
  });

  it('isolates chains across multiple documents', async () => {
    const writer = createMemoryAuditWriter();
    await writer.append({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
      organizationId: ORG,
      documentId: DOC,
      type: 'document_created',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC },
    });
    await writer.append({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0',
      organizationId: ORG,
      documentId: DOC_B,
      type: 'document_created',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC_B },
    });
    const h = await harness({
      events: writer.events,
      artifact: null,
      documents: [documentRecord(DOC, ORG), documentRecord(DOC_B, ORG)],
    });
    const orgReport = await h.verifyOrg({ organizationId: ORG, actor: adminActor() });
    expect(orgReport.documentCount).toBe(2);
    expect(orgReport.reports.every((report) => report.ok)).toBe(true);
    expect(orgReport.reports[0]?.documentId).not.toBe(orgReport.reports[1]?.documentId);
  });

  it('serializes concurrent inserts per document so the chain stays ordered', async () => {
    const writer = createMemoryAuditWriter();
    await Promise.all([
      writer.append({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
        organizationId: ORG,
        documentId: DOC,
        type: 'document_created',
        actorType: 'system',
        actorId: 'system',
        occurredAt: NOW,
        payload: { documentId: DOC, tag: 'a' },
      }),
      writer.append({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        organizationId: ORG,
        documentId: DOC,
        type: 'revision_added',
        actorType: 'system',
        actorId: 'system',
        occurredAt: NOW,
        payload: { documentId: DOC, tag: 'b' },
      }),
    ]);
    const chained = writer.events.filter((event) => event.documentId === DOC);
    expect(chained.map((event) => event.sequence).sort()).toEqual([0, 1]);
    const genesis = chained.find((event) => event.sequence === 0);
    const next = chained.find((event) => event.sequence === 1);
    expect(genesis?.previousEventHash).toBe(AUDIT_GENESIS_PREVIOUS_EVENT_HASH);
    expect(next?.previousEventHash).toBe(genesis?.eventHash);
    const h = await harness({ events: chained, artifact: null });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.ok).toBe(true);
  });

  it('does not allow a member to verify audit chains', async () => {
    const events = await validChain();
    const h = await harness({ events });
    await expect(
      h.verify({
        organizationId: ORG,
        documentId: DOC,
        actor: {
          type: 'account_user',
          userId: ACTOR,
          membership: {
            membershipId: '77777777-7777-4777-8777-777777777777',
            organizationId: ORG,
            role: 'member',
          },
        },
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects verification for a missing document', async () => {
    const h = await harness({ events: [] });
    await expect(
      h.verify({
        organizationId: ORG,
        documentId: '00000000-0000-4000-8000-000000000000',
        actor: adminActor(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('warns when checkpoint anchoring is disabled', async () => {
    const events = await validChain();
    const h = await harness({ events, checkpoints: createDisabledCheckpointStore() });
    const report = await h.verify({ organizationId: ORG, documentId: DOC });
    expect(report.ok).toBe(true);
    expect(report.warnings.map((item) => item.code)).toEqual(['CHECKPOINT_ANCHORING_DISABLED']);
  });

  it('runs scheduled verification across organizations', async () => {
    const writer = createMemoryAuditWriter();
    await writer.append({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
      organizationId: ORG,
      documentId: DOC,
      type: 'document_created',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC },
    });
    await writer.append({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0',
      organizationId: OTHER_ORG,
      documentId: DOC_B,
      type: 'document_created',
      actorType: 'system',
      actorId: 'system',
      occurredAt: NOW,
      payload: { documentId: DOC_B },
    });
    const documents = createMemoryDocumentRepository([
      documentRecord(DOC),
      documentRecord(DOC_B, OTHER_ORG),
    ]);
    const hashing = createSha256Hashing();
    const metrics = createMemoryAuditVerificationMetrics();
    const alerts = createRecordingAuditVerificationAlertSink();
    const deps = {
      authorization: createMembershipAuthorizationPolicy(),
      documents,
      auditLogs: writer.logs,
      artifacts: createMemoryFinalizedArtifactStore(),
      storage: createMemoryObjectStorage(),
      hashing,
      clock: { nowUtc: () => new Date(NOW.getTime()) },
      checkpoints: createDisabledCheckpointStore(),
      metrics,
      alerts,
    };
    const scheduled = createRunScheduledAuditVerification({
      listOrganizationIds: async () => [ORG, OTHER_ORG],
      verifyOrganization: createVerifyOrganizationAuditChains(deps),
      clock: { nowUtc: () => new Date(NOW.getTime()) },
    });
    const result = await scheduled();
    expect(result.organizationCount).toBe(2);
    expect(result.documentCount).toBe(2);
  });
});
