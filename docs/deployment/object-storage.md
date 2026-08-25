# Private object storage

Use an S3-compatible endpoint through `@esign/object-storage` (`OBJECT_STORAGE_DRIVER=s3`). MinIO is for local development against the same S3 API. The `memory` and `filesystem` drivers are for unit/e2e only and are **rejected when `NODE_ENV=production`**.

## Configuration

- `OBJECT_STORAGE_DRIVER=s3` in production (enforced by `@esign/config`).
- Private bucket/container; block public ACLs and public policies.
- TLS to the endpoint; path-style vs virtual-hosted as required by the provider (`OBJECT_STORAGE_FORCE_PATH_STYLE`).
- Credentials from secrets manager — never image env defaults.
- Optional `filesystem` / `memory` drivers are local/e2e only.

## Keys and integrity

- Prefer content-addressed / immutable object keys for finalized artifacts.
- Store digests in PostgreSQL; S3 object metadata also carries `sha256-digest` for read-back checks.
- Verify on download and during audit verification.
- Incomplete multipart uploads: lifecycle expiry rules.

## Retention and versioning

- Enable object versioning where the provider supports it for delete protection.
- Retention: soft-delete vs legal hold is a **legal/product** decision — implement technical retention flags only after policy review.
- Orphan cleanup jobs remove unreferenced uploads after TTL; do not disable without a compensating control.
- Separate backup copies of critical finalized artifacts if the threat model requires protection against privileged storage admin deletion (see audit residual risk docs).

## Network

- API and worker egress only; no public read of raw objects.
- Short-lived signed URLs for authorized previews/downloads; never expose long-lived public object URLs for customer PDFs.
