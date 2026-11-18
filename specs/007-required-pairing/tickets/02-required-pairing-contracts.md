# 02: Ratify the required-pairing contracts

**What to build:** Maintainers and implementers have one approved, consistent definition of required pairing, verified connection state, recovery, and the existing-user transition, grounded in the actual server contract.

**Blocked by:** 01 — Self-service pairing and verification.

**Status:** ready-for-agent

- [ ] Confirm the recorded maintainer approval of the written constitution amendment before changing the ratified principle or release behavior; preserve evidence rather than inventing an approval.
- [ ] Amend Article V to require a disclosed operational connection for supported use, with rationale, treatment of installs underway, and the one-time 30-day migration. Keep Intelligence Library participation separately optional and preserve consent for client words and artifacts.
- [ ] Align client and server contracts for code issuance, exchange, authenticated verification, error classification, and idempotent signal replay with ticket 01's evidence.
- [ ] Define resumable unpaired, exchanged, and verified states; last-check outcomes; verification time; and durable migration start/deadline fields. Local key shape or stored timestamps never substitute for a server check.
- [ ] Specify existing-harness detection, exact deadline behavior, malformed/future timestamp handling, and no clock reset across later runs or updates, consistent with the existing feature contract.
- [ ] Specify the labels-only outbox, original event identity and time, atomic persistence, replay acknowledgements, and behavior during the migration grace period.
- [ ] Preserve credential storage rules for ordinary, homed, and cloud-attached folders; define interrupted-exchange recovery without exposing tokens.
- [ ] State the supported-flow limitation explicitly: editable local files and prompts make this neither tamper-proof licensing nor a payment gate.
- [ ] Verify contract and schema examples agree and identify the linked specifications and user guides that must change in this release.
