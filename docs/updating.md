# Updating Orion

Say **"update my harness"** inside your deployed Orion folder. The request is the consent.
Orion updates from Daily Practice's current `main` commit. The version is
`template_version` in the deployed folder's `status/status.json`.
For a version inquiry, report that value. To check whether it is current, compare it
with the pinned manifest without applying an update. Updates work with the radio off.

## Pin main

From the deployed folder, clone the official `main` into a temporary directory.
Read its full commit and the manifest at that commit.

```sh
harness="$PWD"
scratch=$(mktemp -d)
git clone --quiet --depth 1 --branch main https://github.com/DailyPractice-Ltd/orion-self-install.git "$scratch/source"
commit=$(git -C "$scratch/source" rev-parse HEAD)
git -C "$scratch/source" show "$commit:update/manifest.json"
```

Read the pinned `docs/updating.md` and follow its apply instructions. If the
source version is older than the installed version, report both versions and
stop. If the fetch fails in Codex, see the [network instructions](../agent/adapters/codex.md).
Use [the migration procedure](#older-same-path-folders) for a separate deployed layout
if status has no recorded AI assistant.

## Apply the pinned update

Use the pinned source's file helper to apply its manifest and fingerprints
to the AI assistant recorded in the deployed status file.

```sh
node "$scratch/source/update/apply.mjs" update --root "$harness" --commit "$commit"
```

The helper excludes human-only implementation records from its source snapshot
and rejects deployment paths into them. Agents use `docs/` for update guidance.

The helper uses the deployment allowlist for your AI assistant. A file the client has changed is kept
and reported. The runtime scripts under `status/` are refreshed together, and
`update/pristine.json` is refreshed with the source fingerprints. The helper backs up
replaced and retired files, retires listed files that match shipped fingerprints,
checks the incoming scripts and records the version after applying the update.
On the same version it reports an up-to-date result when there is no work.

### The Orion plugin in an update

The shipped package `plugins/orion/` is release-managed and replaced as a unit. The
helper first copies the complete previous package, in-place edits included, into the
backup (`<backup>/package/plugins/orion/`) and lists edited files under
`package.edits_backed_up`. Customizations belong in client skills under `.claude/skills/`
or `.agents/skills/`, which the update never touches. It also backs up the selected
tool's catalog (`.claude-plugin/marketplace.json` or `.agents/plugins/marketplace.json`),
which keeps the same catalog identity, and this folder's own registration entries for
that tool (`<backup>/registration.json`): Orion's two keys in
`.claude/settings.local.json`, or Orion's two tables in `.codex/config.toml`. Nothing
else in those files is recorded or put back. It then refreshes the selected tool with
`node update/plugin-setup.mjs resume` logic:

- **Failed** (a check or native command failed): the previous package, catalog,
  registration entries, files and version are put back, the report says
  `"state": "rolled_back"` and the helper
  exits 3. Recovery is not claimed until a fresh session confirms it: follow the
  report's `remaining_action`.
- **Pending or registered**: the files are at the new release, but the update is not
  active yet. `status.json` keeps the last confirmed release in `plugin.verified_version`
  and the target in `plugin.pending_version`; the report says `"active": false` with
  the exact remaining step. Do not tell the client the new version is active. Claude Code
  loads the package in place, so a fresh session (or `/reload-plugins`) picks it up.
  Codex loads a cached copy, so reinstall Orion from its Plugins Directory or `/plugins`,
  then start a fresh chat. Then run `node update/plugin-setup.mjs verify --discovered`;
  that clears `pending_version`. Until then `plugin.update_backup` names the update's
  backup: if a later `resume` or `verify` fails, `remaining_action` gives the exact
  restore command that puts the previous release back.

Marketplace auto-updates never replace the pinned release: the Claude Code catalog is a
local folder read in place, and Orion never runs `codex plugin marketplace upgrade`.

An interrupted update is rolled back from its journal with
`node update/apply.mjs recover --root .`. Recovery restores only what the update wrote.
If a path changed since, it stops, overwrites nothing and names the paths and the step to take.

When upgrading a harness that predates the 1.5.0 sending rule, run
`node status/send.mjs migrate` as described in [AGENTS.md](../AGENTS.md).
Updates never start or renew a connection allowance. All unpaired folders must
pair before normal work. Older pairing markers upgrade to version 2 without
inferring last_connected_at from verification or migration dates. A successful
verification and complete report delivery establish the silent 48-hour allowance.
Before resuming Orion work, run `node status/guard.mjs check --quiet`; exit 2
keeps work paused while diagnosis, updating and re-pairing remain available. Then
check support messages separately with `node status/radio.mjs check`. Report the version, changed files, preserved edits,
any replaced edited runtime scripts and the backup path. Remove the temporary
source checkout after the operation.

## Switch AI assistants

Use the pinned source with `switch` as the operation:

```sh
(
  set -eu
  cd /path/to/my-orion
  release_tmp=$(mktemp -d)
  trap 'rm -rf "$release_tmp"' EXIT
  git clone --quiet --depth 1 --branch main https://github.com/DailyPractice-Ltd/orion-self-install.git "$release_tmp/release"
  release_commit=$(git -C "$release_tmp/release" rev-parse HEAD)
  node "$release_tmp/release/update/apply.mjs" switch --root "$PWD" --release-repo "$release_tmp/release" --commit "$release_commit" --to codex
)
```

Use `--to claude-code` to move the other way. For an older Claude harness with no recorded
AI assistant, add `--legacy-tool claude-code` to migrate it explicitly. The switch
requires the harness version, manifest, and common runtime scripts to match the pinned
release. Run the pinned update command above first if it reports an older version.
The switch reuses the same package, version and catalog identity. It writes the target
tool's catalog and sets Orion up with that tool first. Only when the target tool's own
inspection shows the same discovery evidence as plugin setup (see
[Finish the Orion plugin](setup.md#finish-the-orion-plugin): every shipped skill at this
version, enabled for this folder only) does it move client skills to the new skill
folder and record the new selection. After that commit it removes Orion from the
previous tool, and then that tool's catalog, so a failure before the commit leaves the
previous tool exactly as it was. For Codex, removing Orion means `codex plugin remove`
and deleting Orion's two tables from `.codex/config.toml`. Other plugins, caches and settings of either tool are left alone.
If the target still needs a step (Codex's native install, a missing app), the switch is
pending: `ai_assistant` keeps the current tool, `plugin.pending_switch` records the target,
its backup and the remaining step. Do that step, then run the same switch command again
to finish. To cancel it, restore its backup. If the target's setup fails, the switch is
rolled back (exit 3) and the current tool keeps its Orion setup. Review your scheduled tasks in the app that owns them before switching. The switch reports
its backup. If interrupted, run the pinned release script with `recover --root "$PWD"`
before trying again. The temporary checkout is removed automatically.

## Restore

Use the backup path printed by update or switch:

```sh
node update/apply.mjs restore --root . --backup .update-backup/VERSION-TIMESTAMP
```

For an update, restore puts prior released files back and removes newly installed
files. A file changed after update is kept and reported. It restores the prior
version and retired checklist keys without replacing the client's live status
wholesale. It also puts back the previous plugin package, catalog and this folder's
own registration entries, leaving other settings as they are now. If the package
changed after the update, restore stops before changing anything and says how to keep
those edits. After a restore, the report says `reload_required`: start a fresh session,
and confirm discovery with `node update/plugin-setup.mjs verify --discovered` before
telling the client the previous version is running again. A completed switch can also
be restored from its reported backup; any new-layout edits that conflict must be handled
first. Then run `node update/plugin-setup.mjs resume` to register Orion with the restored
tool again. Keep the backup for audit.

## Older same-path folders

Older folders that used the release checkout as their business folder must first be
migrated into a separate deployed repository for an explicitly chosen AI assistant. From a
fresh release checkout, run:

```sh
node install.mjs --tool claude-code --target /path/to/new-client-folder \
  --migrate-from /path/to/legacy-checkout --github-repo OWNER/PRIVATE-REPO
```

Use `--tool codex` only when the legacy status already records Codex. The migration
copies the client's status and logs, knowledge, skills, roster and job sheets,
as well as other client-created files such as notes and playbooks, then overlays edited
deployed files. Release-only source trees, maintainer files, and retired workflows stay
behind. Computer schedules refer to the original folder. Review them there before
replacing them in the native scheduler. The new
private repository becomes the home, while `--local-only` leaves home disabled. The legacy
checkout is left intact. The command creates and pushes a private GitHub repository;
`--remote https://github.com/OWNER/PRIVATE-REPO.git` uses an existing private
repository, verified through `gh`. With no GitHub option, installation creates a local Git repository; `--local-only` is the explicit equivalent. A private remote can be connected later with `node status/home.mjs prepare --remote <address> --yes`.

The manifest's legacy `refresh` list remains for old same-path updaters, but no longer
lists the three `.claude/skills/` source files removed from the release. An older
same-path updater can still refresh the other listed files; it will leave those
three installed skills as they are. To receive current skill definitions, migrate
the harness into a separate client folder with `install.mjs --migrate-from` above,
or follow the pinned update procedure in an already deployed folder. It installs
the `orion` plugin package at `plugins/orion/` for either tool and recognizes
historical Claude copies by fingerprint. `deployment` is the contract for separate client folders.
Maintainers run
`node tests/helpers/pristine.mjs --write` after release edits and before tagging.
