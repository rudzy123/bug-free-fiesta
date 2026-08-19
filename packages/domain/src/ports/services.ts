import type {
  AuditActorType,
  AuditEvent,
  AuditEventType,
  Document,
  OutboxEvent,
  Signer,
} from '../entities.js';

export type Clock = {
  nowUtc: () => Date;
};

export type IdGenerator = {
  next: () => string;
};

export type Hashing = {
  sha256Hex: (value: string | Uint8Array) => string;
};

export type SigningTokenGenerator = {
  generateRawToken: () => string;
};

export type SigningTokenHasher = {
  hash: (rawToken: string) => string;
};

export type StoredObjectMetadata = {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256Digest: string;
};

export type ObjectStorage = {
  putObject: (input: {
    organizationId: string;
    key: string;
    body: Uint8Array;
    contentType: string;
    maxBytes?: number;
  }) => Promise<StoredObjectMetadata>;
  getObject: (input: {
    organizationId: string;
    key: string;
  }) => Promise<{ body: Uint8Array; contentType: string } | null>;
  deleteObject: (input: { organizationId: string; key: string }) => Promise<void>;
};

export type DocumentInspectionOutcome = {
  readonly status: 'accepted' | 'rejected';
  readonly reasonCode: string | null;
};

export type DocumentInspector = {
  inspect: (input: {
    organizationId: string;
    documentId: string;
    revisionId: string;
    contentType: string;
    body: Uint8Array;
  }) => Promise<DocumentInspectionOutcome>;
};

export type NewAuditEvent = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly type: AuditEventType;
  readonly actorType: AuditActorType;
  readonly actorId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestId?: string | null;
};

export type AuditWriter = {
  append: (input: NewAuditEvent) => Promise<AuditEvent>;
};

export type JobPublishInput = {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId?: string | null;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly requestId?: string | null;
  readonly availableAt?: Date;
  readonly jobId?: string;
  readonly maxAttempts?: number;
};

export type JobPublisher = {
  publish: (input: JobPublishInput) => Promise<OutboxEvent>;
};

export type SigningInvitation = {
  readonly organizationId: string;
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
  readonly to: string | null;
  readonly expiresAt: Date;
  /** Outbox event id. Safe to persist; never a signing token. */
  readonly idempotencyKey?: string;
  /** Present only in memory for first delivery. Never persist or log in production. */
  readonly rawToken?: string;
};

export type UnitIntervalRandom = {
  next: () => number;
};

export type Notifier = {
  sendSigningInvitation: (message: SigningInvitation) => Promise<void>;
};

export type ClientRequestMetadata = {
  readonly untrustedClientIp: string | null;
  readonly untrustedUserAgent: string | null;
};

export type ConsentDisclosure = {
  readonly copyId: string;
  readonly version: string;
  readonly title: string;
  readonly text: string;
};

export type ConsentDisclosureCatalog = {
  current: () => ConsentDisclosure;
  findByCopyId: (copyId: string) => ConsentDisclosure | null;
};

export type SigningEnvelopePolicy = {
  requiresAccountAuth: (input: { document: Document; signer: Signer }) => boolean;
};
