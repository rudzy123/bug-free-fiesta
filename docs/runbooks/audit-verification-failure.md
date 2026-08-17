# Runbook: audit verification failure

**Severity:** critical. A hash mismatch or missing sequence means the integrity control failed or data was altered. Treat as a security incident until proven otherwise (bug, ops mistake, or attack).

This control is not a legal certification. **Legal review required** before telling customers what the event “means” legally.

## Symptoms

- Scheduled verifier reports `prevHash` / `thisHash` mismatch.
- Gap in `sequence` for a `documentId`.
- Application error on insert (unique sequence or permission denied on UPDATE — that is expected deny; a successful UPDATE is the incident).
- Customer report that a completion certificate does not match current bytes.

## Immediate actions

1. Do **not** “fix” rows by updating hashes, deleting events, or rewriting `prevHash`.
2. Do **not** restore a backup over the live chain without an incident commander; that can destroy evidence.
3. Do **not** log event payloads that may contain Confidential data into chat.
4. Snapshot evidence: verifier output, `documentId`, first failing `sequence`, UTC time, correlation ids.
5. Restrict write access to the audit table if an insider or compromised app role is possible.

## Diagnosis

1. Re-run verification from sequence 0 for that document (read-only).
2. Compare live rows to the most recent backup **copy** (not an in-place restore).
3. Check application logs around `occurredAt` of the failing event for deploys, migrations, or manual SQL.
4. Classify:

| Observation | Likely cause |
| --- | --- |
| Canonicalization bug after deploy | Code change; old rows vs new algorithm without `chainVersion` |
| Single document gap | Failed insert + client retry that skipped sequence (application bug) |
| Many documents, same time | Admin script, ORM misuse, compromised credentials |
| Hash mismatch, row contents look edited | Direct table UPDATE or backup tampering |
| Verification fails only in one replica | Replica lag or corrupt replica |

## Remediation

- **Verifier bug or `chainVersion` mismatch:** stop the bad verifier; do not rewrite history. Add a versioned verifier that can read old canonicalization. Ship a fix.
- **Missing insert (application bug):** if the domain action actually happened, this is a reliability incident; do **not** backfill fake hashes. Repair path needs security + engineering design (new compensating event is still not a silent rewrite).
- **Confirmed alteration:** incident response: rotate credentials, preserve forensic copies, assess tenant impact. **Legal review required** for customer notification.

There is no v1 procedure that silently rebuilds a chain and calls it the original.

## Verification

- Verifier clean on unaffected documents.
- Compromised document flagged and access policy applied.
- Root cause written in the incident record (internal).

## Escalation

Security lead immediately. Engineering lead for verifier bugs. Executive + legal if customer documents may have been altered.

## Prevention

DB role without UPDATE/DELETE on audit; CI test that repositories cannot mutate events; periodic verification job; least-privilege operators; backup immutability where the provider offers it (still not a compliance claim).
