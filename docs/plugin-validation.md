# Manual validation of the Orion plugin install

A short checklist for checking by hand that a fresh install works in each target tool. It
belongs to this release repository only and is not copied into client harnesses.

The automated tests use stubbed `codex` and `claude` programs. They show that Orion
prepares the files and runs the expected commands. They do not show that a real client
installs or discovers the plugin. **Native compatibility is unverified until this checklist
has been run and its results recorded.** No minimum client version is promised. A pass on
one Codex surface does not validate the other.

Run it separately for each surface:

- Codex desktop app (the Plugins Directory)
- Codex CLI (`/plugins`)
- Claude Code (local scope)

Use a disposable harness folder and a throwaway business. Do not run sales skills against
real accounts.

## 1. Record the environment

| Field | Value |
| --- | --- |
| Date | |
| Client name | Codex or Claude Code |
| Surface | Codex desktop, Codex CLI, or Claude Code (CLI, desktop Code tab or IDE) |
| Exact client version | `codex --version` or `claude --version`; for the desktop app, its About screen |
| Program Orion used | the path in the install report's "checked with ..." line |
| OS and Node.js | `node --version` |
| Orion release | `template_version` in the new folder's `status/status.json` |

If `claude` or `codex` is not on `PATH`, set `ORION_CLAUDE_BIN` or `ORION_CODEX_BIN` to
the program file before installing. Record which one you used.

## 2. Fresh install

From a release checkout, install into a new empty folder:

```sh
node install.mjs --tool codex --target /path/to/orion-check-codex
# or
node install.mjs --tool claude-code --target /path/to/orion-check-claude
```

Record the full plugin report the installer prints (the lines after
`Created ... client repository`). It names one state: `pending`, `failed`, `registered`
or `complete`. It also prints a `Next for the plugin:` step when one is owed.

Then complete that tool's native steps and record each one:

**Claude Code.** The installer runs `claude plugin validate`, then
`claude plugin marketplace add <folder> --scope local` and
`claude plugin install orion@<catalog> --scope local`. Here `<catalog>` is `orion-`
plus 12 hex digits, also found in `.claude-plugin/marketplace.json`.

- If the report says to install or enable, run exactly the printed command from the
  folder. It is one of these:
  - `claude plugin install orion@<catalog> --scope local`
  - `claude plugin enable orion@<catalog> --scope local`
- Open the folder in Claude Code and accept the workspace trust prompt.
- Start a fresh session in the folder, or run `/reload-plugins`.

**Codex.** The installer does not run `codex plugin marketplace add` (it writes the
user-wide config). It writes this folder's own `.codex/config.toml` with
`[marketplaces."orion-<12 hex>"]` (this folder) and `[plugins."orion@orion-<12 hex>"]`
`enabled = true`, then checks with `codex plugin marketplace list --json` from the folder.
Codex has no established unattended install, so the report stays `pending`:

- If it says the folder must be trusted, open the folder in Codex and accept the trust
  prompt, then run `node update/plugin-setup.mjs resume`. Record whether Codex asked.
- From the folder, open the Plugins Directory (desktop) or type `/plugins` (CLI).
- Search for "orion" and install Orion.
- Start a fresh chat in the folder. Restart the desktop app if the catalog does not appear.
- Record whether Codex's install wrote `[plugins."orion@orion-<12 hex>"]` into
  `~/.codex/config.toml`. If it did, Orion reports `enabled_user_wide` and stays pending
  until that entry is removed: record this, since it decides whether project-only
  enablement works on this surface.

Then, from the folder, run:

```sh
node update/plugin-setup.mjs resume
```

Expect `registered`. Record the output if it says anything else.

## 3. Native inventory

From the harness folder, confirm `orion` is listed with the intended scope, source and
release version. Record the output.

- **Claude Code:** run `claude plugin list --json`. Expect id `orion@orion-<12 hex>`,
  `scope: "local"`, `enabled: true`, no `errors`, a `projectPath` of this folder, and a
  `readFromFolder` of this folder's `plugins/orion`. The version must equal
  `template_version`. Also run `claude plugin details orion@orion-<12 hex>` and record
  the full `Component inventory`: Orion reads its `Skills (N)  a, b, ...` line and
  requires N, and the names when listed, to match `plugins/orion/skills/`. Record the
  exact layout of that line, since Orion's parsing of it is unverified.
- **Codex:** run `codex plugin list --json` and `codex plugin marketplace list --json`.
  Expect `orion` from `orion-<12 hex>`, enabled. Its version may read `local`: Orion then
  reads the version from the cached copy's manifest, under
  `~/.codex/plugins/cache/orion-<12 hex>/orion/local/` (`plugin.json`), and checks that its
  `skills/` folder holds every shipped skill. Record the listed version and the cache
  path you actually find. The marketplace root must be this folder.

## 4. Discovery and a harmless invocation

In a fresh session in the harness folder:

1. Ask the assistant which Orion skills it has. It should list all 15 skills in
   `plugins/orion/skills/`. Record any that are missing.
2. Invoke one harmless skill: `update-harness`, asking only "what version is my harness
   on?" In Claude Code, call it as `/orion:update-harness`. Confirm it reports this
   folder's `template_version`, which shows the skill resolves the active harness rather
   than its own package location.
3. Have the assistant confirm discovery:

   ```sh
   node update/plugin-setup.mjs verify --discovered
   ```

   Expect `Orion plugin setup complete`. Then run `node update/plugin-setup.mjs status`
   and record the output.

## 5. Errors and activation outside the harness

- Record every error, warning or unexpected prompt, with the exact text.
- Open a different folder, one that is not an Orion harness, in the same tool. Record
  whether the Orion skills appear there.
  - Claude Code should not show them, because Orion is installed at local scope.
  - Codex should not show them: the catalog and enablement live in this folder's
    `.codex/config.toml`. Whether Codex's own install also enables Orion user-wide is
    unverified. Record exactly what you see.
- Check that `~/.claude/settings.json` or `~/.codex/config.toml` gained no global
  Orion enablement you did not expect. Copy only the Orion lines.

## 6. Broader checks (optional, disposable fixtures only)

Run these only in disposable harness folders.

- **Update:** use `node update/apply.mjs update` from a newer release checkout, per
  `docs/updating.md`. Confirm the report says `active: false` until the fresh-session
  step and `verify --discovered` are done. For Codex, confirm the reinstall step moves
  the cached copy's manifest version. If a later `verify` fails, confirm its next step
  names `node update/apply.mjs restore --root . --backup <the update's backup>`.
- **Restore:** use `node update/apply.mjs restore` with the reported backup.
- **Tool switch:** run `node switch_ai.mjs` from the harness root (`--to <other tool>`
  to name it). Confirm the target shows Orion's full skill inventory before the switch
  commits, that a switch to Codex waits (`pending_switch`) until the Plugins Directory
  install and finishes on a second run, that `--to <current tool>` cancels a waiting
  switch, that the previous tool's Orion (and then its catalog) is removed only after the
  commit, and that other plugins are untouched.

## Reporting

Save one result per surface, with the fields from step 1, pass or fail for steps 2 to 5,
and the recorded outputs. Until a surface has a passing result, describe it as
unverified.
