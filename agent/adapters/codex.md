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

## The sandbox — why the radio needs one setting here

Codex runs commands inside a safety sandbox, and by default that sandbox **allows file
edits in this folder but blocks the network**. Good default for safety; it also means
the radio's calls quietly fail: `node status/radio.mjs check`, `… signal` and
`node status/done.mjs` all print "The radio address didn't answer", even though
nothing is wrong with the radio itself.

One plain sentence for the client before the fix, per Article I: *the radio is how your
harness checks in with Daily Practice, and Codex's safety sandbox needs to be told that
this one kind of call is allowed.*

**The fix, once, at install** — add to `~/.codex/config.toml`:

```toml
[sandbox_workspace_write]
network_access = true
```

Then prove it while everyone is watching: run `node status/radio.mjs check` and see
"Radio quiet" (or a real message) instead of "didn't answer". A radio fix that isn't
proven live is the wiring lesson all over again.

**Who makes the edit**: you do, if you can reach `~/.codex/config.toml` — it lives
outside this folder, so the write may need the client's one-time approval; say what you
are changing and why before you touch it. If you can't reach it, read the three lines
out and the client pastes them.

**Order on a first failure**: say the one-liner first, then offer the fix — never the
other way round. The approval-and-retry-once move belongs inside applying the fix
(**if the config can't be changed** — a locked-down machine, a shared config — request
network approval for the radio command once and retry once). If it is still blocked,
AGENTS.md's unreachable rule stands: one plain sentence, never silence, never a retry
loop.

## Scheduled work

Use Codex scheduled tasks for recurring Orion work. See [Schedule Orion](../../docs/scheduled-work.md).

## Known quirks

- Codex reads `AGENTS.md` natively at session start — that is why this repository's
  instructions file carries that name. No pasting needed; the wizard's handoff prompt is
  enough.
- Approval modes vary by session. Diagnose before fixing: if `node status/radio.mjs
  check` prints "This assistant's sandbox is blocking the network", the config fix was
  not applied to this session, so ask for network approval for the radio commands up
  front, before the first one, and run it again. It is not a one-time fix: a session
  started in a restricted mode needs it again.
- **Waiting for you, on this surface:** the truth is `status/waiting.md`, rewritten by
  every run. Keep one thread the client names once and append to it with
  `codex exec resume <name>`. Verified 4 November 2026; a Composio route for Gmail is its
  own later research.
- Sending follows rule 1 in the agent definition. The scheduled environment's connector
  permissions also apply. If a send tool is missing or requires interactive approval,
  leave the message waiting for the user.
