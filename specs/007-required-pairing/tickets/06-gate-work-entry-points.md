# 06: Gate interactive and scheduled work

**What to build:** Supported entry points use the same immediate-pairing and silent 48-hour connection policy, with task-boundary expiry.

**Blocked by:** 05 — Preserve and replay failed work reports.

**Status:** reopened — existing gate wiring needs revised behavior and instructions verified.

- [ ] Apply the shared guard before each supported interactive task and scheduled shift, including scripts, outbound actions, CRM writes and advancing installation stages as applicable. Avoid redundant checks within one admitted task.
- [ ] Permit temporary verification/reporting failures only within the shared allowance. Emit no outage notice/countdown or repeated scheduled alerts while work is allowed.
- [ ] Block unpaired users immediately; block invalid/revoked credentials immediately; block expired allowance at the next task/shift boundary with one recovery action.
- [ ] Let work admitted before expiry finish and report. Nested entry points in that task must not introduce a contradictory mid-task deadline stop; authorization remains bounded to that invocation, never a reusable saved bypass.
- [ ] Keep diagnosis, inspection, updating, renewal, pairing and finished-work reporting available while blocked.
- [ ] Update agent instructions and generated/native schedule prompts; test allowed/blocked cases against actual effects, including underway-task completion and silence during outages.
- [ ] Preserve the documented limitation for arbitrary user-edited local prompts and scripts.

## Historical candidate evidence — superseded policy

The following evidence predates the 2026-11-19 revision. It does not demonstrate the revised behavior.

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
