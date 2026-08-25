# Deployment model

How the system is intended to run. No production cluster exists yet.

## Environments

| Environment         | Purpose                                              | Data                           |
| ------------------- | ---------------------------------------------------- | ------------------------------ |
| Local               | Docker Compose: API, web, worker, PostgreSQL, MinIO  | Fake tenants only              |
| CI                  | GitHub Actions: format, lint, typecheck, test, build | Ephemeral DB; no customer data |
| Staging (future)    | Integration with managed Postgres and object storage | Synthetic documents            |
| Production (future) | Customer traffic                                     | Restricted; access audited     |

Do not copy production PDFs into local or CI.

## Local topology

```text
browser → apps/web → apps/api → PostgreSQL
                              → MinIO
                 apps/worker → PostgreSQL
                             → MinIO
```

Compose files will pin images. Application config comes only from `packages/config` (env files are gitignored).

## CI

GitHub Actions on pull requests and `main`. Jobs and local equivalents: [CI local equivalents](../governance/ci-local-equivalents.md). Workflows live in `.github/workflows/`. Placeholder values from `.env.example` are used in CI; repository secrets are not passed to pull requests. There is no production deploy workflow.

## Runtime configuration

| Concern         | Approach                                                                          |
| --------------- | --------------------------------------------------------------------------------- |
| Secrets         | Platform secret store; never committed                                            |
| Node            | 22 LTS unless `engines` says otherwise                                            |
| Migrations      | Prisma migrate in a controlled release step, not from random app instances racing |
| Worker replicas | Horizontal; correctness via leases and idempotency, not “only one replica”        |
| Web and API     | Separate processes ([ADR-0002](adrs/0002-express-api-separate-from-nextjs.md))    |

## Object storage

Private buckets/containers. No public list or public read. TLS. Lifecycle rules for incomplete multipart uploads. Production providers: S3-compatible and/or Azure Blob via one port. MinIO is local only.

PDF uploads are capped by `DOCUMENT_MAX_UPLOAD_BYTES` at the reverse proxy, the API raw body parser, and the object-storage adapter. Set the proxy body limit to the same value (for example nginx `client_max_body_size`).

## Network

- API and worker do not expose PostgreSQL or MinIO ports publicly.
- Signer and account-user HTTPS only in non-local environments.
- Disable URL fetching inside PDF processing (SSRF).

## Releases

Prefer forward-only schema migrations. Rollback of application code must remain compatible with the current schema or follow an explicit expand/contract ADR later.

Production container images, SBOM/scanning, resource guidance, and the readiness checklist live under [docs/deployment/](../deployment/README.md). This document stays the short architectural overview; that tree is the operator playbook.

**Legal review required:** data residency (which region stores PDFs and backups) before production onboarding of regulated customers.

## Related documents

[Container architecture](container-architecture.md), [Reliability model](reliability-model.md), [ADR-0003](adrs/0003-postgresql-and-prisma.md), [Deployment playbook](../deployment/README.md).
