# Runbook: audit verification failure

**Severity:** high (page security). A hash mismatch, sequence gap, previous-hash break, or finalized-artifact digest mismatch means the integrity control failed or data was altered. Treat as a security incident until proven otherwise (verifier bug, ops mistake, or attack).

This control is not a legal certification. **Legal review required** before telling customers what the event “means” legally.

The hash chain, PostgreSQL triggers, and `esign_app` grants detect application-level edits. They do **not** prevent a privileged database administrator from replacing the entire chain with a newly hashed history. External checkpoint anchoring ([ADR-0015](../architecture/adrs/0015-audit-checkpoint-anchoring.md)) is required for that threat. If checkpoints were disabled or also replaced, do not claim the chain is authentic.

## Symptoms

- Scheduled worker job or `pnpm audit:verify -- --organization-id <uuid>` reports `ok: false`.
- Admin `POST /organizations/:organizationId/documents/:documentId/audit/verify` returns failures.
- Metrics: `verifiedFailed` increment; logs with `severity: high` and `alertCode: audit_verification_failed`.
- Gap in `sequence` for a `documentId`, or `prevHash` / `eventHash` mismatch.
- Application error on insert (unique sequence or permission denied on UPDATE — that deny is expected; a successful UPDATE is the incident).
- Customer report that a completion certificate does not match current bytes.

## Immediate actions

1. Do **not** “fix” rows by updating hashes, deleting events, or rewriting `previousEventHash`.
2. Do **not** restore a backup over the live chain without an incident commander; that can destroy evidence.
3. Do **not** log event payloads that may contain Confidential data into chat.
4. Snapshot evidence: verifier JSON (`failures`, `headEventHash`, `headSequence`), `organizationId`, `documentId`, first failing `sequence`, UTC time, correlation ids, whether `AUDIT_CHECKPOINT_STORE` was enabled.
5. Restrict write access to the audit table if an insider or compromised app role is possible.
6. Preserve object-storage checkpoint keys under `org/{organizationId}/audit-checkpoints/` if present.

## Diagnosis

1. Re-run verification read-only:

   ```bash
   pnpm audit:verify -- --organization-id <uuid> --document-id <uuid>
   ```

   Or the authenticated admin endpoint as an `owner` or `admin` membership (not `member` / `read_only`).

2. Classify using the typed failure code:

| Code                                | Meaning                                             |
| ----------------------------------- | --------------------------------------------------- |
| `EMPTY_CHAIN`                       | Document exists with no audit events                |
| `SEQUENCE_GAP` / `SEQUENCE_REORDER` | Missing or reordered sequences                      |
| `HASH_MISMATCH`                     | Canonical payload/metadata/timestamp does not match |
| `PREVIOUS_HASH_MISMATCH`            | Broken link to the previous event                   |
| `GENESIS_PREVIOUS_HASH_MISMATCH`    | Sequence 0 previous hash is not 64 zero hex chars   |
| `ARTIFACT_DIGEST_MISMATCH`          | Finalized object bytes ≠ stored SHA-256             |
| `ARTIFACT_MISSING`                  | Finalized event without matching object             |
| `FORBIDDEN_PAYLOAD_FIELD`           | Payload contains a disallowed key                   |
| `CHECKPOINT_MISMATCH`               | Live head disagrees with independently stored hash  |
| `UNSUPPORTED_SCHEMA_VERSION`        | Row `chainVersion` is not the verifier’s version    |

3. Compare live rows to the most recent backup **copy** (not an in-place restore) and to checkpoint objects if anchoring was enabled.
4. Check application logs around `occurredAt` of the failing event for deploys, migrations, or manual SQL.

## Remediation

- **Verifier bug or `chainVersion` mismatch:** stop the bad verifier; do not rewrite history. Add a versioned verifier that can read old canonicalization. Ship a fix.
- **Missing insert (application bug):** if the domain action actually happened, this is a reliability incident; do **not** backfill fake hashes.
- **Confirmed alteration:** incident response: rotate credentials, preserve forensic copies, assess tenant impact. **Legal review required** for customer notification.
- **Privileged DBA / backup rewrite:** assume the live chain may be a forgery. Rely on checkpoints in separately controlled immutable storage, offline exports, and infrastructure audit logs. There is no v1 procedure that silently rebuilds a chain and calls it the original.

## Verification

- Verifier clean on unaffected documents.
- Compromised document flagged and access policy applied.
- Root cause written in the incident record (internal).
- High-severity alert cleared only after `verifiedFailed` stops incrementing for that document.

## Escalation

Security lead immediately. Engineering lead for verifier bugs. Executive + legal if customer documents may have been altered.

## Prevention

`esign_app` without UPDATE/DELETE/TRUNCATE on `audit_logs`; triggers; per-document advisory locks on insert; canonical hashing of payload + previous hash + schema version; scheduled worker verification; admin endpoint + CLI; checkpoint anchoring to a separately administered WORM bucket; least-privilege operators.
