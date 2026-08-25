# Production-readiness checklist

Use before the first production traffic. Items are technical gates; legal/compliance sign-off is separate and required where noted.

## Containers and supply chain

- [ ] API, web, and worker images build from the multi-stage Dockerfiles with frozen lockfile
- [ ] Runtime runs as non-root; read-only root filesystem tested with `/tmp/esign` mounted
- [ ] No secrets in image history (`docker history` / registry scan)
- [ ] Source maps not exposed on public web assets
- [ ] HEALTHCHECK passes for all three images
- [ ] SIGTERM drain verified under load
- [ ] CycloneDX SBOM retained for the release digests
- [ ] Vulnerability scan (CRITICAL/HIGH) clean or explicitly waived with owner + expiry

## Configuration and secrets

- [ ] All production env validated by `@esign/config` (failed start on missing vars)
- [ ] Secrets only from secrets manager / orchestrator injection
- [ ] `NODE_ENV=production`, secure cookies, production CORS allowlist
- [ ] `TRUST_PROXY` matches real topology (hop count, never `true`)
- [ ] `NEXT_PUBLIC_API_BASE_URL` points at the public API HTTPS origin
- [ ] `OBJECT_STORAGE_DRIVER=s3` with private endpoint/bucket/credentials (memory/filesystem rejected)
- [ ] `DOCUMENT_INSPECTOR=structural` (never `local`; `fail_closed` only as kill-switch)
- [ ] `METRICS_BEARER_TOKEN` set; scrapers send `Authorization: Bearer`
- [ ] `TOKEN_HASH_PEPPER` is a unique production secret (not the local-dev default)
- [ ] `AUTH_PROVIDER=oidc` with issuer, client id/secret, and redirect URI registered

## Data plane

- [ ] PostgreSQL private network + TLS as required
- [ ] Connection pooling sized and tested
- [ ] Migrations applied by one-shot job before app rollout
- [ ] Backup + restore drill completed within target RPO/RTO (**ops decision — SEC-012**)
- [ ] Application DB role cannot update/delete audit rows

## Object storage

- [ ] Private bucket; public access blocked
- [ ] Lifecycle for incomplete uploads
- [ ] Versioning / retention policy agreed (**legal review** if customer documents are regulated — SEC-011)
- [ ] Orphan cleanup job enabled
- [ ] Configuration documented in [object-storage.md](object-storage.md)

## Edge and abuse controls

- [ ] TLS 1.2+ at edge; HSTS enabled
- [ ] Body size limits aligned end-to-end
- [ ] Rate limits reviewed for auth and signing endpoints
- [ ] Shared rate-limit store planned if multi-replica (**infra decision — SEC-008**)
- [ ] WAF/bot controls as appropriate for your threat model
- [ ] Signing CSP in production uses `script-src 'self'` (no `unsafe-inline` scripts)

## Workloads

- [ ] Web, API, worker resource requests/limits set
- [ ] Worker horizontal scaling tested (two replicas, duplicate delivery)
- [ ] Outbox lag alerts configured
- [ ] PDF memory ceiling understood for worker limits

## Observability

- [ ] Logs redaction verified in staging
- [ ] Metrics and alerts wired (readiness, 5xx, finalization, audit verify, queue)
- [ ] Metrics endpoints authenticated with `METRICS_BEARER_TOKEN`
- [ ] Tracing sampled without sensitive payloads
- [ ] Runbooks linked from alerts

## Release and rollback

- [ ] Image digests pinned in the deploy system
- [ ] Rollback procedure rehearsed
- [ ] Staging smoke: upload → inspect → send → sign → finalize → download → audit verify

## Explicit non-goals (do not check as “done”)

- [ ] Claiming ESIGN / UETA / eIDAS / HIPAA / SOC 2 / ISO 27001 from these controls alone
- [ ] Binding the repo to a single cloud vendor’s proprietary APIs without an ADR
- [ ] Treating structural PDF inspection as commercial antivirus
- [ ] Treating the audit hash chain as DBA-proof without external WORM/checkpoints
