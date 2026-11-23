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

Read the pinned `agent/updating.md` and follow its apply instructions. If the
source version is older than the installed version, report both versions and
stop. If the fetch fails in Codex, see the [network instructions](adapters/codex.md).

## Orion 1.x: reinstall instead

This procedure updates 2.0.0 and later. When the deployed `template_version` is below
2.0.0, or status has no recorded AI assistant, do not apply anything: tell the client
that 2.0.0 is installed fresh, then follow
[reinstall-from-1.x.md](reinstall-from-1.x.md) from the pinned source
(`$scratch/source/agent/reinstall-from-1.x.md`). Remove the temporary checkout afterwards.

## Apply the pinned update

Use the pinned source's file helper to apply its manifest and fingerprints
to the AI assistant recorded in the deployed status file.

```sh
node "$scratch/source/update/apply.mjs" update --root "$harness" --commit "$commit"
```

The helper excludes human-only implementation records from its source snapshot
and rejects deployment paths into them. Agents use `agent/` for update guidance.

The helper uses the deployment allowlist for your AI assistant. It decides what is Orion's
from the folder's installed-file receipt, `status/installed-files.json`, which records the
exact files Orion installed:

- A file still as installed is updated (line endings aside); a removed one comes back.
- A file the client has changed is kept byte for byte and listed under `kept`; it keeps
  its installed baseline, so the next update still recognises the change.
- A file Orion never installed is kept and listed under `unknown`; its bytes are never
  adopted as Orion's.
- A changed or unknown runtime file (the `.mjs` scripts, `update/`, the status template)
  or plugin file that the update would replace stops the update before any file changes:
  the report says `"state": "conflict"`, lists `conflicts` (path and `modified`,
  `unknown` or `not-a-file`) and gives the `remaining_action`. Read those paths out, ask
  the client to move their changes out, then rerun the same pinned update.
- A receipt that cannot be read, is malformed or has an unsupported version stops the
  update before any change; never delete it to get past that.

A folder installed before receipts has none, and the update migrates it, from any older
release straight to the pinned one (no intermediate release is needed, because the
incoming release's own helper runs). A file whose bytes match a version Orion shipped,
by the frozen fingerprints in `update/pristine.json`, counts as installed; anything else
counts as unknown, with the same rules as above, so an unknown runtime or plugin file
stops the update and an unknown ordinary file is kept and listed. The receipt the update
writes holds only recognised files and files it installed. The helper backs up replaced and
retired files and the receipt, retires listed files that are still as installed, checks
the incoming scripts, and records the version and the new receipt after applying the
update. On the same version it reports an up-to-date result when there is no work.

### The Orion plugin in an update

The shipped package `plugins/orion/` is release-managed and replaced as a unit. An edited
or added file in it stops the update first (above). The helper copies the complete
previous package into the backup (`<backup>/package/plugins/orion/`). Customizations belong in client skills under `.claude/skills/`
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
`node update/apply.mjs recover --root .`. Recovery restores only what the update wrote,
and puts the receipt back as it was (or removes it, for a folder that had none), so a retry
never trusts a replacement that did not finish. The next update also recovers first.
If a path changed since, it stops, overwrites nothing and names the paths and the step to take.

Updates never start or renew the connection allowance. Before resuming Orion work, run
`node status/guard.mjs check --quiet` (see [Install Orion](install.md#before-work)).
Report the version, changed files, preserved edits,
any replaced edited runtime scripts and the backup path. Remove the temporary
source checkout after the operation.

## Switch AI assistants

Switching is local and needs no release clone: from the Orion folder root, run

```sh
node switch_ai.mjs
```

It switches to the other assistant; add `--to claude-code` or `--to codex` to name one.
It reuses the same package, version and catalog identity. It writes the target tool's
catalog and sets Orion up with that tool first. Only when the target tool's own
inspection shows the same discovery evidence as plugin setup (see
[Finish the Orion plugin](install.md#finish-the-orion-plugin): every shipped skill at this
version, enabled for this folder only) does it move client skills to the new skill
folder and record the new selection. After that commit it removes Orion from the
previous tool, and then that tool's catalog, so a failure before the commit leaves the
previous tool exactly as it was. For Codex, removing Orion means `codex plugin remove`
and deleting Orion's two tables from `.codex/config.toml`. Other plugins, caches and
settings of either tool are left alone.
If the target still needs a step (Codex's native install, a missing app), the switch is
pending: `ai_assistant` keeps the current tool and `plugin.pending_switch` records the
target and the remaining step. Do that step, then run `node switch_ai.mjs` again to
finish. To cancel it, run `node switch_ai.mjs --to <the current tool>`. If the target's
setup fails, nothing is switched (exit 3) and the current tool keeps its Orion setup.
Review your scheduled tasks in the app that owns them before switching. The switch
reports its backup of the old skills and status. To switch back, run it again.

## Restore

Use the backup path printed by update:

```sh
node update/apply.mjs restore --root . --backup .update-backup/VERSION-TIMESTAMP
```

For an update, restore puts prior released files back and removes newly installed
files. A file changed after update, or a file written where the update retired one, is
kept and reported. The receipt follows: restored files take back their earlier
baselines, kept files keep the update's, so the next update still recognises the edit
as the client's; files no longer there are no longer claimed. It restores the prior
version and retired checklist keys without replacing the client's live status
wholesale. It also puts back the previous plugin package, catalog and this folder's
own registration entries, leaving other settings as they are now. If the package
changed after the update, restore stops before changing anything and says how to keep
those edits. After a restore, the report says `reload_required`: start a fresh session,
and confirm discovery with `node update/plugin-setup.mjs verify --discovered` before
telling the client the previous version is running again. Keep the backup for audit.

## Maintainers

`update/pristine.json` is frozen compatibility data for harnesses installed before
installed-file receipts. Never regenerate it from Git history or add the bytes of a
release edit to it; `node update/release-contract.mjs` validates its structure.

### Tool-specific metadata

Fresh installations carry only their selected tool's plugin manifest. Updates preserve
that layout; existing packages carrying both manifests keep both. No migration or
retroactive cleanup runs.

`node switch_ai.mjs` generates the target manifest locally from the installed release
version, using the shipped generator; no release download is needed. While native setup
is pending, the current manifest and selected tool stay in place. Cancellation or failure
restores the target metadata's prior contents or absence. On success, the previous tool
is retired and its manifest and catalog are removed. Client-owned skills move to the
selected tool's skill folder; business state, release version and catalog identity stay.
The switch backup includes manifests and the prior target metadata journal.

Before replacing files, the updater probes write access to its destinations, including
Codex's `.agents` catalog and `.codex` project configuration. A `preflight_failed`
result lists all access failures; allow those paths and rerun the pinned update.
Probes are temporary and removed before release files are replaced. Permissions can
still change after a probe; transaction recovery remains in place for write failures.

If plugin setup throws after files were committed, the result reports
`files_applied: true`, `activation_pending: true`, and the backup path. The file
journal remains complete so that backup can still be restored. Resume plugin setup
with `node update/plugin-setup.mjs resume` after fixing access. Repeating the update
reports `files_up_to_date: true` with activation pending and the same backup, rather
than claiming the whole update is up to date.
