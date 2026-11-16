# Update maintenance

## Restore a backup

Use the backup path from the update report. Read its journal and preview the
files to restore or remove. Call out later edits and wait for the client to
choose restoration.

For a completed prompt-led update, offline update or tool switch, use:

```sh
node update/apply.mjs restore --root . --backup "$backup"
```

An update restore uses the backup's prior files, keeps later edits and
restores the prior version and source record. A tool switch restore reports
collisions for manual resolution.

For a `published-update` journal, use the existing preview command:

```sh
node update/request.mjs --restore-backup "$backup"
```

Show the preview, then repeat the command with its `--confirm-restore` value
if the client chooses restoration. Keep the backup and the printed report.

## Switch tools

Clone the official source into a private temporary checkout. Pin it to the
installed `template_commit` or `applied_release.commit`. When neither is
recorded, use the `main` pin from [Updating Orion](updating.md#1-pin-main).
Run the switch for the requested target from the deployed harness:

```sh
node "$scratch/source/update/apply.mjs" switch --root "$PWD" --commit "$commit" --to codex
```

Use `--to claude-code` for Claude Code. The switch checks the version and
runtime against the pinned source. If it reports a version mismatch, update
first. If it reports a locally edited runtime file, review the collision with
the client. Follow [schedule migration](scheduled-work.md#migrate-a-legacy-schedule)
for active computer schedules and report the switch backup.

## Recover an interrupted update

For a prompt-led update, offline update or switch, run
`node update/apply.mjs recover --root .` before starting a new plan. If recovery
reports a collision, keep the backup and review the affected files with the client.

For an unfinished published transaction, take the tag, commit and release ID
from the backup's `release` record in `journal.json`. Clone the official source
at that tag into a temporary directory and confirm its HEAD equals the recorded
commit. From the harness run:

```sh
node "$checkout/update/apply.mjs" recover-published --root "$PWD" --backup "$backup" --tag "$tag" --commit "$commit" --release-id "$release_id"
```

## Older same-folder harness

Migrate into a separate client folder with the pinned checkout's installer.
Use the recorded tool or ask the client to identify it if missing. Explain
where the copy will go and ask for that path if it has yet to be chosen.

```sh
node "$scratch/source/install.mjs" --tool "$tool" --migrate-from "$PWD" --target "$target" --local-only
```

The installer keeps the original folder available and reports migration
collisions. Verify the new folder's tools and client data before using it.
Follow [schedule migration](scheduled-work.md#migrate-a-legacy-schedule) for
schedules that still reference the original folder. For older sending rules,
`node status/send.mjs migrate` updates the kit's wording and backs it up first.
