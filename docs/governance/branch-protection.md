# Branch protection recommendations

Apply these settings on `main` in GitHub. This file is documentation; it does not enable the rules by itself.

## Required

- Require a pull request before merging
- Require at least one approving review, including from [CODEOWNERS](../../.github/CODEOWNERS) for owned paths
- Dismiss stale approvals when new commits are pushed
- Require conversation resolution before merge
- Require status checks to pass:
  - `quality`
  - `unit`
  - `integration`
  - `build`
  - `e2e`
  - `prisma`
  - `audit`
  - `secrets`
  - `container (api)`
  - `container (web)`
  - `container (worker)`
  - CodeQL (`Analyze (javascript-typescript)` or the check name GitHub shows)
- Require branches to be up to date before merging (or a merge queue later)
- Do not allow force pushes
- Do not allow deletions
- Restrict who can push to `main` to repository administrators if the team is larger than one person

## Security features (repository settings)

- Enable [secret scanning](https://docs.github.com/en/code-security/secret-scanning)
- Enable [push protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection)
- Enable private [vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository)
- Do not grant pull requests from forks access to repository secrets
- Keep Actions `GITHUB_TOKEN` at the default least privilege; workflows already set job-level `permissions`

## Optional later

- Require signed commits
- Merge queue
- Rulesets instead of classic branch protection

Do not require a production deploy check; deploy workflows are not configured.
