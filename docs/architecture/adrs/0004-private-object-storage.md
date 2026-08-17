# ADR-0004: Private object storage instead of PDFs in PostgreSQL

## Status

Accepted.

## Context

PDFs are large, untrusted, and rewritten during finalization. Storing blobs in PostgreSQL bloats WAL, backups, and transactions.

## Decision

- Store document revisions and finalized artifacts in private object storage (S3-compatible and Azure Blob behind one infrastructure port).
- Use MinIO for local development only.
- PostgreSQL stores keys, digests, sizes, and content types — not bytes.
- Buckets/containers are private. Access is via short-lived authorized URLs or streamed through the API after authz.
- Database transactions must not include storage I/O.

## Consequences

- Need reconciliation when upload succeeds and DB commit fails (content-addressed keys help).
- Backup and IAM for storage are a separate operational surface ([threat model](../../security/threat-model.md)).
- Provider features (SSE) are not customer-managed encryption and are not a compliance claim.

## Alternatives

- `bytea` in Postgres: simpler transactions, poor scale.
- Filesystem on the API host: not multi-instance safe.
