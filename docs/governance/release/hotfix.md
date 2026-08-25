# Incident hotfix process

1. **Triage** — severity, customer impact, whether data/audit integrity is at risk. Do not log secrets or document contents.
2. **Stabilize** — flag off, traffic shift, or scale down the failing path per [rollout-and-rollback.md](rollout-and-rollback.md).
3. **Branch** — from the deployed tag when needed (`hotfix/vX.Y.Z-description`), or fix forward on `main` if that is what production tracks.
4. **Minimal change** — fix + tests; no drive-by refactors.
5. **CI** — green unit/integration; run `pnpm release:check`; skip only what incident command explicitly documents.
6. **Release** — patch SemVer tag; dry-run changelog; human-created GitHub Release; deploy migrate-if-needed then images.
7. **Verify** — health, queues, audit append, canary cohort.
8. **Post-incident** — root cause, follow-up tickets, update runbooks; merge hotfix back to `main` if branched.

Hotfixes still follow Conventional Commits (`fix:` / `fix!:`) and do **not** auto-publish from CI.
