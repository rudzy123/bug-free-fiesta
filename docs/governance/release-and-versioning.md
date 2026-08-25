# Release and versioning

There is **no automatic production deployment or publish**. Releases are a versioning and communication process only. Detailed policies live under [release/](release/README.md).

## Quick rules

- Follow [Semantic Versioning](release/semantic-versioning.md) for tagged application versions (`vMAJOR.MINOR.PATCH`).
- Commits follow [Conventional commits](conventional-commits.md); CI validates with commitlint on pull requests.
- Generate a dry-run changelog with `pnpm changelog:dry-run` or the manual [Release dry-run](../../.github/workflows/release-dry-run.yml) workflow. Use [.github/RELEASE_NOTES_TEMPLATE.md](../../.github/RELEASE_NOTES_TEMPLATE.md).
- Run `pnpm release:check` locally (also in CI) for migrations, contracts, OpenAPI, and audit schema locks.
- Database: forward-only / expand-and-contract — see [database-migrations.md](release/database-migrations.md).

## How a release is cut (manual)

1. `main` is green on CI (quality including release checks, tests, CodeQL, audit, images).
2. Choose the version from conventional commits since the last tag.
3. Tag `vX.Y.Z` on the intended commit and push the tag (human action).
4. Create a GitHub Release from the notes template. Do not claim legal compliance.
5. Apply Prisma migrations, then roll out images per [deployment docs](../deployment/README.md).

## What we will not do from CI

- Deploy to production
- Auto-tag on every merge
- Publish npm packages or container registries automatically
