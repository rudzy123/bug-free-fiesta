# Data plane (PostgreSQL)

## PostgreSQL

- Managed or self-hosted PostgreSQL 16+ compatible with the Prisma schema.
- Network: private only; API and worker connect; web does not hold a DB URL.
- Credentials: rotate via secrets manager; prefer TLS to the database (`sslmode` in `DATABASE_URL` as required by your provider).
- Roles: application role must not be a superuser; audit triggers require the privileges defined in migrations (`INSERT`/`SELECT` on audit tables for the app role — not `UPDATE`/`DELETE`).

## Connection pooling

- Use a pooler (PgBouncer transaction mode or provider pooler) in front of PostgreSQL for API and worker.
- Size pools from `(API replicas × pool_per_process) + (worker replicas × pool_per_process)` under the server `max_connections` budget.
- Prisma uses a connection per process; set `DATABASE_URL` (and optional pool params supported by your URL) consistently.
- Avoid holding transactions open across object-storage or PDF I/O (already required by architecture rules).

## Migrations

- Apply with the migrate image or equivalent one-shot job **before** rolling out app versions that need the new schema:

  ```bash
  docker run --rm -e DATABASE_URL="$DATABASE_URL" esign/migrate:<tag>
  ```

- Never run `prisma migrate deploy` from every API replica on boot (race risk).
- Never edit already-applied migration files; add a new migration.
- Expand/contract for incompatible changes; keep rollback of app code compatible with the current schema when possible.

## Backups and restoration

- Automated logical or continuous backups with tested restore.
- Encrypt backups at rest; restrict who can restore.
- Restore drills: document RPO/RTO targets operationally (not claimed as compliance).
- After restore: verify audit chain tooling (`pnpm audit:verify` / worker verification job) on a sample of organizations before reopening write traffic.
- Do not restore production PDFs into non-production environments.

## Related

Schema and tenant model: [data model](../architecture/data-model.md) (if present), ADR-0003 PostgreSQL and Prisma.
