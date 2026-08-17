# ADR-0007: Server-owned signature placement

## Status

Accepted.

## Context

Signer UIs often send page numbers and x/y coordinates. Trusting them allows a signer (or XSS) to stamp the wrong place, skip a field, or overwrite another signer’s region.

## Decision

- **Signature fields** are created and updated only in `draft` by authorized tenant members, persisted on the server.
- At sign time the API loads fields by id and assigned `signerId`. Client coordinates are ignored for the record.
- The worker paints the finalized PDF using stored geometry plus stored completion payloads.
- The UI may render fields for usability but is not the source of truth.

## Consequences

- Field-editor UX must round-trip through the API.
- Changing placement after `sent` is forbidden (void and recreate, or a future explicit amendment flow — **legal review required**).

## Alternatives

- Trust client coordinates with server-side bounds checks: still allows in-bounds fraud.
- Flatten in the browser: trivial to spoof; rejected.
