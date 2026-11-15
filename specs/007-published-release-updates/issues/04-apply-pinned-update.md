# 04: Apply a pinned update to a paired harness

**What to build:** Let a paired client explicitly request an update and apply the verified published release to a supported deployed harness. Prove the initial path with a declared starting version that needs no migration script.

**Blocked by:** 03 — Install the latest published release

**Status:** completed

- [x] The update request uses the same discovery and prewrite identity checks as installation and runs the pinned commit's updater, manifest, and shipped sources.
- [x] An identical recorded release is a no-op. A lower version is refused. The same version with a different full commit hash or Release ID is reported as an integrity conflict. A legacy version string alone cannot establish a no-op.
- [x] Preflight validates the declared starting version, recorded tool, destination map, required changes, and post-apply checks. Missing declarations and unsupported paths stop before writes. Both Codex and Claude Code use their recorded layouts.
- [x] The update stages and validates changes, protects edited files during preflight, backs up changed files before promotion, and journals the operation so a retry can recover from interruption.
- [x] Required local smoke checks succeed before the tag, full commit hash, Release ID, and application time are committed. A staged failure or interruption leaves the prior release recorded. A smoke-check failure restores the pre-update state and retains a failure report.
- [x] The deployed-harness journey verifies selection, prewrite withdrawal or identity failure, no-op, downgrade refusal, and successful identity recording through the client update entry point.

## Implementation evidence

- The deployed `update/request.mjs` uses the install resolver to select and pin the
  release, then invokes that checkout's updater. The updater rechecks publication
  and identity before taking the update lock or writing to the harness.
- The transaction validates the declared no-migration path for the recorded tool,
  stages release files, and preserves optional edits. A local edit that blocks a
  required change stops preflight. A backup and journal support recovery after an
  interruption. The release identity and application time are recorded after the
  local smoke checks. A failed smoke check restores the previous state and keeps
  the failure report.
- The deployed journeys exercise Codex and Claude Code layouts, release selection,
  same-release no-op, downgrade refusal, identity conflicts, and prewrite
  withdrawal. They also exercise staging failure, required-file collisions,
  smoke-check rollback, and retry after interrupted promotion.
- Validation on integration merge `45f3972`: `node --test tests/*.test.mjs` passed
  **282/282** with loopback access for the disposable HTTP fixtures. `git diff --check`
  passed, and `node tests/helpers/pristine.mjs` confirmed the release fingerprints
  are current.
