# Which installed harnesses may take a release?

Type: grilling
Status: resolved

## Question

Define compatibility rules for different starting versions, older same-folder harnesses, Codex and Claude Code destinations, and client-edited released files. Decide when an update may proceed, when it needs a migration route, and how a preserved edit that blocks a necessary fix is surfaced.

The user has decided that an update runs a migration script when migration is needed. Define how that script is selected, what it may change, and how it fails or resumes safely.

## Decisions so far

- A release explicitly declares which installed starting versions it supports and supplies any required migration path. Orion refuses an undeclared starting version before writing.
- When the installed version is too old for any supported update path, Orion recommends a fresh, clean harness installation.
- A clean install creates a separate new folder, leaves the old harness untouched, and does not automatically copy old status or configuration. It is not reported as an update.
- A supported older same-folder harness uses a declared migration into a separate deployed folder, then applies the release there; the original remains intact. Without a supported migration, recommend a clean install.
- Use the harness's recorded `selected_tool` and the release's declared destination map. An update never switches tools. A legacy folder missing `selected_tool` needs an explicit supported migration that establishes it.
- The pinned release declares one ordered migration path per supported starting version, including tool-specific steps. Orion preflights the full path, runs scripts only from that pinned commit, and stops on a missing or ambiguous step.
- A migration may change any part of the local harness folder. This does not authorize changes to live external accounts such as CRM or email.
- Each migration declares its intended local changes, backs up every file it changes, and reports the actual changes. It may transform client-owned files when needed, but preserves the client's existing radio choice.
- Run migration against a staged copy, validate, then promote it. On failure or interruption, keep or restore the original and do not record the release as applied. A recovery journal cleans up before retry.
- The release marks required changes. An edited released file is preserved and reported when the incoming change is optional. If it blocks a required fix and no declared migration can reconcile it, stop before applying the release and name the file and conflict.
- For a blocking edit, show the old shipped version, the client's edited version, and the incoming released version. Offer a reviewed merge or replacement with the pinned released file, backed up first. Proceed only after the client chooses the exact result; deferring leaves the harness unchanged.
- A legacy status with only `template_version` cannot be treated as an identity-matched no-op. A declared migration may verify its layout and backfill the release identity; without a supported verification path, recommend a clean install.

## Answer

Every published release declares the installed starting versions and tool layouts it supports. Orion updates only from a declared starting state, with one complete, ordered migration path from that state to the target. The release names each migration script, including tool-specific steps, and all scripts come from the pinned release commit. Orion preflights the full path and stops before writing if a step is missing, ambiguous, or unsupported. A harness too old for a supported path is directed to a fresh, clean install in a separate folder; its old folder is left intact and no old status or configuration is copied automatically.

An ordinary update uses `status.selected_tool` and the release's declared destination map. It never switches between Codex and Claude Code. A supported older same-folder harness first uses a declared migration into a separate deployed folder, preserving its original, then applies the release there. A legacy harness missing `selected_tool` needs an explicit migration that establishes it. A legacy status with only `template_version` must not be treated as an identity-matched no-op: a declared verification migration may prove the old layout and backfill identity, or Orion recommends a clean install.

A migration may change any part of the local harness folder, including client-owned files when needed, but no live external account. It declares intended local changes, backs up every file it changes, reports the actual changes, and preserves the client's radio choice. Orion runs the migration against a staged copy, validates the result, then promotes it. A failure or interruption keeps or restores the original, leaves the release unapplied, and is reconciled from a recovery journal before a retry.

The release marks required changes. For optional incoming changes, Orion preserves and reports an edited released file. If an edit blocks a required fix and no declared migration can reconcile it, the update stops before applying the release and names the conflict. Orion shows the old shipped, client-edited, and incoming versions, then offers a reviewed merge or replacement with the pinned released version, with backup first. It proceeds only after the client chooses the concrete result; deferring leaves the harness unchanged.

