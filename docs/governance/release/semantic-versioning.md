# Semantic versioning policy

## Product version (git tag)

- The **product** version is the annotated git tag `vMAJOR.MINOR.PATCH` on `main`.
- Follow [Semantic Versioning 2.0.0](https://semver.org/).
- Until public **1.0.0**, tags may remain `0.y.z`. Breaking changes in `0.y.z` are allowed but **must** be called out in release notes.
- Mapping from Conventional Commits (1.x and later):
  - `fix` → patch
  - `feat` → minor
  - `BREAKING CHANGE` / `type!:` → major
- Do not retag or move an existing `vX.Y.Z` after it has been communicated.

## Workspace packages

- `@esign/*` packages stay private and may remain `0.0.0` in `package.json` until we publish.
- The lockfile pins third-party versions; new dependencies must use exact versions (no floating ranges).

## What a version does **not** mean

- A tag is not a legal, compliance, or cryptographic claim.
- A tag does not imply production deploy succeeded — deploy is a separate controlled process.
