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

A run begins work only after a fresh successful check, including delivery of pending
reports outside a valid existing-user grace period. Quiet checks still print pause
and grace actions. Verification reads no support messages. Diagnosis, updates and
re-pairing stay available while work is paused; see [radio recovery](radio.md).

