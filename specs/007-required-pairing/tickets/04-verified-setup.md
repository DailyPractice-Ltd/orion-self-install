# 04: Require verified pairing to finish setup

**What to build:** A new user finishes setup only when their folder has exchanged a code and the server has accepted its credential. Failed or interrupted pairing stays resumable setup, with an actionable next step and no day-to-day agent handoff.

**Blocked by:** 03 — Central guard and existing-user migration.

**Status:** implemented; awaiting ticket 05 first-signal integration on the integration branch

- [x] Use the approved explanation verbatim: “Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.”
- [x] Direct users to the self-service account page and use the shared guard and pairing states for both wizard and direct conversational installation.
- [x] Missing, blank, malformed, expired, or reused codes, network failure, and rejected verification remain in setup with a specific recovery instruction. Legacy decline/skip flags cannot complete a new install.
- [x] Persist exchanged credentials before verification in the appropriate existing storage location, then mark verified only after server acceptance. Never print or log tokens.
- [x] Resume after interruption at every pairing step without re-asking saved setup answers. An exchanged but unverified credential can be rechecked without unnecessarily consuming another code; uncertain exchange outcomes offer code renewal.
- [x] Only fully verified success permits installation completion and the day-to-day agent handoff. Stored pairing time, a well-shaped key, or exchange success alone are insufficient.
- [x] Test every failure mode and success, interruption and resumption, token redaction, ordinary and homed folders, and cloud-attached credentials where applicable.
- [x] Update setup-facing instructions with this slice; ticket 07 performs the full release consistency pass.

## Implementation evidence

`start.mjs` uses the shared guard before profile/progress writes and again before handoff, persists exchanges under the shared atomic store lock, and rechecks saved credentials without requiring another code. `docs/setup.md` covers wizard and direct conversational setup; ticket 07 aligns the existing broad instructions and packaging.

Validation: `node --check start.mjs`; `node --test tests/pairing-guard.test.mjs tests/verified-setup.test.mjs` (49 tests). The initial no-code/decline test failed against the previous successful handoff, then passed after the setup gate. Failure/restart coverage includes rejected/malformed/mismatched verification, exchange/network failures, ordinary/homed/cloud credentials, pre-profile migration detection and dead-owner lock recovery.

Integration boundary: `sendFirstSignal` remains the existing sender for ticket 05/root to replace with `reportSignal`, followed by a guard check so queued or rejected first reports suppress handoff. No deployment or live account verification was attempted. Full-suite legacy setup/consent fixtures and manifest/version/pristine alignment remain ticket 07 work; `/private/tmp/ticket04-tests.log` records the intermediate 206-pass/15-fail run before two additional focused tests.
