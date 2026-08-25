# Release engineering

Long-term maintenance practices for this monorepo. **No automatic production publish** — tags and GitHub Releases are intentional operator actions. CI may dry-run changelog and notes only.

## Index

| Document                                                        | Topics                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| [Semantic versioning](semantic-versioning.md)                   | SemVer policy for product tags and packages                  |
| [Changelog and release notes](changelog-and-release-notes.md)   | Conventional Commits → changelog; notes template             |
| [Database migrations](database-migrations.md)                   | Commit policy, expand/contract, forward-fix, rollback limits |
| [API and OpenAPI evolution](api-and-openapi.md)                 | Backward-compatible HTTP changes; OpenAPI versioning         |
| [Feature flags](feature-flags.md)                               | Flag abstraction and safe rollout                            |
| [Rollout and rollback](rollout-and-rollback.md)                 | Canary/blue-green, rollback runbook, worker/API matrix       |
| [Artifact versioning](artifact-versioning.md)                   | Object formats, audit events, evidence packages              |
| [Dependencies and deprecation](dependencies-and-deprecation.md) | Upgrade and deprecation policy                               |
| [Hotfix process](hotfix.md)                                     | Incident hotfix path                                         |

Related: [Conventional commits](../conventional-commits.md), [Release overview](../release-and-versioning.md), [Deployment](../../deployment/README.md).

## CI release checks

Run locally: `pnpm release:check`

| Check                    | What it enforces                                                   |
| ------------------------ | ------------------------------------------------------------------ |
| Migration immutability   | Existing `prisma/migrations/**/migration.sql` files are not edited |
| Schema/migration pairing | `schema.prisma` changes ship with migration changes                |
| Prisma generate          | Client generates and `@esign/database` typechecks                  |
| Contracts build          | `@esign/contracts` builds cleanly                                  |
| OpenAPI drift / breaking | Path/operation removals flagged; contracts↔OpenAPI heuristics     |
| Audit schema lock        | `AUDIT_CHAIN_SCHEMA_VERSION` fingerprint cannot change in place    |
| Commitlint               | Commits on the PR range match Conventional Commits                 |

Dry-run release workflow: `.github/workflows/release-dry-run.yml` (manual `workflow_dispatch` only; never publishes).
