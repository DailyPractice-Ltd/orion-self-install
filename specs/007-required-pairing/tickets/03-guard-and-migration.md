# 03: Central guard and existing-user migration

**What to build:** Orion has one shared pre-work decision that checks the server and gives a clear recovery path. Existing harnesses receive a durable, one-time transition rather than unexpectedly losing access on update.

**Blocked by:** 02 — Ratify the required-pairing contracts.

**Status:** implemented — supported entry-point adoption follows in ticket 04; replay delivery follows in ticket 05

- [x] Implement a shared guard used by supported entry points, with explicit allow/pause results and a command suitable for interactive and quiet scheduled use.
- [x] Authenticate against the verification route on each pre-work invocation. Stored verification time and credential shape never authorize new work by themselves.
- [x] Persist pairing state and distinguish accepted, invalid/revoked, unreachable, and server-error outcomes. Give one plain-language reason and a specific next action on failure.
- [x] Detect existing harnesses using recorded pre-upgrade progress; a pristine template with a status file remains a new install.
- [x] On an existing harness's first updated run, durably record the migration start and deadline exactly 30 × 24 hours apart. Never reset or extend them on later runs or updates.
- [x] During grace, permit existing work with a concise session reminder and retain connected-radio behavior. Apply the required gate at the exact deadline; test before, at, and after it and the agreed malformed/future timestamp rules.
- [x] An already paired, enabled harness can satisfy migration with accepted credentials and no new code. Preserve a prior declined choice until the user explicitly completes pairing; disabled radio or revoked credentials require recovery under the migration policy.
- [x] Keep status inspection, diagnosis, updating, code renewal, and re-pairing available while paused.
- [x] Test new and existing paired, unpaired, and previously declined harnesses; repeat runs and updates; interruption during migration persistence; all verification outcomes; and ordinary, homed, and cloud-attached credentials where applicable.
- [x] Expose the shared recovery/replay integration needed by ticket 05 without creating separate competing authorization rules.

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

Full suite evidence at this ticket boundary: `node --test` ran 201 tests,
193 passed and 8 failed. Six deployed/update journeys reject the template 3.0.0
versus still-pinned release 2.0.0; the version tripwire and pristine registry also
fail pending ticket 07 release alignment. Those files are intentionally owned by
07 and were not changed here. Syntax checks and `git diff --check` passed.
