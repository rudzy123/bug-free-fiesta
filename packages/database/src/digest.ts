import { createHash } from 'node:crypto';
import {
  AUDIT_CHAIN_SCHEMA_VERSION,
  AUDIT_GENESIS_PREVIOUS_EVENT_HASH,
  computeAuditEventHash as computeCanonicalAuditEventHash,
} from '@esign/domain';
import { AuditActorType, AuditEventType, Prisma } from './generated/client/index.js';

export { AUDIT_GENESIS_PREVIOUS_EVENT_HASH, AUDIT_CHAIN_SCHEMA_VERSION };

export const AUDIT_EVENT_TYPE_DB: Record<AuditEventType, string> = {
  [AuditEventType.documentCreated]: 'document_created',
  [AuditEventType.revisionAdded]: 'revision_added',
  [AuditEventType.fieldsUpdated]: 'fields_updated',
  [AuditEventType.signersUpdated]: 'signers_updated',
  [AuditEventType.documentSent]: 'document_sent',
  [AuditEventType.sessionIssued]: 'session_issued',
  [AuditEventType.sessionRevoked]: 'session_revoked',
  [AuditEventType.sessionExchanged]: 'session_exchanged',
  [AuditEventType.documentViewed]: 'document_viewed',
  [AuditEventType.consentRecorded]: 'consent_recorded',
  [AuditEventType.signerSigned]: 'signer_signed',
  [AuditEventType.signerDeclined]: 'signer_declined',
  [AuditEventType.documentVoided]: 'document_voided',
  [AuditEventType.documentExpired]: 'document_expired',
  [AuditEventType.finalizationStarted]: 'finalization_started',
  [AuditEventType.documentFinalized]: 'document_finalized',
  [AuditEventType.finalizationFailed]: 'finalization_failed',
  [AuditEventType.artifactDownloaded]: 'artifact_downloaded',
  [AuditEventType.inspectionAccepted]: 'inspection_accepted',
  [AuditEventType.inspectionRejected]: 'inspection_rejected',
  [AuditEventType.uploadAbandoned]: 'upload_abandoned',
};

export const AUDIT_ACTOR_TYPE_DB: Record<AuditActorType, string> = {
  [AuditActorType.accountUser]: 'account_user',
  [AuditActorType.signer]: 'signer',
  [AuditActorType.worker]: 'worker',
  [AuditActorType.system]: 'system',
};

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Deterministic digest for tests and seeds. Not a digest of a real PDF. */
export function syntheticSha256(label: string): string {
  return sha256Hex(`esign-synthetic:${label}`);
}

function payloadRecord(payload: Prisma.InputJsonValue): Readonly<Record<string, unknown>> {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    return payload as Readonly<Record<string, unknown>>;
  }
  return { value: payload };
}

export function computeAuditEventHash(input: {
  previousEventHash: string;
  sequence: number;
  type: string;
  actorType: string;
  actorId: string;
  occurredAt: Date;
  payload: Prisma.InputJsonValue;
  schemaVersion?: number;
}): string {
  return computeCanonicalAuditEventHash({
    schemaVersion: input.schemaVersion ?? AUDIT_CHAIN_SCHEMA_VERSION,
    previousEventHash: input.previousEventHash,
    sequence: input.sequence,
    type: input.type,
    actorType: input.actorType,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    payload: payloadRecord(input.payload),
  });
}
