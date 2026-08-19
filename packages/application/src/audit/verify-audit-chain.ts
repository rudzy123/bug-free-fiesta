import {
  AUDIT_CHAIN_SCHEMA_VERSION,
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  artifactObjectKey,
  assertApprovedAuditPayload,
  computeAuditEventHash,
  NotFoundError,
  type AuditEvent,
  type AuditLogRepository,
  type AuditVerificationAlertSink,
  type AuditVerificationFailure,
  type AuditVerificationMetrics,
  type AuditVerificationReport,
  type AuditVerificationWarning,
  type AuthorizationPolicy,
  type Clock,
  type DocumentRepository,
  type FinalizedArtifactRepository,
  type Hashing,
  type ImmutableCheckpointStore,
  type ObjectStorage,
  type OrganizationAuditVerificationReport,
  type RequestActor,
} from '@esign/domain';

export type VerifyAuditChainInput = {
  readonly organizationId: string;
  readonly documentId: string;
  readonly actor?: RequestActor;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(
  code: AuditVerificationFailure['code'],
  input: VerifyAuditChainInput,
  event: AuditEvent | null,
): AuditVerificationFailure {
  return {
    code,
    organizationId: input.organizationId,
    documentId: input.documentId,
    sequence: event?.sequence ?? null,
    eventId: event?.id ?? null,
  };
}

function authorize(
  deps: { authorization: AuthorizationPolicy },
  actor: RequestActor,
  resource: { organizationId: string; documentId?: string },
): void {
  if (actor.type === 'account_user') {
    deps.authorization.assertAllowed(actor, 'audit.verify', resource);
    return;
  }
  if (actor.type === 'worker' || actor.type === 'system') {
    deps.authorization.assertAllowed(actor, 'job.process', resource);
    return;
  }
  deps.authorization.assertAllowed(actor, 'audit.verify', resource);
}

async function verifyFinalizedArtifact(
  deps: {
    artifacts: FinalizedArtifactRepository;
    storage: ObjectStorage;
    hashing: Hashing;
  },
  input: VerifyAuditChainInput,
  event: AuditEvent,
  failures: AuditVerificationFailure[],
): Promise<void> {
  const digest =
    isRecord(event.payload) && typeof event.payload.finalizedSha256 === 'string'
      ? event.payload.finalizedSha256
      : null;
  const artifact = await deps.artifacts.findByDocument({
    organizationId: input.organizationId,
    documentId: input.documentId,
  });
  if (artifact === null) {
    failures.push(failure('ARTIFACT_MISSING', input, event));
    return;
  }
  if (digest !== null && artifact.sha256Digest !== digest) {
    failures.push(failure('ARTIFACT_DIGEST_MISMATCH', input, event));
  }
  const stored = await deps.storage.getObject({
    organizationId: input.organizationId,
    key: artifact.objectKey,
  });
  const body = stored?.body
    ? stored.body
    : (
        await deps.storage.getObject({
          organizationId: input.organizationId,
          key: artifactObjectKey(input.organizationId, artifact.sha256Digest),
        })
      )?.body;
  if (body === undefined) {
    failures.push(failure('ARTIFACT_MISSING', input, event));
    return;
  }
  if (deps.hashing.sha256Hex(body) !== artifact.sha256Digest) {
    failures.push(failure('ARTIFACT_DIGEST_MISMATCH', input, event));
  }
}

export function createVerifyAuditChain(deps: {
  authorization: AuthorizationPolicy;
  documents: DocumentRepository;
  auditLogs: AuditLogRepository;
  artifacts: FinalizedArtifactRepository;
  storage: ObjectStorage;
  hashing: Hashing;
  clock: Clock;
  checkpoints: ImmutableCheckpointStore;
  metrics: AuditVerificationMetrics;
  alerts: AuditVerificationAlertSink;
}) {
  return async function verifyAuditChain(
    input: VerifyAuditChainInput,
  ): Promise<AuditVerificationReport> {
    if (input.actor !== undefined) {
      authorize(deps, input.actor, {
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
    }
    const document = await deps.documents.findById({
      organizationId: input.organizationId,
      documentId: input.documentId,
    });
    if (!document) {
      throw new NotFoundError({ resource: 'document' });
    }

    const events = [
      ...(await deps.auditLogs.listByDocument({
        organizationId: input.organizationId,
        documentId: input.documentId,
      })),
    ];
    const failures: AuditVerificationFailure[] = [];
    const warnings: AuditVerificationWarning[] = [];
    const checkedAt = deps.clock.nowUtc().toISOString();

    if (events.length === 0) {
      const report: AuditVerificationReport = {
        ok: false,
        schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
        organizationId: input.organizationId,
        documentId: input.documentId,
        eventCount: 0,
        checkedAt,
        headEventHash: null,
        headSequence: null,
        failures: [failure('EMPTY_CHAIN', input, null)],
        warnings,
      };
      await publishOutcome(deps, report);
      return report;
    }

    const sequences = events.map((event) => event.sequence);
    const sorted = [...events].sort((left, right) => left.sequence - right.sequence);
    if (sequences.some((sequence, index) => sequence !== index)) {
      if (
        sequences.some((sequence, index) => index > 0 && sequence < (sequences[index - 1] ?? 0))
      ) {
        failures.push(failure('SEQUENCE_REORDER', input, events[0] ?? null));
      } else {
        failures.push(
          failure(
            'SEQUENCE_GAP',
            input,
            events.find((event, index) => event.sequence !== index) ?? null,
          ),
        );
      }
    }

    for (let index = 0; index < sorted.length; index += 1) {
      const event = sorted[index];
      if (event === undefined) {
        continue;
      }
      if (event.chainVersion !== AUDIT_CHAIN_SCHEMA_VERSION) {
        failures.push(failure('UNSUPPORTED_SCHEMA_VERSION', input, event));
      }
      const expectedPrevious =
        index === 0 ? AUDIT_GENESIS_PREVIOUS_EVENT_HASH : (sorted[index - 1]?.eventHash ?? '');
      if (index === 0 && event.previousEventHash !== AUDIT_GENESIS_PREVIOUS_EVENT_HASH) {
        failures.push(failure('GENESIS_PREVIOUS_HASH_MISMATCH', input, event));
      } else if (event.previousEventHash !== expectedPrevious) {
        failures.push(failure('PREVIOUS_HASH_MISMATCH', input, event));
      }
      if (!isRecord(event.payload)) {
        failures.push(failure('FORBIDDEN_PAYLOAD_FIELD', input, event));
      } else {
        try {
          assertApprovedAuditPayload(event.payload);
        } catch {
          failures.push(failure('FORBIDDEN_PAYLOAD_FIELD', input, event));
        }
      }
      try {
        const expectedHash = computeAuditEventHash({
          schemaVersion: event.chainVersion,
          previousEventHash: event.previousEventHash,
          sequence: event.sequence,
          type: event.type,
          actorType: event.actorType,
          actorId: event.actorId,
          occurredAt: event.occurredAt,
          payload: isRecord(event.payload) ? event.payload : {},
        });
        if (expectedHash !== event.eventHash) {
          failures.push(failure('HASH_MISMATCH', input, event));
        }
      } catch {
        failures.push(failure('HASH_MISMATCH', input, event));
      }
      if (event.type === 'document_finalized') {
        await verifyFinalizedArtifact(deps, input, event, failures);
      }
    }

    if (!deps.checkpoints.enabled) {
      warnings.push({
        code: 'CHECKPOINT_ANCHORING_DISABLED',
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
    } else {
      try {
        const anchored = await deps.checkpoints.getLatest({
          organizationId: input.organizationId,
          documentId: input.documentId,
        });
        if (anchored) {
          const atSequence = sorted.find((event) => event.sequence === anchored.sequence);
          if (!atSequence || atSequence.eventHash !== anchored.eventHash) {
            failures.push(failure('CHECKPOINT_MISMATCH', input, atSequence ?? null));
          }
        }
      } catch {
        warnings.push({
          code: 'CHECKPOINT_STORE_UNAVAILABLE',
          organizationId: input.organizationId,
          documentId: input.documentId,
        });
      }
    }

    const head = sorted[sorted.length - 1];
    const uniqueFailures = dedupeFailures(failures);
    const report: AuditVerificationReport = {
      ok: uniqueFailures.length === 0,
      schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
      organizationId: input.organizationId,
      documentId: input.documentId,
      eventCount: events.length,
      checkedAt,
      headEventHash: head?.eventHash ?? null,
      headSequence: head?.sequence ?? null,
      failures: uniqueFailures,
      warnings,
    };

    if (report.ok && deps.checkpoints.enabled && head) {
      try {
        await deps.checkpoints.putIfAbsent({
          organizationId: input.organizationId,
          documentId: input.documentId,
          sequence: head.sequence,
          eventHash: head.eventHash,
          schemaVersion: AUDIT_CHAIN_SCHEMA_VERSION,
          anchoredAt: deps.clock.nowUtc(),
        });
      } catch {
        warnings.push({
          code: 'CHECKPOINT_STORE_UNAVAILABLE',
          organizationId: input.organizationId,
          documentId: input.documentId,
        });
      }
    }

    await publishOutcome(deps, report);
    return report;
  };
}

export type VerifyAuditChain = ReturnType<typeof createVerifyAuditChain>;

export function createVerifyOrganizationAuditChains(
  deps: Parameters<typeof createVerifyAuditChain>[0],
) {
  const verifyDocument = createVerifyAuditChain(deps);
  return async function verifyOrganizationAuditChains(input: {
    organizationId: string;
    actor?: RequestActor;
    documentId?: string;
  }): Promise<OrganizationAuditVerificationReport> {
    if (input.actor !== undefined) {
      authorize(deps, input.actor, { organizationId: input.organizationId });
    }
    const documents =
      input.documentId === undefined
        ? await deps.documents.listByOrganization({ organizationId: input.organizationId })
        : [
            (await deps.documents.findById({
              organizationId: input.organizationId,
              documentId: input.documentId,
            })) ??
              (() => {
                throw new NotFoundError({ resource: 'document' });
              })(),
          ];
    const reports: AuditVerificationReport[] = [];
    for (const document of documents) {
      reports.push(
        await verifyDocument({
          organizationId: input.organizationId,
          documentId: document.id,
          actor: input.actor,
        }),
      );
    }
    const failedDocumentCount = reports.filter((report) => !report.ok).length;
    return {
      ok: failedDocumentCount === 0,
      organizationId: input.organizationId,
      documentCount: reports.length,
      failedDocumentCount,
      checkedAt: deps.clock.nowUtc().toISOString(),
      reports,
    };
  };
}

export type VerifyOrganizationAuditChains = ReturnType<typeof createVerifyOrganizationAuditChains>;

function dedupeFailures(failures: readonly AuditVerificationFailure[]): AuditVerificationFailure[] {
  const seen = new Set<string>();
  const unique: AuditVerificationFailure[] = [];
  for (const item of failures) {
    const key = `${item.code}:${item.sequence ?? 'none'}:${item.eventId ?? 'none'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

async function publishOutcome(
  deps: {
    metrics: AuditVerificationMetrics;
    alerts: AuditVerificationAlertSink;
  },
  report: AuditVerificationReport,
): Promise<void> {
  const failureCodes = report.failures.map((item) => item.code);
  deps.metrics.recordVerified({ ok: report.ok, failureCodes });
  if (!report.ok) {
    await deps.alerts.notify({
      severity: 'high',
      code: 'audit_verification_failed',
      organizationId: report.organizationId,
      documentId: report.documentId,
      failureCodes,
      sequence: report.failures[0]?.sequence ?? report.headSequence,
    });
  }
}
