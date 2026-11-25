# Installed-file receipts for reliable Orion updates

## Problem Statement

Orion must distinguish untouched shipped files from client customizations before
updating a deployed harness. Today it recognizes files through a shared registry
of fingerprints reconstructed from reachable Git history and the current release
working tree.

That makes ownership validation depend on repository ancestry. Merging branches
can introduce historical file versions, squashing can remove intermediate
versions, and generating fingerprints from uncommitted edits can record versions
that never enter the committed release. CI can therefore reject otherwise valid
release files because the regenerated registry differs from the committed one.

The recent failures exposed both malformed registry JSON after a merge and a
fingerprint for an uncommitted changelog edit. Regenerating repeatedly addresses
individual failures without removing the dependency on Git history.

Clients need safe updates without losing their edits. Maintainers need checks
whose result does not change solely because a branch was merged or squashed.
Clients must also retain the ability to install or update from an explicitly
selected commit, including one outside main.

## Solution

Each fresh installation records a local installed-file receipt containing the
fingerprints of the Orion-managed files actually installed. Updates compare the
current files with that receipt to identify client modifications.

An unchanged managed file can be replaced. An unknown or modified ordinary file
is preserved. A detected modification to a managed runtime or plugin file blocks
the update before release files change, avoiding a mixture of incompatible runtime
versions. A receipt advances only for successful file replacements or other
verified installation actions.

Older deployed harnesses without receipts use the existing historical registry
as a compatibility fallback. Unknown files remain protected; migration must not
silently adopt their current bytes as an Orion baseline. An existing but damaged
receipt stops the update before changes.

The historical registry becomes frozen compatibility data. Normal generation and
validation stop reconstructing it from Git history. Updates continue to follow
main by default, while an explicit full commit SHA can select a different source
snapshot. Receipt ownership decisions depend on installed bytes, not branch names
or ancestry.

## User Stories

1. As a client, I want untouched Orion files to update automatically, so that I receive fixes without reviewing every file.
2. As a client, I want my modified ordinary files preserved, so that updating does not erase my customizations.
3. As a client, I want files with unknown ownership preserved, so that uncertainty does not authorize replacement.
4. As a client, I want an update to stop when a managed runtime file is modified, so that my changes are protected without producing an incompatible runtime.
5. As a client, I want the same protection for modified plugin files, so that package replacement does not silently discard edits.
6. As a client, I want conflicts identified before release files change, so that I can resolve them and retry safely.
7. As a client, I want fresh installation to record the files actually copied and generated, so that subsequent updates have a reliable baseline.
8. As a maintainer, I want installation from a branch or modified local checkout to record the actual installed bytes, so that ownership does not depend on a release tag.
9. As a client, I want a receipt to describe what was installed rather than what an update intended to install, so that later ownership decisions remain accurate.
10. As a client, I want preserved files to retain their previous baseline, so that a later update still recognizes my changes.
11. As a client, I want my business records excluded from receipts, so that they remain client-owned.
12. As a client, I want credentials and client-owned skills excluded from receipts, so that installation bookkeeping never authorizes their replacement.
13. As an existing client, I want to update without first installing an intermediate release, so that skipped releases do not prevent adoption of receipts.
14. As an existing client, I want recognized legacy files to migrate safely, so that I retain automatic updates for untouched files.
15. As an existing client, I want unknown legacy files preserved, so that migration does not relabel my edits as shipped content.
16. As a client, I want a malformed receipt to stop updates clearly, so that unreliable ownership evidence is not silently ignored.
17. As a client, I want interrupted updates to recover files and receipt state together, so that retrying does not trust a false baseline.
18. As a client, I want rollback to restore ownership metadata with restored files, so that subsequent updates remain safe.
19. As a client, I want an explicit restore to preserve later edits while maintaining accurate baselines, so that restoring does not erase work completed after an update.
20. As a client, I want pending plugin activation to retain receipt state for files already applied, so that activation status does not misrepresent installed content.
21. As a client, I want switching between Codex and Claude Code to maintain the receipt, so that generated and retired tool-specific files are tracked correctly.
22. As a client, I want updates to continue following main by default, so that the existing update experience remains available.
23. As a maintainer, I want to update a deployed harness to a specific full commit SHA outside main, so that I can test or deliver a selected candidate.
24. As a client, I want explicitly selected commits to follow the same preservation and recovery rules, so that source selection does not weaken update safety.
25. As a maintainer, I want merging or squashing a PR to leave ownership validation stable, so that repository topology alone cannot break CI.
26. As a maintainer, I want compatibility fingerprints retained without repeated history reconstruction, so that older installations remain recognizable.
27. As a maintainer, I want concurrent update operations serialized, so that one operation cannot overwrite another operation's receipt.

## Implementation Decisions

- Introduce a versioned, harness-owned installed-file receipt separate from the
  shared release registry. Keep it out of release-file replacement and client
  business data. Select its exact storage location during implementation.
- Use the existing deployment planner as the source of managed-file inventory.
  Retain stable source or fingerprint identity and actual deployed destination,
  including tool-specific mappings. Do not invent an independent deployment map.
- Reuse the existing normalized text fingerprint convention so platform line
  endings do not create false modifications.
- Generate a fresh receipt in the installation staging folder after managed files
  have their final installed contents and before publishing the completed harness.
  Account for generated managed metadata without treating credentials, business
  records, client templates or client-owned skills as replaceable release files.
