# Reinstall Orion 2.0.0 over a 1.x harness

Orion 2.0.0 is a reinstall release: a 1.x folder is not updated in place. Install 2.0.0
into a new folder, bring the client's business files across, and pair the new folder.
The 1.x folder stays untouched until the client chooses to delete it.

Say this to the client first, in one plain sentence: the new version is installed fresh
next to the old one, their business answers and their own skills come with it, and they
will pair it with a new one-time code.

## 1. Deliver what the old folder still owes

When the 1.x folder has `status/guard.mjs`, run `node status/guard.mjs check --quiet`
there once. It delivers any
finished work still queued in `status/radio-outbox.json`. That queue belongs to the old
folder's pairing: never copy it. If the check cannot deliver, say so to the client and
carry on; the old folder keeps the queue.

## 2. Install fresh

From a fresh copy of the 2.0.0 release, install into a **new, empty** folder with the AI
tool the client uses:

```sh
node install.mjs --tool claude-code --target /path/to/new-orion
# or
node install.mjs --tool codex --target /path/to/new-orion
```

The installer refuses a folder that already holds an Orion 1.x harness, or any files.

## 3. Copy the client's files

From the 1.x folder into the new one, copy, at the same paths:

- `agent/knowledge-base/01-*.md` through `07-*.md`: the client's business, in their words.
- `status/no-contact.md`: the people and domains the client never wants contacted. Copy
  it whenever it exists; without it, Orion could message someone who asked not to hear
  from them.
- `status/send-log.md`, `status/work-log.md` and `status/shift-log.md`: the client's own
  history, when they exist.
- The client's own skills: `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex).
  Leave out any skill whose name matches one shipped in `plugins/orion/skills/`.
- A hired team in `.claude/agents/`: copy it to `legacy/claude-agents/` in the new folder,
  for reference. 2.0.0 does not load it.

Copy nothing else. In particular, never copy `status/status.json`,
`status/radio-outbox.json`, `sharing.install_token` or `status/radio.key`: the new folder
gets its own key when it pairs.

## 4. Pair and resume

In the new folder, run `node start.mjs` and pair with a new one-time code (see
[Install Orion](install.md#pair-orion)). The install starts again at `ops_stage: booked`;
the installer reads the copied knowledge base and asks only what it leaves unanswered.
Re-create any scheduled tasks against the new folder, following
[Schedule Orion](scheduled-work.md), and switch off the old folder's schedules.
