# 06: Gate interactive and scheduled work

**What to build:** Every supported interactive session, scheduled shift, and direct work entry point applies the same verified connection and pending-report policy before Orion does work. Recovery remains possible while paused.

**Blocked by:** 05 — Preserve and replay failed work reports.

**Status:** ready-for-agent

- [ ] Inventory supported work entry points and apply the shared guard before Orion tasks, outbound actions, CRM writes, work-advancing stage transitions, and scheduled shifts.
- [ ] Wire agent instructions, hired-agent scheduling, and generated native schedule prompts to check before work. Update existing supported schedule definitions through the documented migration path where applicable.
- [ ] Direct script invocations cannot authorize work solely from local credential shape or a previous successful check. Avoid recursive guard/report calls and unnecessary duplicate checks within one invocation.
- [ ] Successful checks deliver pending reports before new work; failed checks stop work with one plain-language recovery action, subject to the agreed existing-user grace policy.
- [ ] Keep diagnosis, status inspection, updating, code renewal, and re-pairing usable while paused. Read-only verification does not consume support messages.
- [ ] Test interactive and scheduled paths with accepted, revoked, unreachable, and server-error outcomes, including pending-report recovery. Assert failed checks prevent actual work and state-changing side effects rather than only checking an error string.
- [ ] Document the boundary for arbitrary user-edited prompts and scripts without claiming enforcement outside supported flows.
- [ ] Update entry-point and scheduling instructions with this slice so shipped examples call the same guard.
