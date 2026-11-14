# 04: Apply a pinned update to a paired harness

**What to build:** Let a paired client explicitly request an update and apply the verified published release to a supported deployed harness. Prove the initial path with a declared starting version that needs no migration script.

**Blocked by:** 03 — Install the latest published release

**Status:** ready-for-agent

- [ ] The update request uses the same discovery and prewrite identity checks as installation and runs the pinned commit's updater, manifest, and shipped sources.
- [ ] An identical recorded release is a no-op. A lower version is refused. The same version with a different full commit hash or Release ID is reported as an integrity conflict. A legacy version string alone cannot establish a no-op.
- [ ] Preflight validates the declared starting version, recorded tool, destination map, required changes, and post-apply checks. Missing declarations and unsupported paths stop before writes. Both Codex and Claude Code use their recorded layouts.
- [ ] The update stages and validates changes, protects edited files during preflight, backs up changed files before promotion, and journals the operation so a retry can recover from interruption.
- [ ] Required local smoke checks succeed before the tag, full commit hash, Release ID, and application time are committed. A staged failure or interruption leaves the prior release recorded. A smoke-check failure restores the pre-update state and retains a failure report.
- [ ] The deployed-harness journey verifies selection, prewrite withdrawal or identity failure, no-op, downgrade refusal, and successful identity recording through the client update entry point.
