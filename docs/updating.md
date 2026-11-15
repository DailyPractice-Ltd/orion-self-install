# Updating a deployed Orion harness

Run the update command from your deployed client folder after you ask Orion to update.
Orion uses the Codex or Claude Code layout recorded in `status/status.json`.

## Update from a published release

```sh
cd /path/to/my-orion
node update/request.mjs
```

The request is the consent to start. The updater needs an enabled, paired,
working radio so Orion can receive release and withdrawal notices.

When you ask for an update after a radio notice, use the version named in the
notice. For a notice about Orion 2.1.0, run `node update/request.mjs --tag v2.1.0`.
Orion verifies that release again before applying it. The command without a tag
requests the highest stable published release.

If your radio is off or hasn't been paired, Orion explains the requirement and
asks whether to turn on check-ins. Read [what radio check-ins share](radio.md)
before you decide. If you opt in, use the one-time pairing code from Daily
Practice. A successful pairing continues the update you already requested. If
you decline or pairing fails, your existing radio choice and applied release
are kept.

If an assistant runs the command without a terminal, tell it whether to opt in.
After you opt in, add `--pair-radio` to the original command and provide the code
locally through the `ORION_PAIRING_CODE` environment variable. In a terminal,
`--pair-radio` can also pair again if Daily Practice replaces your code. Ask
Daily Practice for a fresh code if your radio credentials were revoked.

The command checks for the highest stable GitHub Release,
excluding drafts, prereleases, and withdrawals. It downloads the published tag
into a temporary checkout and runs that exact commit's updater, manifest,
fingerprints, and shipped sources. It verifies publication and identity again
before changing the harness. If discovery or verification fails, retry when the
published source is available.

A release declares which starting versions and tool layouts it supports. A
matching recorded release is already up to date. A downgrade or a different
commit or Release ID for the same recorded version stops the update. A version
string on its own needs a declared verification migration. If a starting version
has no supported path, keep the old folder and install into a separate folder.

A file the client has changed is kept and reported when the change is optional.
Orion keeps the roster, hired job sheets, and unmapped client files.

### Review a required edit

If a local edit blocks a required fix after any declared migrations, Orion
pauses and prints the path to a private temporary review folder. Open
`review.json` there. Each entry links to three local files with the prior
shipped version, your edited version, and the incoming published version.
When a file is new in this release, `prior` is `null`. Review the files locally.
The updater only prints file names and the review location, so your edits can
stay out of chat and logs.

Set `choice` for every listed file in `review.json`:

- `"replace"` installs the incoming version and saves your edit in the update
  backup.
- `"merge"` uses the version you review and save at the listed `merged` path.
  Include the required fix and resolve any conflict markers. If `merged` is
  `null`, the file controls the pinned updater and requires replacement.

Run the original update command with the review folder added:

```sh
node update/request.mjs --resolve-required "/path/from/the/update"
```

Orion rechecks the publication, the starting harness, and the copies that
need a decision. If the review has gone stale, use the fresh review or retry
the original command. To defer, leave the update paused.

If you opted into radio as part of migrating to a separate folder, keep the
original migration destination and omit `--pair-radio` when continuing a review.
Orion saves that confirmed pairing in a private file alongside the review.
Keep the review folder local and delete it when you no longer need its copies.

The updater stages changes, backs up each affected file under `.update-backup/`,
and then applies them. It records the tag, full commit, Release ID, and
application time only after local smoke checks succeed. A failed smoke check
restores the prior files and leaves a failure report in the backup. If the
process is interrupted, retry the same update command. Automatic resumption
requires the same published release to still be available. Report the resulting
version, changes, preserved edits and collisions, and backup or failure report
path.

### Recover an unfinished update from a separate checkout

If Orion says recovery is required, keep the backup directory identified in the
message. It contains the prior files and `journal.json`. A failed automatic
restoration also records the cause and affected files in `failure.json`.
Orion blocks updates until recovery succeeds.

Read `release.tag`, `release.commit`, and `release.release_id` from the
backup's `journal.json`. Use those exact values to fill in the command below.
It downloads the same publication into a fresh temporary checkout, checks the
commit before running its recovery code, then verifies the release identity and
clean checkout against the transaction. This recovery uses the original backup
even if the publication has since been withdrawn.

```sh
(
  set -eu
  cd /path/to/my-orion
  backup=.update-backup/TRANSACTION
  release_tag=TAG
  release_commit=FULL_COMMIT
  release_id=RELEASE_ID
  recovery_tmp=$(mktemp -d)
  trap 'rm -rf "$recovery_tmp"' EXIT
  git clone --quiet --depth 1 --branch "$release_tag" https://github.com/DailyPractice-Ltd/orion-self-install.git "$recovery_tmp/release"
  test "$(git -C "$recovery_tmp/release" rev-parse HEAD)" = "$release_commit"
  node "$recovery_tmp/release/update/apply.mjs" recover-published --root "$PWD" --backup "$backup" --tag "$release_tag" --commit "$release_commit" --release-id "$release_id"
)
```

