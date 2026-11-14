# 06: Apply declared migrations and verify legacy identity

**What to build:** Let a client update from a declared older starting state using the selected release's migration path. A supported same-folder harness moves to a separate deployed folder while its original stays available.

**Blocked by:** 04 — Apply a pinned update to a paired harness

**Status:** ready-for-agent

- [ ] Before writes, verify one complete ordered path for the starting version and tool. Reject missing or ambiguous steps and missing declarations of intended local changes or required checks.
- [ ] Run only migration scripts from the pinned commit and preserve the recorded tool and existing radio choice. Migrations operate on staged local harness content and make no writes to live external accounts.
- [ ] Back up every changed file before promotion and report the actual changes. Failures and interruptions use the update journal to keep or restore the prior state and identity.
- [ ] A supported legacy same-folder migration stages and applies into a separate deployed folder, leaving the original intact.
- [ ] A legacy template_version or missing selected_tool requires a declared migration that verifies the installed bytes and layout before backfilling identity or tool and deciding whether to apply or do nothing.
- [ ] An unsupported or unverifiable starting state gets a separate clean-install recommendation without automatic transfer of status or configuration.
