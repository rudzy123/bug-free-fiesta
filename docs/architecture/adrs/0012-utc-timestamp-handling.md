# ADR-0012: UTC timestamp handling

## Status

Accepted.

## Context

Expiry, audit, and leases are instant-in-time comparisons. Mixing local timezones and `timestamp without time zone` causes off-by-hours voids and session bugs.

## Decision

- Persist all instants as UTC (`timestamptz` or equivalent).
- Application clock is an injected `Clock` returning UTC instants (testable).
- Do not trust client-supplied “now” or timezone for authorization or expiry.
- Display formatting may use the user’s locale in the UI only.
- Logs use UTC.

## Consequences

- UI must convert for display.
- `expiresAt` is an absolute instant, not “end of calendar day” in a tenant timezone unless product later defines that (**legal review required** for “signed on date X” field semantics).

## Alternatives

- Store local civil time: ambiguous around DST.
- Server local timezone: depends on host config; rejected.
