# Adapter — Codex

Surface mechanics only. Behaviour is in [AGENTS.md](../../AGENTS.md); install, pairing
and recovery are in [agent/install.md](../install.md). What
[the Claude Code adapter](claude-code.md) says you do directly (status and knowledge-base
edits, CRM apply scripts, Node checks, connector sign-in) applies here too.

## Loading the instructions

Codex reads `AGENTS.md` natively at session start, in the CLI, the IDE extension and the
desktop app. The wizard detects Codex (`codex` on PATH or `~/.codex` present).

## The Orion plugin

Orion's shipped skills come from the `orion` plugin in `plugins/orion/`, offered through
this folder's own catalog (`.agents/plugins/marketplace.json`), which this folder's
`.codex/config.toml` registers and switches on for this folder only. Codex reads that
file only once the client trusts the folder. Codex installs a cached copy: the client
opens the Plugins Directory (desktop app) or `/plugins` (CLI), searches for "orion",
installs it and starts a fresh chat, and repeats that after each update. Codex may need a
restart. Setup counts as done only when Codex lists Orion here and its cached copy holds
this release and every shipped skill. Skills the client creates or adds live in
`.agents/skills/`; updates never touch them.

## Network approval

When the sandbox blocks network access, explain that the connection check needs to reach
Daily Practice, request approval for that command through Codex's permission flow, and
retry. A restricted session may need approval again. On a managed machine, follow its
network policy.

## Scheduling

Use Codex scheduled tasks for recurring work; see [Schedule Orion](../scheduled-work.md).
When a send tool is missing or needs interactive approval, leave the message waiting.

## Waiting for you, on this surface

The truth is `status/waiting.md`, rewritten by every run. Keep one thread the client names
once and append to it with `codex exec resume <name>`.
