# Rollout and rollback

## Blue/green or canary (guidance)

| Pattern        | When                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------ |
| **Canary**     | Default for API/worker image changes: small % traffic or single tenant cohort, then expand |
| **Blue/green** | When you need instant cutover with a warm standby (same schema, compatible images)         |

Constraints for this product:

- Run **migrate once** before shifting traffic to a build that requires new schema.
- Web, API, and worker images for a release should share the same git SHA when practical.
- Object storage and Postgres are shared; do not run two eras of **incompatible** writers without expand-and-contract.

## Worker / API compatibility matrix

| API build | Worker build | Allowed?                                                                    |
| --------- | ------------ | --------------------------------------------------------------------------- |
| N         | N            | Yes (preferred)                                                             |
| N         | N−1          | Only if N is backward-compatible with jobs produced by N−1 (document in PR) |
| N−1       | N            | Only if N workers tolerate payloads from N−1 API (document in PR)           |
| N         | N−2 or older | No, outside emergency hotfix with explicit matrix note                      |

Job payloads must include a **format version** field when shapes change ([artifact-versioning.md](artifact-versioning.md)).

## Rollback runbook

1. **Stop the blast radius** — pause canary / shift traffic to last-known-good images (same or older **compatible** SHA).
2. **Do not** “roll back” Postgres with a destructive down-migration as a first step.
3. Confirm schema: current DB must still satisfy the rolled-back app (if not, forward-fix the app or schema).
4. Drain or quarantine incompatible worker jobs; re-enqueue with compatible payload versions if needed.
5. Disable risky flags (kill-switch) before or while rolling images.
6. Verify health: `/health`, queue lag, error rate, audit append success.
7. Write an incident note; open a forward-fix PR.

## Database rollback limitations

See [database-migrations.md](database-migrations.md). Application rollback ≠ schema rollback.

## Forward-fix strategy

Prefer:

1. Hotfix on `main` (or release branch) that corrects behavior.
2. New migration if data/schema is wrong.
3. Flag off for the bad path.

Use DB restore only for corruption/loss, with audit/object re-verification.
