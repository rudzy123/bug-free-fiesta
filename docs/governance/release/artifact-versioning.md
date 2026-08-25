# Artifact versioning

## Object-format versioning

- Stored document bytes and derived artifacts use **content-addressed or immutable keys** where practical.
- Metadata and serialization envelopes include an integer **`formatVersion`** (or equivalent).
- Readers must reject or safely ignore unknown newer versions; writers never mutate historical object bytes in place.
- Breaking format changes: write new objects (new version), dual-read during expand, then stop writing the old version.

## Audit-event schema versioning

- Canonical hash input is versioned via `AUDIT_CHAIN_SCHEMA_VERSION` in `@esign/domain`.
- **Do not modify** the hashing/canonicalization rules for an existing schema version in place.
- To change semantics: bump the version, keep historical verification paths for old rows, update the fingerprint lock in CI.
- CI fails if the fingerprint for the current version changes without a version bump.

## Evidence-package versioning

- Evidence / completion packages are versioned artifacts (`evidencePackageVersion` or equivalent in package metadata).
- Regenerating a package creates a **new** artifact; do not overwrite prior package bytes used for disputes.
- Document which audit schema and object format versions a package claims to bind — without asserting legal sufficiency.
