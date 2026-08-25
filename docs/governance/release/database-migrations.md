# Database migration policy

## Rules

1. **Never edit** an already-committed `packages/database/prisma/migrations/**/migration.sql` (CI enforces this).
2. Schema changes require a **new** migration directory committed in the same PR as `schema.prisma` changes (CI pairing check).
3. Apply with a **one-shot** migrate job (`esign/migrate` image or `pnpm db:migrate:deploy`) before app versions that need the schema — not from every replica on boot.
4. Prefer **expand-and-contract** for incompatible changes (see below).
5. Default strategy is **forward-fix**: ship a follow-up migration rather than reverting SQL.

## Expand-and-contract

| Phase    | Action                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- |
| Expand   | Add new columns/tables/indexes nullable or with defaults; dual-write or dual-read if needed |
| Migrate  | Backfill data; deploy app that reads new shape (still compatible with old rows)             |
| Contract | Remove old columns/code only after all readers/writers are upgraded                         |

Do not drop or rename columns in the same release that removes the last reader.

## Forward-fix

- If a bad migration was applied, add a **new** migration that corrects state.
- Keep application rollback compatible with the **current** schema (see [rollout-and-rollback.md](rollout-and-rollback.md)).

## Database rollback limitations

- Prisma migrate is not a general-purpose down-migration tool in this project.
- Point-in-time DB restore is a **disaster recovery** action, not a routine deploy rollback.
- Restores must re-verify audit chains and object integrity before write traffic resumes.
- Rolling back **application** images does not undo applied migrations.

## Local / CI

- `pnpm db:migrate:diff` against a live DB (CI `prisma` job) catches drift.
- `pnpm release:check` catches edited historical migrations and unpaired schema edits.
