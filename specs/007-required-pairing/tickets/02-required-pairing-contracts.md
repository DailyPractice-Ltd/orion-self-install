# 02: Align the revised required-pairing contracts

**What to build:** One consistent immediate-pairing rule and silent 48-hour connection allowance, with a shared verification-and-delivery clock.

**Blocked by:** 01 — Self-service pairing and verification (existing server contract unchanged).

**Status:** revised design recorded; ratified constitution and linked release contracts need alignment.

- [x] Record the maintainer-confirmed policy in spec 007, this amendment, and the target pairing/guard contracts.
- [ ] Align ratified Article V and linked 001/002 contracts with immediate pairing and the silent 48-hour allowance. Preserve the historical approval evidence.
- [ ] Align the runtime schema/reference/template with nested pairing version 2 and `last_connected_at`; legacy migration fields are readable but inert.
- [ ] Preserve code exchange, authenticated verification, credential privacy, labels-only payloads, idempotent replay and the supported-flow limitation.
- [ ] Validate target contract/schema agreement and upgrade handling without claiming old tests validate the new policy.

## Historical candidate evidence — superseded policy

The following evidence predates the 2026-11-19 revision. It does not demonstrate the revised behavior.

Evidence: recovered historical self constitution and preserved recorded approval; 007 contract/schema, status template/reference, and 002 bridge/status contracts aligned. Structural pairing example/schema agreement, labels-only schema boundaries, JSON parse and diff whitespace checks passed. Release-contract tests: 3 passed; fingerprint freshness failed as expected after shipped schema/reference edits. Ticket 07 must regenerate pristine last. Server evidence and pending DB/live checks are explicitly distinguished in the contract. Runtime enforcement is tickets 03–06; guide consistency/live validation remains ticket 07.
