# Security policy

This project is an electronic-signature platform under active development. Technical controls in the repository are **not** a claim of ESIGN, UETA, eIDAS, HIPAA, SOC 2, ISO 27001, or any other compliance.

Current engineering controls and residual risk: [docs/security/threat-model.md](docs/security/threat-model.md), [docs/security/security-controls.md](docs/security/security-controls.md), and [docs/security/reviews/](docs/security/reviews/).

## Report a vulnerability

Use **[GitHub Security Advisories](https://github.com/rudzy123/bug-free-fiesta/security/advisories/new)** for suspected vulnerabilities.

Do **not**:

- Open a public issue with exploit steps, payloads, or proof-of-concept code
- Attach customer PDFs, signing tokens, passwords, or complete personal data
- Email production document contents

Include only what maintainers need to reproduce on synthetic data: affected commit SHA, component (`apps/api`, `apps/web`, `apps/worker`, a package), and a high-level impact description.

## What to expect

Maintainers will acknowledge private reports as soon as practical. There is no guaranteed SLA. We may ask for clarification using the advisory thread.

Please give us a reasonable window to patch before public disclosure. Ninety days is a common default; we may agree a different timeline in the advisory.

## Secret scanning

- Enable GitHub [secret scanning](https://docs.github.com/en/code-security/secret-scanning) and [push protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection) on this repository (see [branch protection recommendations](docs/governance/branch-protection.md)).
- CI also runs TruffleHog on the checked-out tree. That scan does not receive repository secrets as inputs.
- Dependency and image scanning: `pnpm audit --audit-level=high` and Trivy on container images in CI.

## Supported versions

Only the default branch (`main`) and tagged releases, when they exist, receive security fixes. Operators must not treat an untagged `main` SHA as a production release without completing the [production-readiness checklist](docs/deployment/production-readiness-checklist.md).

## Safe harbor

Good-faith research that follows this policy and avoids accessing other tenants’ data, destroying data, or disrupting service is welcome. Do not run scans against production customer environments you do not own.