- For receipt-tracked files, compare current content with the recorded installed
  baseline. Unknown existing content is not automatically adopted. A matching
  historical shipped hash must not override a receipt that detects a client edit.
- Preserve modified ordinary files and their last installed baselines. Advance
  entries only when an installation action succeeds; handle successful managed
  additions and removals without retaining false claims that a file is installed.
- Preflight managed runtime and plugin modifications before mutating release files.
  Replace the current unconditional overwrite exceptions with conflict detection.
  Identify affected paths and stop so the client can resolve modifications.
- Distinguish an absent receipt from an invalid receipt. Absence enables legacy
  migration. Invalid schema or unreadable or malformed content blocks the update;
  it must not silently fall back to legacy ownership checks.
- Bootstrap older installations using the frozen compatibility registry for
  files without a trustworthy installed baseline. Establish receipt entries only
  from recognized ownership evidence or successful installation actions. Keep
  legacy source aliases and retirement identities needed for compatibility.
- Preserve the documented incoming-updater execution path, allowing clients to
  skip the release that first introduces receipts.
- Stop rebuilding the compatibility registry from Git ancestry. Retain its valid
  existing historical fingerprints as migration data; do not remove recognized
  legacy versions merely because the current history no longer exposes them.
- Integrate receipt writes into the existing update lock, preflight, backups,
  staging, journal, rollback and interruption recovery. Use atomic receipt writes.
  Receipt recovery must follow actual restored files, including selectively
  preserved later edits during explicit restore.
- Respect the existing distinction between applied files with pending plugin
  activation and a failed activation that rolls files back. The receipt describes
  applied files while activation is pending and reverts when those files revert.
- Maintain receipt entries when switching tools changes generated or retired
  managed files. Switch failure must not leave receipt metadata claiming a
  completed transition that did not occur.
- Keep main as the default update source. Preserve explicit source-repository and
  full-commit selection without requiring main ancestry or a release tag. Run the
  same ownership, packaging, conflict and recovery checks for every selected commit.
- Replace ancestry-based exact-regeneration assertions with checks for valid
  compatibility data and observable receipt/update guarantees.

## Testing Decisions

- Prefer the existing deployed-harness journey seam: install a fixture release,
  modify or retain installed files, apply a pinned update, inspect resulting
  files and reported behavior, and restore or recover where relevant. Exercise
  real installer and updater commands rather than only testing hash utilities.
- Run the core journeys for both Codex and Claude Code. Existing install, deployed
  journey, update CLI, plugin lifecycle and tool-switch tests provide prior art.
- Verify untouched files update, edited ordinary files remain byte-for-byte
  unchanged, and their original receipt baselines remain effective on a second
  update. Include an edit that happens to match another known shipped version.
- Verify runtime and plugin edits block before release mutation, including a
  candidate containing other ordinary-file changes that must not be partially
  applied before the conflict is reported.
- Test fresh receipts against actual deployed contents, including installation
  from a modified local source and generated tool-specific files. Verify
  client-owned content does not enter the managed inventory.
- Test receipt-free legacy migration, unknown legacy files, skipped releases,
  and malformed, unreadable or unsupported receipts. Assert that invalid
  ownership metadata causes no release-file changes.
- Exercise failed writes, interrupted updates, recovery, rollback, explicit
  restore and activation outcomes. Verify files and receipt remain aligned;
  include later client edits preserved during restore.
- Exercise tool switching and a failed switch through their existing behavioral
  seams, then perform another update to prove the resulting baseline is usable.
- Apply a full commit outside main through the existing pinned-source interface.
  Verify it installs the selected committed contents and retains the same safety
  behavior as a default-source update.
- Include a regression proving a change in reachable history or merge topology
  alone does not require rewriting compatibility fingerprints or break ownership
  validation. Ordinary validation must work without full Git history.
- Retain cross-platform coverage and test line-ending normalization through
  observable ownership behavior. Avoid snapshots of prose, private helper
  structure or incidental serialization details.

## Out of Scope

- Changing the default update channel from main to tagged releases.
- Building a central append-only registry of every future distributed snapshot.
- Publishing a release, changing version numbers, merging PRs or sending changes
  to an external issue tracker as part of this specification request.
- Automatically merging client edits, approving conflict resolution, or silently
  adopting unknown file contents as an installed baseline.
- Recording business records, credentials or client-owned skills in receipts.
- Redesigning pairing, radio, sales workflows, plugin activation or unrelated
  installer behavior.
- Replacing the existing updater with an entirely new transaction system.

## Further Notes

This specification supersedes the initial suggestion to maintain an append-only
global registry for all future distributions. Per-installation receipts directly
record the evidence the updater needs, including for arbitrary source commits.

The user approved preservation of unknown files, automatic recording during
installation, continued main-based updates, receipt advancement only after
successful writes, conservative legacy migration, runtime conflict blocking,
failure on damaged receipts, coordinated recovery, client-data exclusions and
retirement of Git-history reconstruction. Explicit updates to commits outside
main remain supported.

The existing journey tests are the proposed primary verification seams. Their
use was communicated during specification preparation; no separate seam-specific
approval was collected. Exact receipt schema, storage location and conflict
presentation remain implementation details subject to the behavior above.

The human-readable specification is published only in the requested repository
directory. It is not a deployed client instruction or runtime data source.
