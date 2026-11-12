# Updating a deployed Orion harness

The request is the consent. A file the client has changed is kept, except executable
`status/*.mjs` scripts, which are backed up and replaced as a version-consistent set.
`update/pristine.json` holds historical source fingerprints. A collision or edit is
reported without a prompt. The client's knowledge base, hired team, logs, and status
choices remain theirs.

## Update

The harness must be a separate deployed repository with `status/status.json` recording
`selected_tool` as `claude-code` or `codex`. Resolve the current `main` commit SHA from
`https://api.github.com/repos/DailyPractice-Ltd/orion-self-install/commits/main`.
Fetch or clone that release commit into a local release repository. The commit must be
present there. Run from the deployed harness:

```sh
node update/apply.mjs update --root . --release-repo /path/to/release-repository --commit FULL_COMMIT_SHA
```

The command reads **one pinned Git commit** for `update/manifest.json`,
`update/pristine.json`, and every source file. It uses `deployment.common_sources` and
`deployment.entries` to map portable release sources to the destination for the
recorded selected tool. It never copies the release-only `skills/` or `agents/` tree,
Speckit skills, tests, specs, or the other tool's runtime tree. The selected tool is
read from status; the current AI surface does not choose the target.

The manifest's `deployment.retired` names selected-tool destinations to retire. The
legacy `remove` list names common deployed paths to retire. A retired file is removed
only when its fingerprint matches a historical shipped copy. Changed retired files
remain and are reported. A client-created path or symlink is a collision and remains.
The client roster template is installed only when absent; later roster edits and rows
belong to the client.

Before the first change, the command backs up status and all files it will replace or
retire under `.update-backup/`. A journal records replacements, new paths and retired
paths. It checks all new `.mjs` syntax before writing, then updates only
`template_version`, one notes line, and named retired checklist keys in status. Run
`node status/send.mjs migrate` for legacy sending-rule migration when applicable; that
script manages its own narrow status change and backups. Run `node status/radio.mjs check`
afterward and report its result. Report version change, refreshed, added, retired,
kept, collisions, edited scripts replaced with backup location, and the backup path.

## Restore

Use the backup path returned by the update command:

```sh
node update/apply.mjs restore --root . --backup .update-backup/VERSION-TIMESTAMP
```

Restore copies replaced and retired files back and removes files created by the update.
If a newly created or replaced file has changed since the update, restore keeps and
reports it. It restores the prior version and retired checklist keys without replacing
the client's live status wholesale. The backup remains available.

## Older same-path harnesses

For installs older than 0.5.7, first fetch `docs/updating.md` and
`update/manifest.json` from the release, then migrate to a separate deployed
repository with a recorded selected tool before running this updater. The legacy
`refresh` list remains in the manifest for older harnesses; it is not the deployment
plan for new installs. Use the release changelog to identify changes to client-visible
check-ins. Run `node tests/helpers/pristine.mjs --write` before tagging a release.
