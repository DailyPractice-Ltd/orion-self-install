# 07: Resolve edits that block required fixes

**What to build:** Let a client keep local edits to optional released files and review any local edit that still blocks a required fix after considering declared migrations.

**Blocked by:** 06 — Apply declared migrations and verify legacy identity

**Status:** ready-for-agent

- [ ] Preserve edited released files when incoming changes are optional and name the preserved edits in the update report.
- [ ] When a declared migration cannot reconcile an edit that blocks a required fix, stop before applying. Show the prior shipped, client-edited, and pinned incoming versions using the release's historical evidence.
- [ ] Continue only with the client's chosen reviewed merge or backed-up replacement. Then run the same staged validation and local smoke checks before recording the applied update.
- [ ] Deferring leaves harness files and the applied release identity unchanged.
