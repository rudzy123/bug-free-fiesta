# Changelog and release notes

## Conventional Commits validation

- Authors follow [conventional-commits.md](../conventional-commits.md).
- CI runs **commitlint** on the PR commit range (`pnpm commitlint:ci --from origin/main --to HEAD`) via `scripts/release-checks/commitlint.mjs`.
- Prefer small commits with accurate `type` so changelog generation stays useful.

## Automated changelog (dry-run)

```bash
pnpm changelog:dry-run
```

This prints a Conventional Changelog-style summary to stdout / `CHANGELOG.dry-run.md` for commits since the previous tag (or `RELEASE_CHANGELOG_FROM`). It does **not** commit, tag, or publish.

## Release notes template

Use [.github/RELEASE_NOTES_TEMPLATE.md](../../../.github/RELEASE_NOTES_TEMPLATE.md) when creating a GitHub Release:

1. Paste the dry-run changelog section for user-facing items.
2. List migrations to apply (or “none”).
3. List flag defaults that changed.
4. List API/OpenAPI compatibility notes.
5. Security notes without secrets.
6. Explicitly avoid compliance claims.

## Cutting a release (manual)

1. `main` green on CI.
2. `pnpm changelog:dry-run` and edit notes from the template.
3. Tag `vX.Y.Z` and push the tag.
4. Create the GitHub Release from the template (human action).
5. Apply migrations and roll out images per [deployment docs](../../deployment/README.md).
