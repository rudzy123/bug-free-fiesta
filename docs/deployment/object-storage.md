# Private object storage

Use an S3-compatible or Azure Blob endpoint through the repository’s storage port. MinIO is for local development only.

## Configuration

- Private bucket/container; block public ACLs and public policies.
- TLS to the endpoint; path-style vs virtual-hosted as required by the provider (`OBJECT_STORAGE_*` in config).
- Credentials from secrets manager — never image env defaults.
- Optional filesystem driver (`OBJECT_STORAGE_DRIVER=filesystem`) is for local/e2e only, not production.

## Keys and integrity

- Prefer content-addressed / immutable object keys for finalized artifacts.
- Store digests in PostgreSQL; verify on download and during audit verification.
- Incomplete multipart uploads: lifecycle expiry rules.

## Retention and versioning

- Enable object versioning where the provider supports it for delete protection.
- Retention: soft-delete vs legal hold is a **legal/product** decision — implement technical retention flags only after policy review.
- Orphan cleanup jobs remove unreferenced uploads after TTL; do not disable without a compensating control.
- Separate backup copies of critical finalized artifacts if the threat model requires protection against privileged storage admin deletion (see audit residual risk docs).

## Network

- API and worker egress only; no public read of raw objects.
- Short-lived signed URLs for authorized previews/downloads; never expose long-lived public object URLs for customer PDFs.
