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

## Scheduled work: how a hired agent's schedule fires here

A hired agent can work on a schedule with nobody watching (`library/HIRING.md`, step 6,
"Wire the schedule"). Two ways, in this order:

- **The Codex app's automations (rung A).** When the client works in the Codex app,
  create an automation there with the shift prompt HIRING.md gives you and the
  schedule from the job sheet. Nothing else to install. An automation runs under
  the same sandbox as a session, so make the one-time `~/.codex/config.toml` fix
  above first, or its report cannot reach the radio.
- **The computer's own scheduler (rung B)**, when there is only the command line.
  `node status/schedule.mjs wire` writes the wake-up. What it starts is:

```
codex exec --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true "{prompt}"
```

- `codex exec` is the form of Codex that runs without a person.
- `--skip-git-repo-check` lets it run in a folder that was downloaded, not cloned.
- **`network_access=true` is not optional.** The sandbox blocks the network unless
  told otherwise. Without it the shift still does its work and writes its line to
  `status/shift-log.md`, but its report cannot reach the radio, so "(radio
  unreachable)" lands under the line and Daily Practice never hears the shift ran.
  Setting it on the command line works even if the config fix was never made.
- An old Codex command can be refused by the service ("requires a newer version of
  Codex"). The wake-up then starts and stops at once. Update Codex, and step 7's
  wake-up check will show it working.

The one source for the command is `unattendedRunner('codex')` in `status/shapes.mjs`.

## Known quirks

- Codex reads `AGENTS.md` natively at session start — that is why this repository's
  instructions file carries that name. No pasting needed; the wizard's handoff prompt is
  enough.
- Approval modes vary by session. A session someone started in a restricted mode can
  have the sandbox fix in place and still need a one-time approval for the first network
  call — that is the retry-once case above, not a defect.
- Everything outbound still stages for the client's yes. A code-capable surface makes it
  easier to automate past that gate; don't. Same rule as `claude-code.md`.
