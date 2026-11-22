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

A run begins only when its pre-work guard exits 0. A scripted task uses
`guard.mjs run` as its entry command; the guard, the connection allowance and recovery
are in [Install Orion](install.md#before-work). A blocked run returns the recovery
action; allowed outages stay silent.

## Editing a saved schedule

Local file changes cannot rewrite a prompt already saved in a scheduler. To change one,
open the task in Codex scheduled tasks or Claude Routines and edit its prompt in place
using the sequence above, keeping its authorization, timezone, schedule and reporting
window. Check the saved prompt and one authorized run before relying on it.
