# Definition of done

A change is done when all of the following are true. The [pull request template](../../.github/PULL_REQUEST_TEMPLATE.md) repeats the merge-facing subset.

## Required

- Behavior matches the request; no unrelated rewrites
- Automated checks that apply to the change pass: format, lint, typecheck, unit tests, and build
- Integration or e2e tests updated or added when HTTP, database, worker, or UI journeys change
- Error handling and structured logging are present; logs omit secrets, tokens, cookies, and document bytes
- External input is validated at the boundary with Zod contracts
- Authorization remains deny-by-default for any new sensitive operation
- The browser is not the source of truth for document, signer, or field state
- Schema changes include a new Prisma migration (never an edit to an applied migration)
- Documentation updated in the same change (ADR, OpenAPI, runbook, or this governance set)
- No secrets committed; `.env` files stay local
- No legal or compliance claims (including ESIGN, HIPAA, SOC 2, ISO 27001)

## UI (when `apps/web` changes)

- Keyboard operable, labeled controls, visible focus, responsive layout

## Security-sensitive (when auth, documents, storage, or audit change)

- Security notes in the PR
- Tests for IDOR / tenant isolation or token handling as applicable
- Audit records remain append-only

## Explicitly not done

- “Works on my machine” without the quality gates
- Production deployment (not configured yet)
- Calling a control “compliant” because it exists
