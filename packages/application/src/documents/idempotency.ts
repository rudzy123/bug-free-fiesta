import {
  ConflictError,
  ValidationError,
  type Hashing,
  type IdempotencyRecord,
  type IdempotencyRecordRepository,
  type IdGenerator,
} from '@esign/domain';

export const CREATE_DOCUMENT_ROUTE = 'POST /organizations/:organizationId/documents';

export function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? '';
  if (key.length < 8 || key.length > 128) {
    throw new ValidationError({ field: 'Idempotency-Key', reason: 'invalid' });
  }
  return key;
}

export async function replayOrBeginIdempotency(input: {
  records: IdempotencyRecordRepository;
  hashing: Hashing;
  ids: IdGenerator;
  organizationId: string;
  principalId: string;
  principalType?: IdempotencyRecord['principalType'];
  route: string;
  key: string;
  request: Readonly<Record<string, unknown>>;
  now: Date;
  ttlMs: number;
  reuseInProgress?: boolean;
}): Promise<{ replay: IdempotencyRecord } | { record: IdempotencyRecord }> {
  const requestHash = input.hashing.sha256Hex(stableJson(input.request));
  const existing = await input.records.find({
    organizationId: input.organizationId,
    principalId: input.principalId,
    route: input.route,
    key: input.key,
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ConflictError({ reason: 'idempotency_replay' });
    }
    if (existing.responseBody !== null && existing.responseStatus !== null) {
      return { replay: existing };
    }
    if (input.reuseInProgress === true) {
      return { record: existing };
    }
    throw new ConflictError({ reason: 'idempotency_in_progress' });
  }

  const record = await input.records.create({
    organizationId: input.organizationId,
    record: {
      id: input.ids.next(),
      organizationId: input.organizationId,
      principalType: input.principalType ?? 'account_user',
      principalId: input.principalId,
      route: input.route,
      key: input.key,
      requestHash,
      requestId: null,
      responseStatus: null,
      responseBody: null,
      expiresAt: new Date(input.now.getTime() + input.ttlMs),
      createdAt: input.now,
      updatedAt: input.now,
    },
  });
  return { record };
}

function stableJson(value: Readonly<Record<string, unknown>>): string {
  const keys = Object.keys(value).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    sorted[key] = value[key];
  }
  return JSON.stringify(sorted);
}
