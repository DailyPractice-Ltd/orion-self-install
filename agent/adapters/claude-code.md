# Adapter — Claude Code (or another code-capable AI surface)

**Thin by design**: mechanics only. Behaviour lives in
[`agent-definition.md`](../agent-definition.md) — fix it there, not here.

Use Claude Code in the deployed client folder, with file access and Node.js execution.
Codex has its own [adapter](codex.md). Website-only and paste-only chat are unsupported.
Follow [setup and recovery](../../docs/setup.md), then run
`node status/guard.mjs check --quiet` before each interactive or scheduled task.
Continue only on exit 0; exit 2 permits recovery only. Temporary verification or
reporting failures permit silent work within the shared 48-hour allowance.
Expiry blocks the next task; admitted work may finish and report.

Open the **deployed client folder** and read `AGENTS.md`, the shared instructions.
The installer does not add `CLAUDE.md`. Anthropic's `agents-md` plugin can load
`AGENTS.md` when no `CLAUDE.md` is in scope, but this depends on that setup. If this
Claude Code installation does not load it, create a client-folder `CLAUDE.md` whose
only content is `@AGENTS.md`. Do not duplicate the instructions in that pointer.

Orion's shipped skills come from the `orion` plugin in `plugins/orion/`, installed
for this folder only (local scope). Invoke one as `/orion:<skill>`, such as
`/orion:update-harness`. Skills the client creates or adds live in `.claude/skills/`;
updates never touch them. If the Orion skills are missing, read `plugin` in
`status/status.json` and follow [Finish the Orion plugin](../../docs/setup.md#finish-the-orion-plugin).

## What you can do directly, that the chat-surface adapters can't

- Read and write `status/status.json` yourself — the resumability mechanism becomes fully
  automatic instead of "tell the client to note this down."
- Run `crm/attio/apply-attio-template.mjs` or `crm/hubspot/apply-hubspot-template.mjs`
  directly, once the client has pasted in an API key/token (still ask them to generate it
  themselves — never ask for or handle a credential in a way that implies you're storing
  it anywhere but the one command that needs it).
- Run `status/emit-status.mjs` for the install checkpoint on allowed stage changes.
- Report finished work, the way the "# The radio" section of the system prompt says
  (full table in `docs/radio.md`): `node status/done.mjs` when a task the client set
  is finished, and `node status/radio.mjs signal --type <type>` at the five approval
  moments. The code-capable adapters (this file and `codex.md`) are the only ones
  that can run those commands, so they are the only surfaces where work is
  reported. Record finished authorized work even after a connection failure; only
  operational labels enter the durable outbox, and later work waits for recovery
  when the shared guard blocks.
- Edit the knowledge-base files directly as the client talks, rather than asking them to
  paste text into a file themselves.

## Scheduled work

Use Claude Routines for recurring Orion work. See [Schedule Orion](../../docs/scheduled-work.md).

## What you still do exactly like the other adapters

- The conversation itself — knowledge-base capture, tone-check, CRM-choice discussion — is
  identical regardless of adapter. This file changes *how* you execute, never *what* you
  ask or *why*.
- Connector authentication (Gmail, Calendar, CRM OAuth) still happens in the client's own
  browser — you cannot and must not attempt to automate an OAuth flow or handle a
  password. Confirm with the client that they've completed it; don't try to do it for them.
- Sending follows rule 1 in the agent definition. The scheduled environment's connector
  permissions also apply. If a send tool is missing or requires interactive approval,
  leave the message waiting for the user.

## Waiting for you, on this surface

- The truth is `status/waiting.md`, rewritten by every run. In the Claude desktop app's
  Code tab, keep one local scheduled task named "Waiting for you" per harness, with no
  schedule of its own, run by each shift so its newest run is the list; the sidebar's
  Scheduled group keeps one row per task that opens the latest run. On the command line,
  keep one session with a fixed id in `scopes.waiting_session` in `status/status.json`,
  named once with /rename and appended to by each run with `claude -p --resume <id>`.
- A Claude desktop scheduled task (rung A) sends once its send tool is allowed in that
  task's "always allowed" panel; otherwise the run stalls rather than denies.

## Practical notes

- Confirm Node.js is available (`node --version`) before offering the scripted CRM/status
  paths. If it is missing, help install Node.js before Orion work; the required
  pairing and connection checks depend on it.
- Both CRM apply scripts and `emit-status.mjs` are dependency-free (`node:fs` + global
  `fetch` only) — there's no `npm install` step to walk anyone through.


For a task composed of script commands, admit the whole invocation with
`node status/guard.mjs run -- <command> [args]` (for a shell sequence, use
`run -- sh -c '<commands>'`). Nested gated commands use the live parent admission
until that command exits, so authorized actions and reporting can finish after
expiry. The scope stays in that invocation's descendants and ends with its parent;
never save or reuse its environment for another task. For interactive connector
work, run `check --quiet` once at the task boundary and finish the admitted task;
do not add a new mid-task check. Run the guard again for the next task or shift.
