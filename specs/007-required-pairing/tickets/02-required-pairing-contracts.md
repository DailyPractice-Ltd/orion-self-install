# 02: Ratify the required-pairing contracts

**What to build:** Maintainers and implementers have one approved, consistent definition of required pairing, verified connection state, recovery, and the existing-user transition, grounded in the actual server contract.

**Blocked by:** 01 — Self-service pairing and verification.

**Status:** complete

- [x] Confirm the recorded maintainer approval of the written constitution amendment before changing the ratified principle or release behavior; preserve evidence rather than inventing an approval.
- [x] Amend Article V to require a disclosed operational connection for supported use, with rationale, treatment of installs underway, and the one-time 30-day migration. Keep Intelligence Library participation separately optional and preserve consent for client words and artifacts.
- [x] Align client and server contracts for code issuance, exchange, authenticated verification, error classification, and idempotent signal replay with ticket 01's evidence.
- [x] Define resumable unpaired, exchanged, and verified states; last-check outcomes; verification time; and durable migration start/deadline fields. Local key shape or stored timestamps never substitute for a server check.
- [x] Specify existing-harness detection, exact deadline behavior, malformed/future timestamp handling, and no clock reset across later runs or updates, consistent with the existing feature contract.
- [x] Specify the labels-only outbox, original event identity and time, atomic persistence, replay acknowledgements, and behavior during the migration grace period.
- [x] Preserve credential storage rules for ordinary, homed, and cloud-attached folders; define interrupted-exchange recovery without exposing tokens.
- [x] State the supported-flow limitation explicitly: editable local files and prompts make this neither tamper-proof licensing nor a payment gate.
- [x] Verify contract and schema examples agree and identify the linked specifications and user guides that must change in this release.

Evidence: recovered historical self constitution and preserved recorded approval; 007 contract/schema, status template/reference, and 002 bridge/status contracts aligned. Structural pairing example/schema agreement, labels-only schema boundaries, JSON parse and diff whitespace checks passed. Release-contract tests: 3 passed; fingerprint freshness failed as expected after shipped schema/reference edits. Ticket 07 must regenerate pristine last. Server evidence and pending DB/live checks are explicitly distinguished in the contract. Runtime enforcement is tickets 03–06; guide consistency/live validation remains ticket 07.
