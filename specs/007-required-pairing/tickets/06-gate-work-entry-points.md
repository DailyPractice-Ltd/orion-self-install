# 06: Gate interactive and scheduled work

**What to build:** Every supported interactive session, scheduled shift, and direct work entry point applies the same verified connection and pending-report policy before Orion does work. Recovery remains possible while paused.

**Blocked by:** 05 — Preserve and replay failed work reports.

**Status:** complete

- [x] Inventory supported work entry points and apply the shared guard before Orion tasks, outbound actions, CRM writes, work-advancing stage transitions, and scheduled shifts.
- [x] Wire agent instructions, hired-agent scheduling, and generated native schedule prompts to check before work. Update existing supported schedule definitions through the documented migration path where applicable.
- [x] Direct script invocations cannot authorize work solely from local credential shape or a previous successful check. Avoid recursive guard/report calls and unnecessary duplicate checks within one invocation.
- [x] Successful checks deliver pending reports before new work; failed checks stop work with one plain-language recovery action, subject to the agreed existing-user grace policy.
- [x] Keep diagnosis, status inspection, updating, code renewal, and re-pairing usable while paused. Read-only verification does not consume support messages.
- [x] Test interactive and scheduled paths with accepted, revoked, unreachable, and server-error outcomes, including pending-report recovery. Assert failed checks prevent actual work and state-changing side effects rather than only checking an error string.
- [x] Document the boundary for arbitrary user-edited prompts and scripts without claiming enforcement outside supported flows.
- [x] Update entry-point and scheduling instructions with this slice so shipped examples call the same guard.


Implementation: `send.mjs score`, advancing `emit-status` flags, both CRM template
CLIs, source/deployed call-planner, radio send/reply/contribute and Library `--yes`
all check fresh before effects. Reporting (`done`, signal, report-install), support
inspection and recovery remain available. AGENTS, agent definition and the native
schedule prompt carry the same ordered check. Existing native prompts require an
in-place scheduler edit; this release has no hired-agent runtime to migrate.

Verification: public CLI/task tests in `tests/work-entry-gates.test.mjs` inspect
actual HTTP calls, stage state, send log, installed skill tree and generated files.
Accepted, revoked, unreachable, server-error and retained/replayed pending reports
are covered, including scheduled commands and deployed skill layout. Release-wide
fixture/version/pristine alignment remains ticket 07; real-account live verification
is not claimed by this slice.
