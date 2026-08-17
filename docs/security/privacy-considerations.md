# Privacy considerations

How personal data is expected to flow. This is not a privacy policy, not a DPA, and not a GDPR/CCPA/HIPAA assessment.

**Legal review required** for all questions in this document before production use with real signers.

## Roles (engineering view)

| Role | Personal data involved |
| --- | --- |
| Account user | Email, authentication secrets (hashed), tenant membership |
| Tenant member | Role, actions on documents |
| Document owner | Link to account user inside a tenant |
| Signer | Email, display name, signature image/strokes, consent action, optional IP/UA |
| Operator | Access to Restricted data during incidents |

A signer is often not an account user. Do not add them to the tenant directory just because they signed.

## Data minimization

- Collect signer email and name only as needed to invite and display.
- Do not log complete personal data.
- Store signature payloads only as required to flatten the artifact; do not use them for biometrics or marketing.
- IP/UA are optional and untrusted; **Legal review required** before collecting them as default.

## Purpose limitation (intended)

| Purpose | Data |
| --- | --- |
| Authenticate account users | Credentials |
| Send and sign documents | Titles, PDFs, fields, signer contact, signatures |
| Security and fraud debugging | Opaque ids, correlation ids, coarse error codes |
| Integrity | Audit events without raw tokens or PDF bytes |

Using signer data for advertising or model training is out of scope and should remain forbidden until a reviewed change.

## Access

- Tenant isolation ([ADR-0013](../architecture/adrs/0013-multi-tenancy-isolation.md)).
- Signers see only their document and fields.
- Operators: least privilege; runbooks forbid local copies of PDFs.

## Retention and erasure

See [retention model](../architecture/retention-model.md). Erasure can conflict with the other party’s need to keep a signed record and with an append-only audit chain.

**Legal review required:**

- Lawful basis for processing signer data (if GDPR-like rules apply).
- Retention periods for artifacts vs account profiles.
- Signer access/erasure requests vs document owner’s copy.
- International transfers (email vendor, object-storage region).
- Whether documents may contain special-category data or PHI (product is not a HIPAA control set).
- Consent copy, age of signers, and workplace monitoring issues.

## Children

The product is not designed for signing by minors. **Legal review required** if any customer workflow involves anyone under applicable age of digital consent.

## Related documents

[Data classification](../architecture/data-classification.md), [Product scope](../product/product-scope.md).
