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
- [ ] `TRUST_PROXY` matches real topology
- [ ] `NEXT_PUBLIC_API_BASE_URL` points at the public API HTTPS origin

## Data plane

- [ ] PostgreSQL private network + TLS as required
- [ ] Connection pooling sized and tested
- [ ] Migrations applied by one-shot job before app rollout
- [ ] Backup + restore drill completed within target RPO/RTO
- [ ] Application DB role cannot update/delete audit rows

## Object storage

- [ ] Private bucket; public access blocked
- [ ] Lifecycle for incomplete uploads
- [ ] Versioning / retention policy agreed (**legal review** if customer documents are regulated)
- [ ] Orphan cleanup job enabled

## Edge and abuse controls

- [ ] TLS 1.2+ at edge; HSTS enabled
- [ ] Body size limits aligned end-to-end
- [ ] Rate limits reviewed for auth and signing endpoints
- [ ] WAF/bot controls as appropriate for your threat model

## Workloads

- [ ] Web, API, worker resource requests/limits set
- [ ] Worker horizontal scaling tested (two replicas, duplicate delivery)
- [ ] Outbox lag alerts configured
- [ ] PDF memory ceiling understood for worker limits

## Observability

- [ ] Logs redaction verified in staging
- [ ] Metrics and alerts wired (readiness, 5xx, finalization, audit verify, queue)
- [ ] Tracing sampled without sensitive payloads
- [ ] Runbooks linked from alerts

## Release and rollback

- [ ] Image digests pinned in the deploy system
- [ ] Rollback procedure rehearsed
- [ ] Staging smoke: upload → send → sign → finalize → download → audit verify

## Explicit non-goals (do not check as “done”)

- [ ] Claiming ESIGN / UETA / eIDAS / HIPAA / SOC 2 / ISO 27001 from these controls alone
- [ ] Binding the repo to a single cloud vendor’s proprietary APIs without an ADR