If recovery reports a collision, keep a separate copy of the affected work and
ask Daily Practice for help reconciling it. Recovery keeps the backup, the
original failure report, and the latest attempt's `recovery.json` together.

## Switch the selected tool

A tool switch is a separate operation. Take the tag and full commit from the
published release that is already applied to this harness. The command checks
that the download matches that commit before running its switch operation:

```sh
(
  set -eu
  cd /path/to/my-orion
  release_tmp=$(mktemp -d)
  trap 'rm -rf "$release_tmp"' EXIT
  release_tag=TAG
  release_commit=FULL_COMMIT
  git clone --quiet --depth 1 --branch "$release_tag" https://github.com/DailyPractice-Ltd/orion-self-install.git "$release_tmp/release"
  test "$(git -C "$release_tmp/release" rev-parse HEAD)" = "$release_commit"
  node "$release_tmp/release/update/apply.mjs" switch --root "$PWD" --release-repo "$release_tmp/release" --commit "$release_commit" --to codex
)
```

Use `--to claude-code` to move the other way. For an older Claude harness with no
`selected_tool`, add `--legacy-tool claude-code` to migrate it explicitly. The switch
requires the harness version, manifest, and common runtime scripts to match the pinned
release. Run the published update command above first if it reports an older version.
It checks collisions, backs up, stages and validates the new layout, then records the
new selection. It retires released files from the old layout while preserving edited
skills, hired job sheets and roster rows. Active computer schedules must first be
turned off with `node status/schedule.mjs off --agent <name>`; saved schedules are
invalidated by the switch and must be rewired for the new tool. The switch reports
its backup. If interrupted, run the pinned release script with `recover --root "$PWD"`
before trying again. The temporary checkout is removed automatically.

## Restore

For a completed offline update or tool switch, use the backup path printed by
the command:

```sh
node update/apply.mjs restore --root . --backup .update-backup/VERSION-TIMESTAMP
```

For an offline update made with `update/apply.mjs update`, restore puts prior
released files back and removes newly installed files. A file changed after update is kept and reported. It restores the prior
version and retired checklist keys without replacing the client's live status
wholesale. A completed switch can also be restored from its reported backup; any
new-layout edits that conflict must be handled first. Keep the backup for audit.

## Older same-path folders

For a harness that still uses the sending rule from before 1.5.0,
`node status/send.mjs migrate` is the separate local sending-rule command.
It backs up the files it changes.

A supported older same-folder harness moves into a separate deployed folder.
The updater verifies the historical layout and shipped files before carrying
over the client's status, radio choice, team, knowledge, memory, and other local
work. It keeps the original folder available. Saved computer schedules point to
the old path and need to be wired again in the new folder.

If the old harness has no `update/request.mjs`, use the official **Source code**
download for a published release that contains the launcher. Extract it outside
the old harness. From the old harness run the launcher from that download:

```sh
cd /path/to/older-orion
node /path/to/published-orion/update/request.mjs
```

The new folder is created alongside the old one, with `-deployed` added to its
name. To choose another new folder alongside the original, add
`--migrate-to /path/to/new-orion`. The command reports the new folder and update
backup once checks pass. If verification fails, keep the old folder and follow
the published fresh-install instructions into a separate folder.

## Declare a supported starting version

In `update/manifest.json`, add one unambiguous `update_compatibility` path for
each starting version and tool layout you support. Name the
`required_destinations` from the selected deployment map, and list the
required `checks`. Include a `deployed-layout` check and any applicable
`node-syntax` checks with their mapped `path`. For a release that needs no
migration script, declare `steps: []`.

A migration lists steps in order with `from_version` and `to_version` values
that connect the starting version to the release. Historical versions in a
required-edit review come from the recorded release's exact GitHub Release ID,
tag and commit. For a supported starting state without that record, a pinned
verification rule can specify `historical_source` with its exact `tag` and
`commit`. The historical tag must still resolve to that commit. The release
inventory lists pinned updater control files in
`deployment.immutable_update_sources`.

Every step names a pinned
`script` under `update/migrations/` and declares its allowed `changes`, each
with a relative `path` and an `operation` of `add`, `replace`, or `retire`.
Scripts are JSON arrays of local file instructions. `write-text` takes `text`,
`replace-text` takes a unique `find` string and a `replace` string, and `remove`
retires a file. Each instruction supplies its target `path`. The updater
reports the actual effects by step and backs up the prior bytes of changed
files. Running the script does not invoke shells or connect to external
accounts.

A path that verifies older state must declare `verification.anchors` with
shipped `path` and `sha256` fingerprints, and `verification.absent_paths` to
distinguish the layout. With `verification.infer_tool: true`, Orion can record
the tool if the evidence identifies a single path. For same-version backfill,
the installed release files must also match the pinned publication. Explicitly
list which release destinations accept client edits in
`verification.allow_client_edits`. A path with
`starting_layout: "legacy-same-folder"` stages a copy using the pinned
`copy_exclude` declaration and `prepare-separate-harness-status` migration
instruction. The default starting layout is `deployed`.
