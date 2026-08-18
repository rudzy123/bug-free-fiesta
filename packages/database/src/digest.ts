import { createHash } from 'node:crypto';
import { AuditActorType, AuditEventType, Prisma } from './generated/client/index.js';

/** Genesis `previousEventHash` for sequence 0. 64 zero hex chars, not the word "genesis", so SHA-256 CHECKs hold. */
export const AUDIT_GENESIS_PREVIOUS_EVENT_HASH = '0'.repeat(64);

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

export function computeAuditEventHash(input: {
  previousEventHash: string;
  sequence: number;
  type: string;
  actorType: string;
  actorId: string;
  occurredAt: Date;
  payload: Prisma.InputJsonValue;
}): string {
  const canonical = JSON.stringify({
    previousEventHash: input.previousEventHash,
    sequence: input.sequence,
    type: input.type,
    actorType: input.actorType,
    actorId: input.actorId,
    occurredAt: input.occurredAt.toISOString(),
    payload: input.payload,
  });
  return sha256Hex(canonical);
}
