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
If a required change is blocked by a local edit, the update stops before writing
and names the file. The pinned `update/manifest.json` defines the release
destinations and required files. The pinned `update/pristine.json` supplies
historical fingerprints for released files, including retired files. The registry
itself cannot certify its own earlier contents, so updates use the pinned
registry and preserve a differing local copy. Orion keeps
the roster, hired job sheets, and unmapped client files. Maintainer
specifications stay in the release repository.

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
repository, verified through `gh`. With no GitHub option, installation creates a local Git repository; `--local-only` is the explicit equivalent. A private remote can be connected later with `node status/home.mjs prepare --remote <address> --yes`.

The manifest's legacy `refresh` list remains for old same-path updaters, but no longer
lists the three `.claude/skills/` source files removed from the release. An older
same-path updater can still refresh the other listed files; it will leave those
three installed skills as they are. To receive current skill definitions, migrate
the harness into a separate client folder with `install.mjs --migrate-from` above,
or run the pinned updater in an already deployed folder. That updater maps the
`skills/` sources to the chosen runtime paths and recognizes historical Claude
copies by fingerprint. `deployment` is the contract for separate client folders.
Maintainers run
`node tests/helpers/pristine.mjs --write` after release edits and before tagging.

## Declare a supported starting version

In `update/manifest.json`, add exactly one `update_compatibility` entry for each
supported `from_version` and `tool`. An ordinary update declares `steps: []`,
names its `required_destinations` from the selected deployment map, and lists
`checks`. Include a `deployed-layout` check and any applicable `node-syntax`
checks with their mapped `path`. Optional files use the shipped fingerprints
to distinguish released copies from local edits.
