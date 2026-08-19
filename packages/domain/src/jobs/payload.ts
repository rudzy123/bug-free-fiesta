import { ValidationError } from '../errors.js';
import { isOpaqueId } from '../organization-context.js';

const FORBIDDEN_PAYLOAD_KEY_PATTERN =
  /token|secret|password|signature|pdf|png|bytes|cookie|authorization|raw|image|ink/i;

const MAX_PAYLOAD_KEYS = 16;

export function assertSafeJobPayload(
  payload: Readonly<Record<string, unknown>>,
): asserts payload is Readonly<Record<string, string>> {
  const keys = Object.keys(payload);
  if (keys.length > MAX_PAYLOAD_KEYS) {
    throw new ValidationError({ reason: 'job_payload_too_large' });
  }
  for (const key of keys) {
    if (FORBIDDEN_PAYLOAD_KEY_PATTERN.test(key)) {
      throw new ValidationError({ field: key, reason: 'forbidden_job_payload_key' });
    }
    const value = payload[key];
    if (typeof value !== 'string' || !isOpaqueId(value)) {
      throw new ValidationError({ field: key, reason: 'job_payload_must_be_opaque_id' });
    }
  }
}
