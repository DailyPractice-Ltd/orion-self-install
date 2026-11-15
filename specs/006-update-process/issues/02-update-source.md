# Which exact release does a client apply?

Type: grilling
Status: resolved

## Question

Define how `update my harness` discovers the latest published version, resolves it to immutable source, compares it with the client's installed version, and records what was applied. Include what happens if the latest release is unavailable, withdrawn, or has the same version but different bytes.

## Answer

`update my harness` discovers published, stable GitHub Releases with `vX.Y.Z` tags and selects the highest semantic version. Drafts, prereleases and withdrawn releases do not qualify. GitHub's "latest" label and publication time do not determine order. The selected GitHub Release ID and tag identify the publication; the tag is peeled to a full commit hash. The updater verifies that `update/manifest.json` at that commit declares the same version, then runs that commit's updater against that commit's manifest and shipped files.

The installed harness records the applied release's tag, full commit hash, GitHub Release ID and application time in `status/status.json`, atomically with successful installation. New installs record the same identity. A newer version can be applied; the same version with the same identity is a no-op; an older version is refused. The same version with a different commit or Release ID is an integrity conflict: stop before writing and require a new version for any correction. Client edits to released files are a separate compatibility question for issue 04.

If discovery, tag fetch or verification fails, leave the harness untouched and report that the update check failed. There is no fallback to `main`, cached source or the local updater. Recheck publication and identity immediately before the first write; if the selected release was withdrawn or changed, stop. An already installed withdrawn release remains installed and is reported, without automatic rollback. Legacy harnesses that record only `template_version` need a verification route in issue 04.

