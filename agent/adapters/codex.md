# Adapter — Codex (OpenAI's coding agent)

**Thin by design**: mechanics only. Behaviour lives in
[`agent-definition.md`](../agent-definition.md) — fix it there, not here. Everything
[`claude-code.md`](claude-code.md) says about a code-capable surface applies here too —
reading and writing `status/status.json`, running the CRM apply scripts, editing the
knowledge base live, and reporting finished work over the radio. This file adds
only what is Codex-specific. Work is reported from the code-capable adapters (this
file and `claude-code.md`), because they are the surfaces that can run scripts.

Best fit when the client works in Codex — the CLI in a terminal, the IDE extension, or
the desktop app. The wizard detects it (`codex` on PATH or `~/.codex` present) and hands
off to exactly the same prompt as Claude Code.

In a deployed Codex folder, installed skills live in `.agents/skills/`. `AGENTS.md` is the shared instruction file.

## Pairing and network access

Follow [setup and recovery](../../docs/setup.md). This deployed Codex folder must
run `node status/guard.mjs check --quiet` before each interactive or scheduled task.
Exit 0 permits work, including a displayed existing-user grace reminder; exit 2
pauses work and gives the next recovery action. Check support messages separately
with `node status/radio.mjs check` after allowance.

If the sandbox blocks network access, explain that the required connection check
needs to reach Daily Practice, request approval for that command through the
current tool's permission flow, then retry it. A restricted session may need
approval again. On a managed machine, follow its network policy; see
[radio recovery](../../docs/radio.md) for corporate network guidance. A successful
`/verify` check and delivery of pending reports, rather than an empty support inbox,
prove readiness to work. Keep setup, diagnosis and updating available while paused.

## Scheduled work

Use Codex scheduled tasks for recurring Orion work. See [Schedule Orion](../../docs/scheduled-work.md).

## Known quirks

- Codex reads `AGENTS.md` natively at session start — that is why this repository's
  instructions file carries that name. No pasting needed; the wizard's handoff prompt is
  enough.
- **Waiting for you, on this surface:** the truth is `status/waiting.md`, rewritten by
  every run. Keep one thread the client names once and append to it with
  `codex exec resume <name>`. Verified 4 November 2026; a Composio route for Gmail is its
  own later research.
- Sending follows rule 1 in the agent definition. The scheduled environment's connector
  permissions also apply. If a send tool is missing or requires interactive approval,
  leave the message waiting for the user.
