# Reinstall Orion 2.0.0 over a 1.x harness

Orion 2.0.0 is a reinstall release: a 1.x folder is not updated in place. Install 2.0.0
into a new folder, bring the client's business files across, and pair the new folder.
The 1.x folder stays untouched until the client chooses to delete it.

Say this to the client first, in one plain sentence: the new version is installed fresh
next to the old one, their business answers and their own skills come with it, and they
will pair it with a new one-time code.

## 1. Install fresh

From a fresh copy of the 2.0.0 release, install into a **new, empty** folder with the AI
tool the client uses:

```sh
node install.mjs --tool claude-code --target /path/to/new-orion
# or
node install.mjs --tool codex --target /path/to/new-orion
```

The installer refuses a folder that already holds an Orion 1.x harness, or any files.

## 2. Copy the client's files

From the 1.x folder into the new one, copy:

- `agent/knowledge-base/01-*.md` through `07-*.md`: the client's business, in their words.
- The client's own skills: `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex).
  Leave out any skill whose name matches one shipped in `plugins/orion/skills/`.

Copy nothing else. In particular, never copy `status/status.json`, `sharing.install_token`
or `status/radio.key`: the new folder gets its own key when it pairs.

## 3. Pair and resume

In the new folder, run `node start.mjs` and pair with a new one-time code (see
[Install Orion](install.md#pair-orion)). The install starts again at `ops_stage: booked`;
the installer reads the copied knowledge base and asks only what it leaves unanswered.
Re-create any scheduled tasks against the new folder, following
[Schedule Orion](scheduled-work.md), and switch off the old folder's schedules.
