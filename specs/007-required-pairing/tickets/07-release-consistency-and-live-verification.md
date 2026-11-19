# 07: Align documentation and verify the complete journey

**What to build:** The release presents one consistent supported installation and recovery journey, backed by automated checks and a live account-and-bridge demonstration of pairing, pause, reporting, and recovery.

**Blocked by:** 04 — Require verified pairing to finish setup; 06 — Gate interactive and scheduled work.

**Status:** implemented-reviewed-awaiting-live — incomplete

Automated client suite after final review fixes: 297 passed, 0 failed/skipped. Both deployment plans passed.
See [verification evidence and pending live checklist](../verification.md).
The maintainer deferred live testing; PostgreSQL integration runner is unexecuted.
No tag, deployment or release publication occurred.

- [x] Align the constitution, linked specifications, status schema, client and server bridge contracts, installer brief, README, radio guide, adapters, scheduling instructions, and validation guidance in the same release.
- [x] Remove contradictory promises of skip/decline, unaffected work with radio off, and supported website-only or paste-only installation. Preserve historical-choice explanations and the explicit 30-day transition.
- [x] Keep the approved short explanation in setup and put the precise existing operational-data disclosure in the radio guide. Neither implementation nor documentation expands the payload.
- [x] Ensure supported surfaces can execute pairing and connection checks; provide a supported route from website-only and paste-only surfaces without claiming those surfaces can run the guard.
- [x] Run automated coverage for new-install failures and success, interrupted pairing, credential secrecy, all migration cohorts and clock boundaries, session and shift failure gating, durable replay without duplicate counts, and credential storage variants.
- [x] Add focused documentation/contract consistency checks and verify packaged/released files include the guard, schema changes, reporting support, and updated instructions. Run the repositories' required checks.
- [x] Resolve the final Standards/Spec review findings with red-to-green public-entry regressions for concurrent wizard persistence, reporting-first legacy migration and no-app setup copy. Full client suite: 297 passed; both package plans passed. See verification evidence; database/live requirements remain open.
- [ ] Perform a live end-to-end check using a real signed-in Daily Practice account and bridge: obtain a code without support, exchange and verify, complete setup, run an interactive and scheduled pre-work check, demonstrate failure pause, and recover with pending-report replay without duplicate counts.
- [ ] Record live verification outcomes and sanitized evidence without tokens or client content. If account access or deployment prevents a live check, explicitly record that blocker and leave this ticket incomplete; do not claim the feature works end to end.
- [x] Keep all monorepo changes on `feature/required-pairing`; report validation evidence and remaining limitations without publishing or deploying a release as an implicit part of ticket completion.
