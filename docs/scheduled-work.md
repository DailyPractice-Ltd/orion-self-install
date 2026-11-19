# Schedule Orion

Orion runs recurring work through Codex scheduled tasks or Claude Routines. Choose
the time and timezone in the native scheduler and attach the Orion project and the
connectors used by the task. Select the local Orion folder for work that needs local
files. Check that the scheduled environment can run Node and read this folder's
knowledge base, skill and pairing credential before enabling it. Keep credentials
in their established local key or supported attached-secret location, never prompts.

## Native task prompt

Use this sequence in every created or generated native task prompt, replacing the
skill and reporting window with the task the client authorized:

> In this Orion folder, read AGENTS.md. First run `node status/guard.mjs check --quiet`.
> Continue only if it exits 0. If it exits 2, stop work and return its recovery action;
> a previous successful run is not permission. Then run the Friday Report skill for
> the current reporting window, using the existing knowledge base and permissions.
> Read CRM, calendar and email evidence. Return a private draft in this run. If
> required evidence is unavailable, say what is missing. After finished work, run
> `node status/done.mjs --shift --skill friday-report --tag reporting --count <n> --line "<short local summary>"`.
> Use count 0 when the completed run found nothing to do. Report completed work even
> if connectivity failed afterward; the local report is retained for delivery.

A run begins only when its pre-work guard exits 0. Temporary verification or
reporting failures permit work silently within the shared 48-hour allowance.
Only accepted verification and complete report delivery renew that clock. At
expiry block new runs; admitted tasks finish and report. Invalid/revoked credentials
block immediately. Quiet checks print recovery only when blocking. Verification reads no support messages. Diagnosis, updates and
re-pairing stay available while work is paused; see [radio recovery](radio.md).



For a task composed of script commands, admit the whole invocation with
`node status/guard.mjs run -- <command> [args]` (for a shell sequence, use
`run -- sh -c '<commands>'`). Nested gated commands use the live parent admission
until that command exits, so authorized actions and reporting can finish after
expiry. The scope stays in that invocation's descendants and ends with its parent;
never save or reuse its environment for another task. For interactive connector
work, run `check --quiet` once at the task boundary and finish the admitted task;
do not add a new mid-task check. Run the guard again for the next task or shift.


## Existing schedules

Update each stored native task prompt so its next run follows the current pairing
policy. In Codex scheduled tasks or Claude Routines, open the existing task and
edit its prompt in place using the sequence above; preserve its authorization,
timezone, schedule and reporting window. Remove old migration reminders, countdowns
and instructions to alert on every outage. Local file updates cannot rewrite a
prompt already saved in a scheduler. Verify the saved prompt and one authorized
run before relying on it. For a scripted task, use `guard.mjs run --` as its entry
command, so nested commands share that invocation's admission. For an interactive
connector task, run the guard once at the task boundary. At the next run, check
again. Blocked runs return the recovery action; allowed outages stay silent.
