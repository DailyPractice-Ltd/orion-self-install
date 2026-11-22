# Adapter — Claude Code

Surface mechanics only. Behaviour is in [AGENTS.md](../../AGENTS.md); install, pairing
and recovery are in [docs/install.md](../../docs/install.md).

## Loading the instructions

Open the installed client folder. The installer does not add a `CLAUDE.md`. Anthropic's
`agents-md` plugin loads `AGENTS.md` when no `CLAUDE.md` is in scope; when this Claude
Code installation does not load it, create a `CLAUDE.md` in the client folder whose only
content is `@AGENTS.md`.

## The Orion plugin

Orion's shipped skills come from the `orion` plugin in `plugins/orion/`, installed for
this folder only (local scope). Invoke one as `/orion:<skill>`, such as
`/orion:update-harness`. Skills the client creates or adds live in `.claude/skills/`;
updates never touch them. Claude Code loads the package in place, so a fresh session (or
`/reload-plugins`) picks up an update.

## What you do directly

- Read and write `status/status.json` and the knowledge-base files as the client talks.
- Run `crm/attio/apply-attio-template.mjs` or `crm/hubspot/apply-hubspot-template.mjs`
  once the client has pasted in a key they generated themselves; use it in that one
  command only.
- Run `status/emit-status.mjs` for the install checkpoint on stage changes.
- Connector sign-in (Gmail, Calendar, CRM OAuth) happens in the client's own browser:
  confirm they completed it, never automate it.
- Check `node --version` before offering scripted paths; when Node.js is missing, help
  install it first. The scripts are dependency-free: no `npm install`.

## Scheduling

Use Claude Routines for recurring work; see [Schedule Orion](../../docs/scheduled-work.md).
A Claude desktop scheduled task sends only once its send tool is allowed in that task's
"always allowed" panel; otherwise the run stalls. When a send tool is missing or needs
interactive approval, leave the message waiting.

## Waiting for you, on this surface

The truth is `status/waiting.md`, rewritten by every run. In the Claude desktop app's
Code tab, keep one local scheduled task named "Waiting for you" per harness, with no
schedule of its own, run by each shift so its newest run is the list; the sidebar's
Scheduled group keeps one row per task that opens the latest run. On the command line,
keep one session with a fixed id in `scopes.waiting_session` in `status/status.json`,
named once with /rename and appended to by each run with `claude -p --resume <id>`.
