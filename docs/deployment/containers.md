# Container images

Secure multi-stage images for `apps/api`, `apps/web`, and `apps/worker`. Context is always the monorepo root. `.dockerignore` excludes secrets, tests, docs, and local data.

## Build

```bash
docker build -f apps/api/Dockerfile --target runner \
  --build-arg BUILD_REVISION="$(git rev-parse HEAD)" \
  --build-arg BUILD_CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t esign/api:local .

docker build -f apps/worker/Dockerfile --target runner \
  --build-arg BUILD_REVISION="$(git rev-parse HEAD)" \
  --build-arg BUILD_CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t esign/worker:local .

docker build -f apps/web/Dockerfile --target runner \
  --build-arg NEXT_PUBLIC_API_BASE_URL="https://api.example.com" \
  --build-arg BUILD_REVISION="$(git rev-parse HEAD)" \
  --build-arg BUILD_CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t esign/web:local .
```

Frozen lockfile install (`pnpm install --frozen-lockfile`) runs inside the build stage. Runtime stages copy production artifacts only (`pnpm deploy --prod` for API/worker; Next.js `output: 'standalone'` for web). DevDependencies and `*.map` files are not shipped in runtime layers.

Database migrations one-shot (API Dockerfile):

```bash
docker build -f apps/api/Dockerfile --target migrate -t esign/migrate:local .
docker run --rm -e DATABASE_URL="postgresql://..." esign/migrate:local
```

## Image properties

| Property    | Implementation                                                             |
| ----------- | -------------------------------------------------------------------------- |
| Base        | `node:22.14.0-alpine` with `ca-certificates`, `openssl`, `libc6-compat`    |
| User        | Non-root `esign`                                                           |
| Ports       | API `4000`, worker health `4100`, web `3000`                               |
| Health      | `HEALTHCHECK` against `/health/live` (API/worker) or `/api/health` (web)   |
| Signals     | `STOPSIGNAL SIGTERM`; apps already drain on SIGTERM/SIGINT                 |
| Temp        | `TMPDIR=/tmp/esign` (mount tmpfs or emptyDir for read-only root)           |
| Secrets     | Not baked; only public build-args such as `NEXT_PUBLIC_API_BASE_URL`       |
| OCI labels  | `org.opencontainers.image.*` title, description, source, revision, created |
| Source maps | Browser maps disabled; server `*.map` deleted from deploy output           |

## Read-only root filesystem

Compatible when `/tmp/esign` is writable (tmpfs). Do not mount the application directory writable. Next may use cache under the app tree during rare operations; prefer tmpfs for `/tmp/esign` and keep the image root read-only in the orchestrator.

Example Kubernetes sketch (illustrative only):

```yaml
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
volumeMounts:
  - name: tmp
    mountPath: /tmp/esign
volumes:
  - name: tmp
    emptyDir: {}
```

## Resource-limit guidance

Start with these requests/limits and tune from metrics. They are guidance, not SLOs.

| Workload    | CPU request | CPU limit | Memory request | Memory limit | Notes                            |
| ----------- | ----------- | --------- | -------------- | ------------ | -------------------------------- |
| Web         | 100m        | 500m      | 256Mi          | 512Mi        | Mostly I/O to API                |
| API         | 250m        | 1000m     | 512Mi          | 1Gi          | JSON + upload buffering          |
| Worker      | 500m        | 2000m     | 1Gi            | 2Gi          | PDF finalization is memory-heavy |
| Migrate job | 100m        | 500m      | 256Mi          | 512Mi        | Short-lived                      |

Cap concurrent PDF jobs per worker replica via poll interval and lease settings; scale out replicas before raising a single container’s memory without measurement.

## SBOM and vulnerability scanning

CI (`container` job) loads each image, writes a CycloneDX SBOM artifact (`sbom-<app>.cdx.json`), and fails on CRITICAL/HIGH findings with a fixed Trivy version. Locally:

```bash
# After building esign/api:local
trivy image --severity CRITICAL,HIGH --ignore-unfixed esign/api:local
trivy image --format cyclonedx --output sbom-api.cdx.json esign/api:local
```

Do not publish images that fail the HIGH/CRITICAL gate without an explicit risk acceptance recorded outside this repo’s default CI.

## What not to put in images

- `.env` files, signing secrets, database passwords, object-storage keys
- Development tooling (`turbo`, `typescript`, Playwright, Vitest)
- Customer PDFs or seed data
- Uncontrolled source maps for public browsers
