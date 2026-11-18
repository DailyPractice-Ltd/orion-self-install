# Adapter — Claude Code (or another code-capable AI surface)

**Thin by design**: mechanics only. Behaviour lives in
[`agent-definition.md`](../agent-definition.md) — fix it there, not here.

Best fit when the client's assistant can read and write files and run scripts directly in
this repository — Claude Code, Cursor, Copilot's agent mode, or similar (Codex has its
own thin adapter, `codex.md`, for its sandbox specifics). This is the
**fastest** path, because it can do mechanically what the other three adapters have to talk
a human through by hand.

Open the **deployed client folder** and read `AGENTS.md`, the shared instructions.
The installer does not add `CLAUDE.md`. Anthropic's `agents-md` plugin can load
`AGENTS.md` when no `CLAUDE.md` is in scope, but this depends on that setup. If this
Claude Code installation does not load it, create a client-folder `CLAUDE.md` whose
only content is `@AGENTS.md`. Do not duplicate the instructions in that pointer.
Installed skills are in `.claude/skills/`.

## What you can do directly, that the chat-surface adapters can't

- Read and write `status/status.json` yourself — the resumability mechanism becomes fully
  automatic instead of "tell the client to note this down."
- Run `crm/attio/apply-attio-template.mjs` or `crm/hubspot/apply-hubspot-template.mjs`
  directly, once the client has pasted in an API key/token (still ask them to generate it
  themselves — never ask for or handle a credential in a way that implies you're storing
  it anywhere but the one command that needs it).
- Run `status/emit-status.mjs` for the install checkpoint on stage changes, if the client
  has left check-ins enabled.
- Report finished work, the way the "# The radio" section of the system prompt says
  (full table in `docs/radio.md`): `node status/done.mjs` when a task the client set
  is finished, and `node status/radio.mjs signal --type <type>` at the five approval
  moments. The code-capable adapters (this file and `codex.md`) are the only ones
  that can run those commands, so they are the only surfaces where work is
  reported. Same gate as everything outbound: the radio is on, the work is
  finished, and it is work the client asked for or approved.
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
  paths; if it's missing, fall back to the manual paths in `crm/other-crm-manual-setup.md`
  and tell the client plainly rather than getting stuck on an install step for a tool they
  don't need for anything else.
- Both CRM apply scripts and `emit-status.mjs` are dependency-free (`node:fs` + global
  `fetch` only) — there's no `npm install` step to walk anyone through.
