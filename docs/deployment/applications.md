# Applications (web, API, worker)

## Web (`apps/web`)

- **Role:** Next.js App Router UI and signing experience; proxies signer traffic where configured.
- **Port:** `3000` (`PORT`, `HOSTNAME=0.0.0.0`).
- **Health:** `GET /api/health` (validates web config via `loadWebConfig()`).
- **Build-time public config:** `NEXT_PUBLIC_API_BASE_URL` must point at the externally reachable API origin (HTTPS in production). It is compiled into the client bundle **and** set on the runtime image so `loadWebConfig()` can validate env on the server. Rebuild when the public API origin changes.
- **Runtime:** Prefer the production image (`node apps/web/server.js` from standalone output). Do not run `next dev` in production.
- **Termination:** SIGTERM; container `STOPSIGNAL` matches.

## API (`apps/api`)

- **Role:** Express HTTP adapter; composition root for auth, documents, signing, audit verification endpoints.
- **Port:** `4000` (`API_HOST=0.0.0.0`, `API_PORT=4000` in the image).
- **Health:** `GET /health/live` (liveness), `GET /health/ready` (dependencies including database).
- **Config:** All settings through `@esign/config` / `loadApiConfig()` — process exits non-zero on invalid env.
- **Graceful shutdown:** Stops accepting connections, waits up to `SHUTDOWN_TIMEOUT_MS`, disconnects Prisma.
- **Body limits:** Align reverse-proxy body size with `DOCUMENT_MAX_UPLOAD_BYTES` and signing/auth JSON limits.

## Worker (`apps/worker`)

- **Role:** Outbox claimer and job handlers (inspection, notifications, PDF flatten/finalization, audit verification schedule, cleanup).
- **Health port:** `4100` (`WORKER_HEALTH_HOST`, `WORKER_HEALTH_PORT`).
- **Health:** `GET /health/live`, `GET /health/ready` (includes queue freshness signals).
- **Temp directory:** `TMPDIR=/tmp/esign` — mount writable storage for any OS temp use; keep PDF work bounded and prefer in-memory adapters where the code already does.
- **Scaling:** Run N replicas; leasing + idempotency make duplicate delivery safe. See [platform.md](platform.md).

## Shared runtime expectations

1. Inject secrets and URLs at process start; never rely on image defaults for credentials.
2. Set `NODE_ENV=production`.
3. Use UTC clocks; persist timestamps in UTC.
4. Point logs to stdout/stderr JSON (Pino); scrape metrics from documented endpoints where exposed.
5. Trust only the documented proxy hop count (`TRUST_PROXY`) when normalizing client IP.
