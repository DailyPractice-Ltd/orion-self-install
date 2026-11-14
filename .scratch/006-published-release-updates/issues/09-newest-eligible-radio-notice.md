# 09: Show one radio notice for the newest eligible release

**What to build:** Let a paired harness with check-ins enabled hear once about the newest published release it can take, with enough context to decide when to request an update.

**Blocked by:** 06 — Apply declared migrations and verify legacy identity

**Status:** ready-for-agent

- [ ] The bridge uses applied version and declared compatibility to select the newest eligible release newer than the harness's applied version. When several releases were missed, it selects only the newest eligible one.
- [ ] The structured payload carries version, tag, full commit hash, Release ID, a short summary from the pinned changelog, and the full-notes link.
- [ ] On radio check, the harness displays the version, summary, notes link, and “Say 'update my harness' when you're ready.” The commit hash and Release ID stay in the payload.
- [ ] Retry delivery until display is durably recorded. Repeated checks and delivery retries do not display a recorded notice again. A later eligible release can receive its own notice.
- [ ] Unpaired harnesses and harnesses with check-ins disabled receive no release notice. Display leaves the installed release and client files alone, apart from the notice record, and neither requires a reply nor starts an update.
