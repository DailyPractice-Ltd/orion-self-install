# Updating Orion

Work in this harness’s deployed folder. “Update my harness” authorizes these
steps. Use its recorded `selected_tool` for destinations. Updates work with the
radio off.

For a **version check**, read `template_version` and the source commit in status,
then pin and compare with `main` in step 1. Report the comparison and stop. For
**restore**, **tool switch**, or **older same-folder migration**, use
[Update maintenance](update-maintenance.md).

## 1. Pin main

Set `scratch` to a new private temporary directory and `stage` to its `stage`
subdirectory. Clone the official `main` into `$scratch/source`. Use its full
commit throughout. If GitHub is
unreachable, report the error and stop. Keep every live file as it is when the
source version is older.

```sh
git clone --quiet --branch main --single-branch https://github.com/DailyPractice-Ltd/orion-self-install.git "$scratch/source"
commit=$(git -C "$scratch/source" rev-parse HEAD)
```

Compare the pinned manifest version with the installed version, then read the
pinned `docs/updating.md` before continuing. If this harness has no
recorded tool, follow the [migration procedure](update-maintenance.md#older-same-folder-harness).
A commit identifies a snapshot even when the version number stays the same.

## 2. Stage every change

Use the pinned checkout to inventory the selected layout and compare it with
this harness. The output contains paths and fingerprints. Treat the status
backup and all staged files as private.

```sh
node "$scratch/source/update/apply.mjs" inspect --root "$PWD" --commit "$commit"
```

For every entry in `files`:

- **Copy** the pinned `source` to `$stage/files/<path>`. This includes the
  generated fingerprint registry.
- **Merge** the local file with the incoming source. Use the prior release's
  bytes as the base and stage the result in `$stage/files/<path>`. Use
  `previous_commit` from the inventory and the same destination in its
  manifest for the recorded tool. If the commit is unavailable, fetch it
  from the official repository. When only a version is recorded, use its official
  version tag as the base if its manifest version and destination match and the
  pinned registry lists the prior source fingerprint.
- **Retire** a listed shipped file by putting it in the plan with
  `"retire": true`.
- **Keep** a client-owned template or edited retired file and report its path.

For a merge, run this on temporary copies. Exit code 0 gives a clean result.
A conflict, an unavailable base, or a failed merge needs manual resolution.

```sh
git merge-file -p "$local_copy" "$prior_copy" "$incoming_copy" > "$merged"
```

Give the client the paths to the local, incoming and, when available, base
copies. Ask them to resolve each conflict in the staged copy. Pause here until
every conflict has an agreed resolution. Leave the live harness untouched.
Before continuing, rescan if the live status, files, or pinned source changed.
Rebuild affected merges and review any new conflicts.
Review the staged results for unresolved markers, valid JSON, and for code,
syntax and compatibility with other staged changes.

The stage is ready when each inventory entry has a staged file, a retirement
entry, or a recorded reason to keep it. Put the inventory's `commit` and
`status_hash` in `$stage/plan.json` with a `files` array. Each copy or merge
entry contains its original `path` and `before` fingerprint. Each retirement
entry also has `"retire": true`. Omit kept files.

## 3. Apply and verify

Apply the staged plan from the harness root. The helper rechecks the
allowlist and fingerprints, backs up the changes, and applies them as one
local transaction. It records the version and source commit on success.

```sh
node "$scratch/source/update/apply.mjs" apply-staged --root "$PWD" --commit "$commit" --stage "$stage"
```

Report the version and short commit, merged and kept paths, and backup
location. Confirm the report matches the staged changes and that status
records the expected version and commit. If apply reports a stale plan,
rebuild the affected stage before retrying. If an interrupted update needs recovery,
follow [Update maintenance](update-maintenance.md#recover-an-interrupted-update).
Remove temporary copies after the result has been verified.
