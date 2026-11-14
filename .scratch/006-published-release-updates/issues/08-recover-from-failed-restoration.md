# 08: Recover when automatic restoration fails

**What to build:** When an interrupted or failed update cannot be restored automatically, help the client recover their deployed harness using a separate verified source.

**Blocked by:** 04 — Apply a pinned update to a paired harness

**Status:** completed

- [x] A failed restoration preserves the backup, journal, and failure report, lists affected files, and records that the harness requires recovery.
- [x] Subsequent update attempts stop before writes while recovery is required.
- [x] The client can run recovery from a separate pinned source without relying on the updater in the damaged harness. A failed recovery retains the available recovery evidence and keeps updates blocked.
- [x] An injected restoration failure through the deployed update journey demonstrates the block, retained evidence, and separate recovery route.

## Implementation evidence

- `docs/updating.md` documents recovery from a fresh checkout of the original
  transaction pin. The recovery command verifies the publication, commit,
  origin, and clean checkout. The withdrawal exception applies only to
  restoring an unfinished transaction from its backup.
- The deployed Codex journey injects failed restoration, verifies the write
  block and retained evidence, exercises a mismatched pin and a recovery
  collision, then restores the prior updater and release status after withdrawal.
  It verifies a separate client note survives. The Claude Code interruption
  journey verifies automatic retry requires the original release.
