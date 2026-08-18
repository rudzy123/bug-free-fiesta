# Release and versioning

There is **no automatic production deployment**. Releases are a versioning and communication process only.

## Versioning

- Follow [Semantic Versioning](https://semver.org/) for tagged application versions.
- Until a public 1.0.0, the default branch may stay on `0.y.z`. Breaking changes in `0.y.z` are allowed but must be called out in the GitHub release notes.
- Workspace packages (`@esign/*`) remain private and may stay at `0.0.0` until we publish them. The product version is the git tag, not each package.json.
- The pnpm lockfile is the dependency pin. Do not use floating ranges for new dependencies.

## How a release is cut (manual)

1. `main` is green on CI (quality, tests, CodeQL, audit, images).
2. Choose the version from conventional commits since the last tag (`feat` → minor in 1.x, `fix` → patch, breaking → major or a clear 0.x note).
3. Tag `vX.Y.Z` on the intended commit and push the tag.
4. Create a GitHub Release summarizing user-facing changes, migrations, and security notes. Do not claim legal compliance.
5. Apply Prisma migrations in each environment with `pnpm db:migrate:deploy` (or the equivalent) as a controlled step, not from racing app instances.

## What we will not do yet

- Deploy to production from GitHub Actions
- Auto-tag on every merge
- Publish npm packages

## Database

Forward-only migrations. Rollback of application code must remain compatible with the current schema, or follow an expand/contract ADR.
