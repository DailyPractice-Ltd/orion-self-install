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

In a deployed Codex folder, `AGENTS.md` is the shared instruction file. Orion's shipped
skills come from the `orion` plugin in `plugins/orion/`, offered through this folder's
own catalog (`.agents/plugins/marketplace.json`), which this folder's own
`.codex/config.toml` registers and switches on for this folder only (nothing user-wide).
Codex reads that file only once the client trusts the folder. Codex installs a cached
copy, so the client opens the Plugins Directory (desktop app) or `/plugins` (CLI),
searches for "orion", installs Orion, then starts a fresh chat; after each update they
reinstall it the same way. Setup counts as done only when Codex lists Orion here and its
cached copy holds this release and every shipped skill. Skills the
client creates or adds live in `.agents/skills/`; updates never touch them. If the Orion
skills are missing, read `plugin` in `status/status.json` and follow
[Finish the Orion plugin](../../docs/setup.md#finish-the-orion-plugin).

## Pairing and network access

Follow [setup and recovery](../../docs/setup.md). This deployed Codex folder must
run `node status/guard.mjs check --quiet` before each interactive or scheduled task.
Exit 0 permits work, silently during temporary failures within the 48-hour allowance; exit 2
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


For a task composed of script commands, admit the whole invocation with
`node status/guard.mjs run -- <command> [args]` (for a shell sequence, use
`run -- sh -c '<commands>'`). Nested gated commands use the live parent admission
until that command exits, so authorized actions and reporting can finish after
expiry. The scope stays in that invocation's descendants and ends with its parent;
never save or reuse its environment for another task. For interactive connector
work, run `check --quiet` once at the task boundary and finish the admitted task;
do not add a new mid-task check. Run the guard again for the next task or shift.
