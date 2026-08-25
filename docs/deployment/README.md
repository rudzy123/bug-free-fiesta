# Deployment

Provider-agnostic production deployment guidance for the Electronic Signature SaaS. No cloud account, cluster, or managed service is provisioned by this repository.

## Documents

| Topic                                                           | Document                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Container images (Dockerfiles, SBOM, scanning, resource limits) | [containers.md](containers.md)                                         |
| Web, API, worker runtime                                        | [applications.md](applications.md)                                     |
| PostgreSQL, pooling, migrations, backups                        | [data-plane.md](data-plane.md)                                         |
| Private object storage and retention                            | [object-storage.md](object-storage.md)                                 |
| Secrets, reverse proxy, TLS, scaling, outbox                    | [platform.md](platform.md)                                             |
| Logging, metrics, tracing, rollback                             | [operations.md](operations.md)                                         |
| Production-readiness checklist                                  | [production-readiness-checklist.md](production-readiness-checklist.md) |

## Principles

1. Images and docs stay portable across Kubernetes, Nomad, ECS, Cloud Run, VMs, and similar.
2. Secrets come only from a platform secret store or orchestrator injection — never from image layers or git.
3. Typed config (`packages/config`) fails fast at process start when required env is missing or invalid.
4. TLS terminates at a trusted reverse proxy (or mesh) in front of web and API.
5. The worker scales horizontally; correctness relies on outbox leases and idempotency, not a single replica.

## Related architecture

[Deployment model](../architecture/deployment-model.md), [Container architecture](../architecture/container-architecture.md), [Reliability model](../architecture/reliability-model.md), [Observability](../architecture/observability.md).
