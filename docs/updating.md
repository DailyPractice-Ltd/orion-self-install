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

The helper uses the deployment allowlist for your AI assistant. A file the client has changed is kept
and reported. The runtime scripts under `status/` are refreshed together, and
`update/pristine.json` is refreshed with the source fingerprints. The helper backs up
replaced and retired files, retires listed files that match shipped fingerprints,
checks the incoming scripts and records the version after applying the update.
On the same version it reports an up-to-date result when there is no work.

When upgrading a harness that predates the 1.5.0 sending rule, run
`node status/send.mjs migrate` as described in [AGENTS.md](../AGENTS.md).
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
The switch backs up, stages and validates the new skill layout, then records the new
selection. Review your scheduled tasks in the app that owns them before switching. The switch reports
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
migrated into a separate deployed repository for an explicitly chosen AI assistant. From a
fresh release checkout, run:

```sh
node install.mjs --tool claude-code --target /path/to/new-client-folder \
  --migrate-from /path/to/legacy-checkout --github-repo OWNER/PRIVATE-REPO
```

Use `--tool codex` only when the legacy status already records Codex. The migration
copies the client's status and logs, knowledge, memory, skills, roster and job sheets,
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
or follow the pinned update procedure in an already deployed folder. It maps the
`skills/` sources to the chosen runtime paths and recognizes historical Claude
copies by fingerprint. `deployment` is the contract for separate client folders.
Maintainers run
`node tests/helpers/pristine.mjs --write` after release edits and before tagging.


## Required pairing in the 3.0.0 candidate

This installation-sequence change is a 3.0.0 release candidate in source, not a
published release. Client schema stays 2.0.0; the maintainer constitution is 2.0.0.
[Setup and recovery](setup.md) explains the required signed-in pairing, exact
30-day existing-user transition, pause and durable report replay. The first updated
runtime use identifies existing progress before mutating setup fields and records
its start/deadline once in `sharing.pairing`. It never uses the old 2.0.0 version as
an age detector, resets a clock, or silently changes a previous declined choice.
An already paired enabled folder can satisfy migration through fresh verification.

The updater preserves client-owned `status/status.json`, `status/radio.key`,
`status/radio-outbox.json`, lock state and saved setup checkpoint. Its narrow
version/notes/checklist edits and send-level migration do not authorize replacing
these files. The shared guard makes its own atomic pairing/migration state changes
at runtime. Pending reports retain their original identities across update/restore.
New guard, store and reporting modules deploy together through both legacy refresh
and `deployment.common_sources`, with this release's setup instructions.

Inspect existing native scheduler prompts and migrate them in place before the
next enabled run as described in [Schedule Orion](scheduled-work.md). Local file
updates cannot edit app-owned prompts. Review preserved edits to AGENTS, adapters
and agent definition so they also put the guard before work. Constitution and
specification sources remain maintainer-only; they are not client package data.
