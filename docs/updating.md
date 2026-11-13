# Updating a deployed Orion harness

The request is the consent. Work in the **deployed
client folder**, whose `status/status.json` records `selected_tool` as `claude-code` or
`codex`. The release repository is a separate, temporary source. A client needs only
their deployed folder to begin.

## Update from a pinned release

Run this in the deployed folder. It downloads the current `main` release, resolves its
full commit hash, runs that commit's updater with its manifest and source files, then
removes the temporary checkout. The script and the content it applies come from the
same commit; do not run the older `update/apply.mjs` already in the client folder.

```sh
(
  set -eu
  cd /path/to/my-orion
  release_tmp=$(mktemp -d)
  trap 'rm -rf "$release_tmp"' EXIT
  git clone --quiet --depth 1 https://github.com/DailyPractice-Ltd/orion-self-install.git "$release_tmp/release"
  release_commit=$(git -C "$release_tmp/release" rev-parse HEAD)
  node "$release_tmp/release/update/apply.mjs" update --root "$PWD" --release-repo "$release_tmp/release" --commit "$release_commit"
)
```

If clone or update fails, inspect the error. The temporary checkout is removed on
success or failure. Never fall back to the older local script or an unpinned `main` path.
The update reads `update/manifest.json`, `update/pristine.json`, and all released
files from that one commit. Its `deployment` plan maps portable release sources into
the destination for the tool recorded in status. The current AI app does not choose
the destination. The client folder never receives release-only `skills/`, `agents/`,
tests, specs, Speckit skills, `CLAUDE.md`, or the other tool's runtime tree.

A file the client has changed is kept and reported, as is a collision. The client roster and job sheets
remain client-owned. A retired released file is removed only if it still matches a
historical shipped fingerprint. Before changing files, the updater backs up status
and each file it will replace or retire under `.update-backup/`. Executable
`status/*.mjs` scripts are the narrow exception: they are backed up and replaced as a
version-consistent set even when edited. The updater changes only
`template_version`, one notes line, and named retired checklist keys in status.

When applicable, run `node status/send.mjs migrate` for the older sending-rule
migration. Then run `node status/radio.mjs check`. Report the pinned commit, version
change, refreshed, added, retired, kept and collided files, replaced edited scripts,
radio result, and backup path.

## Switch the selected tool

Use the same pinned release procedure, with `switch` as the operation:

```sh
(
  set -eu
  cd /path/to/my-orion
  release_tmp=$(mktemp -d)
  trap 'rm -rf "$release_tmp"' EXIT
  git clone --quiet --depth 1 https://github.com/DailyPractice-Ltd/orion-self-install.git "$release_tmp/release"
  release_commit=$(git -C "$release_tmp/release" rev-parse HEAD)
  node "$release_tmp/release/update/apply.mjs" switch --root "$PWD" --release-repo "$release_tmp/release" --commit "$release_commit" --to codex
)
```

Use `--to claude-code` to move the other way. For an older Claude harness with no
`selected_tool`, add `--legacy-tool claude-code` to migrate it explicitly. The switch
requires the harness version, manifest, and common runtime scripts to match the pinned
release. Run the pinned update command above first if it reports an older version.
preflights collisions, backs up, stages and validates the new layout, then records the
new selection. It retires released files from the old layout while preserving edited
skills, hired job sheets and roster rows. Active computer schedules must first be
turned off with `node status/schedule.mjs off --agent <name>`; saved schedules are
invalidated by the switch and must be rewired for the new tool. The switch reports
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
wholesale. A completed switch can also be restored from its reported backup; any
new-layout edits that conflict must be handled first. Keep the backup for audit.

## Older same-path folders

Older folders that used the release checkout as their business folder must first be
migrated into a separate deployed repository with an explicit selected tool. From a
fresh release checkout, run:

```sh
node install.mjs --tool claude-code --target /path/to/new-client-folder \
  --migrate-from /path/to/legacy-checkout --github-repo OWNER/PRIVATE-REPO
```

Use `--tool codex` only when the legacy status already records Codex. The migration
copies the client's status and logs, knowledge, memory, skills, roster and job sheets,
as well as other client-created files such as notes and playbooks, then overlays edited
deployed files. Release-only source trees, maintainer files, and retired workflows stay
behind. Saved computer schedules are invalidated because
their paths refer to the legacy folder; wire them again in the new folder. The new
private repository becomes the home, while `--local-only` leaves home disabled. The legacy
checkout is left intact. The command creates and pushes a private GitHub repository;
`--remote https://github.com/OWNER/PRIVATE-REPO.git` uses an existing private
repository, verified through `gh`. `--local-only` creates a local staging repository
when GitHub credentials are unavailable and reports that remote setup is pending.

The manifest's legacy `refresh` list remains for old updaters; `deployment` is the
contract for separate client folders. Maintainers run
`node tests/helpers/pristine.mjs --write` after release edits and before tagging.
