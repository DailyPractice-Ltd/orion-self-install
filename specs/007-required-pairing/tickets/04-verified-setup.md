# 04: Require verified pairing to finish setup

**What to build:** Setup needs current accepted verification and acknowledged setup reporting. The 48-hour allowance permits ongoing work, never incomplete setup or handoff.

**Blocked by:** 03 — Central guard and 48-hour connection allowance.

**Status:** revised client implementation complete; fresh local evidence is recorded in verification.md. Database and real-account verification remain deferred.

- [x] Preserve the approved pairing explanation, self-service route, saved answers, interrupted-exchange recovery and credential secrecy.
- [x] Keep missing/invalid codes, failed verification and undelivered setup checkpoints in resumable setup; no handoff on stored credentials or the connection allowance alone.
- [x] Remove migration detection from setup. Existing accepted credentials can complete the current check without a new code; unpaired users must pair immediately.
- [x] Establish the connection timestamp only after accepted verification and acknowledged outbox delivery; keep durable setup checkpoint identity unchanged.
- [x] Verify new/existing installation, resumption, ordinary/homed/cloud credentials, historical state and concurrent wizard persistence under the revised contract.

## Historical candidate evidence — superseded policy

The following evidence predates the 2026-11-19 revision. It does not demonstrate the revised behavior.

## Implementation evidence

`start.mjs` uses the shared guard before profile/progress writes and again before handoff, persists exchanges under the shared atomic store lock, and rechecks saved credentials without requiring another code. `docs/setup.md` covers wizard and direct conversational setup; ticket 07 aligns the existing broad instructions and packaging.

Validation: `node --check start.mjs`; `node --test tests/pairing-guard.test.mjs tests/verified-setup.test.mjs` (49 tests). The initial no-code/decline test failed against the previous successful handoff, then passed after the setup gate. Failure/restart coverage includes rejected/malformed/mismatched verification, exchange/network failures, ordinary/homed/cloud credentials, pre-profile migration detection and dead-owner lock recovery.

Ticket 05 integration: `sendFirstSignal` uses `reportSignal` with a durable original checkpoint identity. Queued, rejected or malformed acknowledgements suppress handoff. After delivery the shared lock confirms an empty outbox and unchanged accepted folder association; completed checkpoints are not recreated on resume. No deployment or live account verification was attempted. Full-suite legacy setup/consent fixtures and manifest/version/pristine alignment remain ticket 07 work; `/private/tmp/ticket04-tests.log` records the intermediate 206-pass/15-fail run before two additional focused tests.
