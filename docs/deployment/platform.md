# Platform (secrets, proxy, TLS, scaling, outbox)

## Secrets manager

- Store: database URLs, auth secrets, object-storage keys, any future IdP client secrets.
- Inject as environment variables or files at runtime; rotate without rebuilding images.
- CI pull requests must not receive production secrets (already enforced by workflow design).
- Local `.env` files are gitignored placeholders only.

## Trusted reverse proxy and TLS termination

- Terminate TLS at the edge (load balancer, ingress, or reverse proxy).
- Forward `X-Forwarded-Proto`, `X-Forwarded-For` / `Forwarded` only from trusted hops.
- Set `TRUST_PROXY` to the exact hop count (never `true` without a topology).
- HSTS and cookie `Secure` in production (`AUTH_COOKIE_SECURE=true`).
- Align proxy `client_max_body_size` (or equivalent) with `DOCUMENT_MAX_UPLOAD_BYTES`.
- Web and API listen on HTTP inside the mesh/cluster; do not expose plain HTTP publicly.

## Horizontal scaling

| Component | Scale unit                                  | Guidance                                                                                        |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Web       | Stateless replicas behind LB                | Session cookies are opaque; sticky sessions not required for signing cookie if API owns session |
| API       | Stateless replicas                          | Share DB + storage; rate limits are per process unless centralized                              |
| Worker    | Replicas claiming outbox with `SKIP LOCKED` | At-least-once delivery; handlers must stay idempotent                                           |
| Migrate   | Single job                                  | Serialize migrations                                                                            |

Autoscaling: scale API/web on CPU/RPS/latency; scale workers on queue depth / oldest unclaimed outbox age.

## Queue / outbox operation

- Outbox rows are written in the same DB transaction as business state.
- Workers claim with leases; expired leases are reclaimed.
- Monitor: queue depth, lease age, attempt counts, dead-letter / terminal failures.
- Do not put raw tokens, PDFs, or signature PNGs in payload JSON — opaque IDs only.
- Poison messages: after max attempts, alert and inspect; fix data or code before forced retry.

## CORS and origins

- `CORS_ORIGINS` allowlist must list the public web origin(s) only.
- Signing pages send `Origin` matching the web deployment.
