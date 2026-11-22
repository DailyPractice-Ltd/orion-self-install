# 03: Central guard and 48-hour connection allowance

**What to build:** One pre-work gate for all harnesses: immediate pairing, then a silent 48-hour allowance for temporary connection or reporting failures.

**Blocked by:** 02 — Align the revised required-pairing contracts.

**Status:** revised client implementation complete; fresh local evidence is recorded in verification.md. Database and real-account verification remain deferred.

- [x] Remove existing-harness progress detection, migration clocks, countdowns and reminders. An unpaired harness is blocked on its first updated run.
- [x] Upgrade absent/version-1 state compatibly to version 2. Ignore historical migration fields for authorization; never derive a connection allowance from them or `verified_at`.
- [x] Reuse accepted existing credentials without another code. Preserve a declined choice until explicit pairing.
- [x] Attempt authenticated verification at every task/shift entry. Only accepted verification plus fully acknowledged queued-report delivery refreshes `last_connected_at`, under the shared lock.
- [x] Allow temporary network/server/reporting failures while `now < last_connected_at + 48 hours`, without notices. Partial replay, failed attempts, successful verification alone with pending reports, restarts and updates never extend the clock.
- [x] Block invalid/revoked credentials immediately and invalidate the saved allowance. Disabled radio, mismatched identity, unsafe local state, malformed/future timestamps and unsafe locks also require recovery.
- [x] At the exact deadline block new tasks/shifts unless verification and delivery succeed. Let a task already admitted finish and report after expiry.
- [x] Keep diagnosis, inspection, updating, code renewal, re-pairing and finished-work reporting available. Explain recovery only when new work is blocked.
- [x] Test before/at/after the deadline, restart/update persistence, all failure classes, credential storage variants, historical state, concurrency and underway-task completion. Verify that allowed outage runs print no notice.
- [x] Share this policy with reporting and supported entry points rather than introducing separate clocks or gates.

## Historical candidate evidence — superseded policy

The following evidence predates the 2026-11-19 revision. It does not demonstrate the revised behavior.

## Implementation evidence

- `status/guard.mjs`: public `checkWork` and `check [--quiet]`, fresh read-only
  `/verify`, migration-before-network persistence, sticky satisfaction and recovery.
- `status/store.mjs`: cross-process transaction lock; fresh status/outbox reads;
  flushed same-directory atomic replacement. Interrupted owner locks pause for
  explicit recovery; they are never reclaimed based on age.
- Focused `node --test tests/pairing-guard.test.mjs`: 27 public API/CLI tests pass,
  including red-to-green new installs, credential acceptance, malformed markers,
  malformed queue handling, symlinked CLI path and impossible calendar dates.
  Coverage includes 2.0.0 progress detection, before/at/after deadline, capped and
  earlier deadlines, declined preservation, sticky satisfaction/revocation,
  ordinary/homed/environment/cloud keys, malformed responses, independent-process
  concurrency and killed-process persistence. No live account test claimed.
- Ticket 05 must supply pure `validateOutbox` and locked replay. Pending reports
  fail closed if the reporting runtime is missing; empty queues work independently.
- Ticket 04 owns entry-point adoption; inspection/update/recovery are not gated by
  this module. Ticket 07 owns deployment manifests and pristine fingerprints.
