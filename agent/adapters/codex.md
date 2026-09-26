# Adapter — Codex (OpenAI's coding agent)

**Thin by design**: mechanics only. Behaviour lives in
[`agent-definition.md`](../agent-definition.md) — fix it there, not here. Everything
[`claude-code.md`](claude-code.md) says about a code-capable surface applies here too —
reading and writing `status/status.json`, running the CRM apply scripts, editing the
knowledge base live, and firing radio signals at the enumerated moments. This file adds
only what is Codex-specific. Signals happen on the code-capable adapters — this file and
`claude-code.md` — because they are the surfaces that can run scripts.

Best fit when the client works in Codex — the CLI in a terminal, the IDE extension, or
the desktop app. The wizard detects it (`codex` on PATH or `~/.codex` present) and hands
off to exactly the same prompt as Claude Code.

## The sandbox — why the radio needs one setting here

Codex runs commands inside a safety sandbox, and by default that sandbox **allows file
edits in this folder but blocks the network**. Good default for safety; it also means
the radio's calls quietly fail — `node status/radio.mjs check` and `… signal` print
"The radio address didn't answer" even though nothing is wrong with the radio itself.

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

## The unattended shift — how a hired agent's shift fires here

A hired agent runs on a schedule with nobody watching (`library/HIRING.md`, "Wire the
shift"). Codex has no native scheduled-task feature, so use ladder **B** (launchd on
macOS, schtasks on Windows). The command the scheduler runs is:

```
cd {folder} && codex exec --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true "{prompt}"
```

- `codex exec` is Codex's non-interactive form; the scheduler's `cd {folder}` puts it
  in this harness folder (no `-C` needed); `{prompt}` is the surface-neutral shift
  prompt HIRING.md gives you, quoted once for the shell you write for.
- `--skip-git-repo-check` lets it run in a harness folder that was downloaded rather
  than git-cloned.
- **`network_access=true` is not optional here.** The workspace-write sandbox blocks
  the network by default, so without it the shift's `node status/radio.mjs signal`
  call fails silently and Daily Practice never hears that the shift ran. Setting it
  inline with `-c` makes the scheduled task work even if the one-time
  `~/.codex/config.toml` fix above was never made.
- Resolve `codex` to an absolute path (`command -v codex`) when you write the launchd
  or schtasks entry — schedulers run with a bare PATH, so a plain name often fails.

The one source of truth for this command is `unattendedRunner('codex')` in
`status/shapes.mjs`; HIRING.md's ladder reads it from there.

## Known quirks

- Codex reads `AGENTS.md` natively at session start — that is why this repository's
  instructions file carries that name. No pasting needed; the wizard's handoff prompt is
  enough.
- Approval modes vary by session. A session someone started in a restricted mode can
  have the sandbox fix in place and still need a one-time approval for the first network
  call — that is the retry-once case above, not a defect.
- Everything outbound still stages for the client's yes. A code-capable surface makes it
  easier to automate past that gate; don't. Same rule as `claude-code.md`.
