# Adapter — Claude Code (or another code-capable AI surface)

**Thin by design**: mechanics only. Behaviour lives in
[`agent-definition.md`](../agent-definition.md) — fix it there, not here.

Best fit when the client's assistant can read and write files and run scripts directly in
this repository — Claude Code, Cursor, Copilot's agent mode, or similar (Codex has its
own thin adapter, `codex.md`, for its sandbox specifics). This is the
**fastest** path, because it can do mechanically what the other three adapters have to talk
a human through by hand.

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

## Scheduled work: how a hired agent's schedule fires here

A hired agent can work on a schedule with nobody watching (`library/HIRING.md`, step 6,
"Wire the schedule"). Claude Code can use its own scheduled tasks (rung A) or the
computer's own scheduler (rung B). For rung B, `node status/schedule.mjs wire` writes
the wake-up and `node status/schedule.mjs on` switches it on. What it starts is:

```
claude -p "{prompt}" --permission-mode dontAsk --allowedTools "{the job sheet's tools, plus the report's}"
```

- The prompt comes straight after `-p`. `--allowedTools` takes every word after it as
  a tool name, so a prompt placed last is swallowed and the run stops.
- `--permission-mode dontAsk` with the job sheet's own `tools:` line means the agent
  may use what the client approved at hire and is refused anything else without a
  question. Nobody is there to answer one. The script adds what every report needs
  when the job sheet does not already cover it: `Read`, `echo`, and running
  `status/done.mjs`, `status/memory.mjs` and `status/radio.mjs`. Writing a file
  stays refused unless the job sheet allows it.

The one source for this command is `unattendedRunner('claude-code')` in
`status/shapes.mjs`.

Cursor and Copilot's agent mode use this adapter in a session, but neither can be
started with nobody watching. Do not wire a schedule there. The agent is hired and
works when asked, and its schedule reads "not yet wired" (HIRING.md, Part D).

## What you still do exactly like the other adapters

- The conversation itself — knowledge-base capture, tone-check, CRM-choice discussion — is
  identical regardless of adapter. This file changes *how* you execute, never *what* you
  ask or *why*.
- Connector authentication (Gmail, Calendar, CRM OAuth) still happens in the client's own
  browser — you cannot and must not attempt to automate an OAuth flow or handle a
  password. Confirm with the client that they've completed it; don't try to do it for them.
- Sending follows the risk level, and here the allowlist is a real tool boundary: a
  scheduled shift is given the send tools on its job sheet only while the level allows
  (`status/schedule.mjs`), and in a session rule 1 of the agent definition is the gate.
  Never pipe anything into a send tool without the score line that allows it.

## Sending, on this surface (verified 4 November 2026)

- **Headless Claude Code is the proven route.** With a claude.ai login, `claude -p` under
  `--permission-mode dontAsk` loads the hosted Gmail connector's send, reply and forward
  tools and the Slack connector's send tool, and runs a connector tool only when its full
  name is on `--allowedTools`. The real names carry a `claude_ai` prefix:
  `mcp__claude_ai_Gmail__send_message`, `mcp__claude_ai_Gmail__reply`,
  `mcp__claude_ai_Gmail__forward`, `mcp__claude_ai_Slack__slack_send_message`. Put the
  one the job needs on the job sheet's `tools:` line by that name; `status/schedule.mjs`
  passes it through only while the send level allows.
- **Connectors load only on a claude.ai subscription login**, never on an API key. The
  runner never passes `--bare`: bare mode drops every connector, so if a future Claude
  Code makes it the default for `-p`, the runner must pass the opposite flag
  (`unattendedRunner` in `status/shapes.mjs`, pinned by test).
- **Team and Enterprise plans**: an organisation "needs approval" setting on a connector
  prompts every call and is denied under dontAsk, so the message waits with that reason;
  "blocked" removes the tool. Microsoft 365 send tools always ask on those plans.
- **A Claude desktop scheduled task** (rung A) gets the connector in its session; allow
  the send tool once in that task's "always allowed" panel, or the run stalls rather than
  denies.
- **The trust model.** In a session the gate is rule 1 of the agent definition plus
  `status/send.mjs`, the same trust CRM writes rely on. On a scheduled shift the
  allowlist adds a real tool boundary. There is no tool-boundary hook in 1.5.0; a send
  with no score line in `status/send-log.md` is a breach, and the log shows it. A job
  sheet with bare `Bash` can already send anything from the shell; `set-level` warns.

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
