## Summary

<!-- Why this change exists. Do not paste secrets, tokens, customer documents, or PDFs. -->

## Type of change

- [ ] `feat`
- [ ] `fix`
- [ ] `docs`
- [ ] `refactor`
- [ ] `test`
- [ ] `chore`
- [ ] `ci`

## Test plan

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration` (with `pnpm infrastructure:up` when infra tests are included)
- [ ] `pnpm build`
- [ ] New or updated tests for behavior changes

## Security

- [ ] No secrets, signing tokens, or real credentials
- [ ] Authorization remains deny-by-default where this change touches access
- [ ] Logs do not include passwords, tokens, cookies, or document bytes
- [ ] Browser-supplied IDs or coordinates are not trusted (if UI/API changed)

## Documentation

- [ ] ADRs, OpenAPI, runbooks, or comments updated when behavior changes
- [ ] No legal or compliance claims (ESIGN, HIPAA, SOC 2, and similar)

## Definition of done

See [docs/governance/definition-of-done.md](../docs/governance/definition-of-done.md).
