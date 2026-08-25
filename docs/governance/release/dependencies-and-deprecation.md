# Dependencies and deprecation

## Dependency upgrade policy

- Pin versions in `package.json` / lockfile; prefer exact versions for new deps.
- Security patches: upgrade promptly; run `pnpm lint`, `typecheck`, `test`, and release checks.
- Major upgrades: dedicated PR, changelog notes, and canary rollout for runtime images.
- Do not add dependencies that pull secrets into client bundles or bypass `packages/config`.
- Container base images: rebuild regularly; address HIGH/CRITICAL scanner findings before release when practical.

## Deprecation policy

1. Announce in OpenAPI (`deprecated: true`), changelog, and release notes.
2. Keep the old surface for at least **one minor** product version (or 90 days, whichever is longer once ≥1.0.0), unless a critical security issue requires faster removal.
3. Provide a migration path (new field/endpoint/flag).
4. Remove only after the window and with a major bump when on ≥1.0.0.
5. Internal flags and dead code: remove after metrics show zero use.
