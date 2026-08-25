# API and OpenAPI evolution

## Backward-compatible API guidelines

**Prefer (non-breaking):**

- Add optional request fields
- Add response fields
- Add new endpoints or operations
- Add enum values only when clients ignore unknowns (document this)
- Widen timeouts/limits carefully with flags

**Avoid or treat as breaking:**

- Remove endpoints, fields, or enum values
- Rename fields
- Change types or make optional fields required
- Change auth requirements or error codes clients branch on without a flag period

Use additive DTOs and new path versions (`/v2/...`) when a clean break is required. Keep `/v1` until the deprecation window ends ([dependencies-and-deprecation.md](dependencies-and-deprecation.md)).

## OpenAPI versioning policy

- Source of truth for the public HTTP surface: [`docs/api/openapi.yaml`](../../api/openapi.yaml).
- `info.version` tracks the **document** revision for humans; product SemVer is the git tag.
- Every PR that changes request/response shapes in `packages/contracts` or Express routes **must** update OpenAPI in the same PR.
- CI flags **removed paths/operations** as likely breaking and warns when contracts change without OpenAPI changes (heuristic).
- Do not claim the OpenAPI file alone proves legal compliance.

## Review checklist

- [ ] OpenAPI updated
- [ ] Contracts Zod schemas updated
- [ ] Integration/e2e coverage for new or changed paths
- [ ] Breaking changes called out in the PR and future release notes
