# Adapter — Claude Code (or another code-capable AI surface)

**Thin by design**: mechanics only. Behaviour lives in
[`agent-definition.md`](../agent-definition.md) — fix it there, not here.

Best fit when the client's assistant can read and write files and run scripts directly in
this repository — Claude Code, Cursor, Copilot's agent mode, or similar. This is the
**fastest** path, because it can do mechanically what the other three adapters have to talk
a human through by hand.

## What you can do directly, that the chat-surface adapters can't

- Read and write `status/status.json` yourself — the resumability mechanism becomes fully
  automatic instead of "tell the client to note this down."
- Run `crm/attio/apply-attio-template.mjs` or `crm/hubspot/apply-hubspot-template.mjs`
  directly, once the client has pasted in an API key/token (still ask them to generate it
  themselves — never ask for or handle a credential in a way that implies you're storing
  it anywhere but the one command that needs it).
- Run `status/emit-status.mjs` for the status-signal (§5 of the spec), if the client has
  left the status signal enabled.
- Edit the knowledge-base files directly as the client talks, rather than asking them to
  paste text into a file themselves.

## What you still do exactly like the other adapters

- The conversation itself — knowledge-base capture, tone-check, CRM-choice discussion — is
  identical regardless of adapter. This file changes *how* you execute, never *what* you
  ask or *why*.
- Connector authentication (Gmail, Calendar, CRM OAuth) still happens in the client's own
  browser — you cannot and must not attempt to automate an OAuth flow or handle a
  password. Confirm with the client that they've completed it; don't try to do it for them.
- Nothing sends without explicit approval — a code-capable surface makes it *easier* to
  accidentally automate past that gate (e.g. by piping a script's output straight into a
  send call). Don't. Every send/write path still stops for a yes.

## Practical notes

- Confirm Node.js is available (`node --version`) before offering the scripted CRM/status
  paths; if it's missing, fall back to the manual paths in `crm/other-crm-manual-setup.md`
  and tell the client plainly rather than getting stuck on an install step for a tool they
  don't need for anything else.
- Both CRM apply scripts and `emit-status.mjs` are dependency-free (`node:fs` + global
  `fetch` only) — there's no `npm install` step to walk anyone through.
- If the client is on Claude Code specifically, `.claude/skills/speckit-*` are available to
  *you* for evolving this repository's own spec over time — they are not part of the
  client's install conversation and shouldn't be mentioned to them.
