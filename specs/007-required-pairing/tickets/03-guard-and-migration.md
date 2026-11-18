# 03: Central guard and existing-user migration

**What to build:** Orion has one shared pre-work decision that checks the server and gives a clear recovery path. Existing harnesses receive a durable, one-time transition rather than unexpectedly losing access on update.

**Blocked by:** 02 — Ratify the required-pairing contracts.

**Status:** ready-for-agent

- [ ] Implement a shared guard used by supported entry points, with explicit allow/pause results and a command suitable for interactive and quiet scheduled use.
- [ ] Authenticate against the verification route on each pre-work invocation. Stored verification time and credential shape never authorize new work by themselves.
- [ ] Persist pairing state and distinguish accepted, invalid/revoked, unreachable, and server-error outcomes. Give one plain-language reason and a specific next action on failure.
- [ ] Detect existing harnesses using recorded pre-upgrade progress; a pristine template with a status file remains a new install.
- [ ] On an existing harness's first updated run, durably record the migration start and deadline exactly 30 × 24 hours apart. Never reset or extend them on later runs or updates.
- [ ] During grace, permit existing work with a concise session reminder and retain connected-radio behavior. Apply the required gate at the exact deadline; test before, at, and after it and the agreed malformed/future timestamp rules.
- [ ] An already paired, enabled harness can satisfy migration with accepted credentials and no new code. Preserve a prior declined choice until the user explicitly completes pairing; disabled radio or revoked credentials require recovery under the migration policy.
- [ ] Keep status inspection, diagnosis, updating, code renewal, and re-pairing available while paused.
- [ ] Test new and existing paired, unpaired, and previously declined harnesses; repeat runs and updates; interruption during migration persistence; all verification outcomes; and ordinary, homed, and cloud-attached credentials where applicable.
- [ ] Expose the shared recovery/replay integration needed by ticket 05 without creating separate competing authorization rules.
