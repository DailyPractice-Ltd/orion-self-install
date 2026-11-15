# 07: Resolve edits that block required fixes

**What to build:** Let a client keep local edits to optional released files and review any local edit that still blocks a required fix after considering declared migrations.

**Blocked by:** 06 — Apply declared migrations and verify legacy identity

**Status:** completed

- [x] Preserve edited released files when incoming changes are optional and name the preserved edits in the update report.
- [x] When a declared migration cannot reconcile an edit that blocks a required fix, stop before applying. Show the prior shipped, client-edited, and pinned incoming versions using the release's historical evidence.
- [x] Continue only with the client's chosen reviewed merge or backed-up replacement. Then run the same staged validation and local smoke checks before recording the applied update.
- [x] Deferring leaves harness files and the applied release identity unchanged.

## Implementation evidence

- `update/published-conflicts.mjs` prepares the private review from the exact
  prior release, the installed file, and the pinned incoming file. Continuing
  rechecks the publication, installed bytes, and all three review copies.
- Deployed Codex and Claude Code journeys cover deferral, reporting preserved
  optional edits, backed-up replacement, reviewed merge, smoke-check failure,
  an unresolved declared migration, a stale or altered review, and a moved
  historical tag. A separate migration journey resumes after one radio opt-in.
- On integration commit `a407dec`, the pristine fingerprint and Git whitespace
  checks passed. The full suite passed 298 of 299 tests. The macOS sandbox
  profile rejected the first ephemeral loopback bind. A rerun of
  `tests/published-install.test.mjs` with local loopback access passed all 12
  cases, verifying all 299 cases across both runs on the same checkout.
