# Conventional commits

Use [Conventional Commits](https://www.conventionalcommits.org/). The GitHub history and future changelog depend on the `type`.

## Format

```text
type(optional-scope): short summary

Optional body explaining why.
```

Summary in imperative mood, ~72 characters, no trailing period.

## Types

| Type       | Use                                 |
| ---------- | ----------------------------------- |
| `feat`     | User-visible capability             |
| `fix`      | Bug fix                             |
| `docs`     | Documentation only                  |
| `refactor` | No behavior change                  |
| `test`     | Tests only                          |
| `chore`    | Tooling, dependencies, housekeeping |
| `ci`       | GitHub Actions or CI scripts        |
| `perf`     | Performance                         |
| `revert`   | Revert a previous commit            |

Scopes (optional): `web`, `api`, `worker`, `database`, `config`, `ci`, `docs`.

## Examples

```text
feat(api): reject oversized JSON bodies with a stable error envelope
fix(web): label the health status for screen readers
docs: add branch protection recommendations
ci: pin third-party actions to commit SHAs
chore(deps): bump vitest to 3.2.7
```

## Do not

- Put secrets, tokens, or customer identifiers in the subject or body
- Use `feat` for CI-only or docs-only work
- Stack unrelated changes in one commit when they can be split

Dependabot PRs should keep the `chore`/`ci` prefixes configured in `.github/dependabot.yml`.
