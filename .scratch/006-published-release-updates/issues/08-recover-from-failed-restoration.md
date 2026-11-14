# 08: Recover when automatic restoration fails

**What to build:** When an interrupted or failed update cannot be restored automatically, help the client recover their deployed harness using a separate verified source.

**Blocked by:** 04 — Apply a pinned update to a paired harness

**Status:** ready-for-agent

- [ ] A failed restoration preserves the backup, journal, and failure report, lists affected files, and records that the harness requires recovery.
- [ ] Subsequent update attempts stop before writes while recovery is required.
- [ ] The client can run recovery from a separate pinned source without relying on the updater in the damaged harness. A failed recovery retains the available recovery evidence and keeps updates blocked.
- [ ] An injected restoration failure through the deployed update journey demonstrates the block, retained evidence, and separate recovery route.
