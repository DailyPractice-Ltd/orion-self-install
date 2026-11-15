# 006 — Publishing and applying Orion releases

## Problem Statement

A client asking to update a deployed harness cannot currently rely on “latest” meaning a published Orion version. The release workflow takes notes from `main` and can publish without proving that the tagged commit passed the release checks. The updater also clones `main`, so it may apply code that differs from the GitHub Release a client saw. The deployed harness records a version but not the exact publication it applied. Clients need a trustworthy release identity, a clear update invitation, compatible migrations, and a recoverable path when an update or published release fails.

## Solution

Maintainers publish an immutable, tested release candidate as a stable GitHub Release whose tag, commit, manifest, and notes agree. A deployed harness discovers the highest published stable version, pins its exact source, checks compatibility and local edits, and applies it only after the client asks. It records the publication identity only after migrations, installation, and local smoke checks succeed. Paired harnesses receive one radio notice for the newest eligible release. A withdrawn release stops being offered; affected clients receive a separate withdrawal notice and a choice of recovery paths.

## User Stories

1. As a maintainer, I want to nominate an exact release candidate commit, so that publication never depends on later changes to `main`.
2. As a maintainer, I want the candidate's version tag and manifest to agree, so that clients know which files belong to the release.
3. As a maintainer, I want CI to pass on that exact commit before publication, so that release checks describe the code clients receive.
4. As a maintainer, I want release inventory, historical fingerprints, install tests, and update tests in that gate, so that incomplete or unsafe packages cannot publish.
5. As Henri, I want a local trial before a major release or any release with a migration script, so that I see the deployed experience before publication.
6. As a maintainer, I want notes generated from the candidate's changelog section, so that the announcement matches the shipped code.
7. As a maintainer, I want corrections to receive new versions, so that a published tag and its files remain auditable.
8. As a client, I want “update my harness” to select the highest stable published version, so that I receive a release rather than an arbitrary branch commit.
9. As a client, I want drafts, prereleases, and withdrawn releases excluded, so that I do not install unfinished or unsafe versions.
10. As a client, I want source, tag, commit, and manifest verified before any write, so that the update applies the exact publication selected.
11. As a client, I want a failed release lookup or verification to leave my harness untouched, so that a temporary outage cannot trigger an unverified fallback.
12. As a client, I want an already applied release to be a no-op, so that repeated update requests are safe.
13. As a client, I want a lower version refused and a same-version identity mismatch reported, so that an update cannot silently downgrade or replace my release.
14. As a client, I want my harness to record the applied tag, commit, Release ID, and time, so that support can identify exactly what I run.
15. As a new client, I want my install to record the same release identity, so that future update checks have a reliable starting point.
16. As a client with radio enabled, I want one clear notice for the newest release my harness can take, so that I know an update is available without repeated reminders.
17. As a client, I want the notice to explain the version and key changes in plain language, link to full notes, and tell me how to request the update, so that I can choose when to apply it.
18. As a client, I want a notice to leave my files alone and require no reply, so that hearing about a release is separate from applying it.
19. As a client who declined check-ins earlier, I want that choice preserved, so that an update never enables radio behind my back.
20. As a radio-off client requesting an update, I want the pairing requirement explained and the request resumed after I opt in and pair, so that my update can proceed deliberately.
21. As a new client, I want installation to pause if required radio pairing cannot be confirmed, so that a completed install can receive release and withdrawal notices.
22. As a client, I want the release to declare supported starting versions and tool layouts, so that Orion refuses an unsafe jump before changing files.
23. As a client on an older same-folder harness, I want a supported migration into a separate deployed folder, so that my original remains intact.
24. As a client whose version has no supported path, I want a clean-install recommendation in a separate folder, so that my existing harness remains available.
25. As a client, I want migrations to use scripts from the selected release commit and my recorded tool, so that the update cannot mix versions or switch tools implicitly.
26. As a client, I want the full migration path checked and every changed file backed up before promotion, so that an ambiguous or failed step does not damage my harness.
27. As a client, I want optional changes to preserve my edits and report them, so that my customizations are visible and retained.
28. As a client, I want a required fix blocked by my edit to show the old shipped, my edited, and incoming versions, so that I can choose a reviewed merge or backed-up replacement.
29. As a client, I want deferring that conflict to leave the harness unchanged, so that I can decide later.
30. As a client with only a legacy `template_version`, I want identity verified through a declared migration before a no-op or update, so that a version string is not mistaken for proof of installed bytes.
31. As a maintainer, I want to withdraw a bad release without moving its tag, so that new installs stop while the published history remains auditable.
32. As an affected client, I want a distinct withdrawal notice that says whether my harness applied that release and what to do next, so that I can act without an automatic rollback.
33. As a client whose update fails a smoke check, I want automatic restoration and a retained failure report, so that my prior release remains recorded and usable.
34. As a client whose restoration fails, I want further update attempts stopped and a separate pinned recovery route, so that damaged local updater code is not trusted.
35. As a client who applied a withdrawn release, I want to choose backup restoration or a corrected release, so that later work is protected while I recover.

## Implementation Decisions

- Use the glossary's distinct terms: a **release candidate** is a proposed exact commit; a **published release** is a maintainer-published GitHub Release on a fixed version tag; a **deployed harness** is the client's folder; an **applied update** exists only after all required checks succeed. A **radio notice** announces a release and does not authorize installation.
- Publication is an explicit maintainer action for a `vX.Y.Z` tag. The workflow checks the candidate commit's green CI, complete release inventory and historical fingerprints, installation and update behavior, manifest version, and changelog section before publishing. Major releases and releases with migrations also require Henri's local trial on a disposable deployed harness. Notes come from the candidate commit. Published tags and bytes are never moved or replaced.
- The release metadata declares supported starting versions and tool layouts, whether a change is required, an ordered and unambiguous migration path for each supported starting state, intended local migration changes, and required post-apply checks. Migration scripts and tool-specific steps are part of the pinned release. Missing declarations fail preflight.
- Discovery considers only published, stable, non-withdrawn GitHub Releases with valid `vX.Y.Z` tags. Choose the highest semantic version, independent of publication date or GitHub's “latest” label. The GitHub Release ID and tag identify publication; peel the tag to a full commit hash and verify the pinned manifest version. Recheck publication and identity immediately before the first write. On failure, stop without a branch, cache, or installed-updater fallback.
- The updater runs the pinned commit's updater with that commit's manifest and shipped sources. Status records tag, full commit hash, GitHub Release ID, and application time in the successful transaction; a new install records the same identity. A newer version may apply; the same version and identity is a no-op; an older version is refused; the same version with a different commit or Release ID is an integrity conflict. An already applied withdrawn release remains installed until the client chooses recovery.
- New installations require an enabled, paired, working radio before completion. Existing clients who declined check-ins keep that choice. A radio-off update request explains the requirement and offers opt-in and pairing; no update write occurs until the client agrees and pairing succeeds, then the existing request continues.
- The bridge sends a structured release notice only to a paired harness with check-ins enabled, when its applied version is older than its newest eligible published release. It carries the version, tag, full commit hash, Release ID, short summary from the pinned changelog, and full-notes link. The harness displays the version, summary, link, and “Say 'update my harness' when you're ready.” Identity details remain in the structured payload. Record display durably; retry delivery until display is recorded, then never remind for that harness and release. A later eligible release may have its own notice.
- Ordinary updates use the recorded `selected_tool` and the pinned destination map; an update never switches tools. A missing tool selection or a legacy `template_version` needs a declared verification migration. A supported older same-folder harness migrates into a separate deployed folder, preserving its source. Unsupported versions route to a separate clean install without automatically copying status or configuration.
- Preflight the entire path before applying. Migrations may alter any local harness file whose intended change is declared, with backups and an actual-change report, but do not touch live CRM, email, or other external accounts. Preserve the existing radio choice. Run against staged content, validate, then promote. A journal drives recovery after failure or interruption and the release identity remains prior until success.
- Preserve edited released files when incoming changes are optional. For a required fix blocked by an edit and not reconciled by a declared migration, stop before applying. Show the prior shipped, client-edited, and incoming versions; continue only with the client's selected reviewed merge or backed-up replacement. Deferral makes no harness change.
- Required local post-apply smoke checks precede the applied-update record. Failure automatically restores the pre-update state and retains a failure report. If restoration fails, preserve the backup and journal, identify affected files, block further updates, and recover through a separate pinned source.
- Withdrawal makes a GitHub Release ineligible for discovery and prewrite verification without changing its tag or commit. Send a distinct withdrawal notice to paired harnesses notified of or recorded as applying that release. It states whether this harness applied it and the next safe action; it does not roll back automatically. A corrected release has a new version and declares a path from the withdrawn version, or offers backup restoration first.
- No client canary is required. After publication gates pass, notices may reach all eligible paired harnesses.

## Testing Decisions

- Test observable release and deployed-harness behavior through the highest practical seams: a candidate-to-publication workflow with fixture Git history and simulated GitHub Release responses, and a deployed-harness journey that requests an update against that publication. Keep release discovery, application, and recovery behind this journey rather than testing their internal helper boundaries separately.
- Extend the existing release contract, update CLI, deployed journey, radio check, and install tests. Their temporary repositories, client folders, bridge fixtures, and injected interruption cases are prior art. Add workflow-level checks that notes, gate evidence, tag, commit, and manifest all describe the same candidate.
- Cover semantic version selection; exclusion of draft, prerelease, and withdrawn releases; identity mismatch; outage and unavailable source; prewrite withdrawal; no-op and downgrade; atomic identity recording; both tool layouts; legacy verification; supported and unsupported migrations; required-edit conflicts; staged failure, smoke-check rollback, failed restoration, backup restore, and preserved later client work.
- Cover notice eligibility and one-time display, newest-only selection, radio-off behavior, opt-in pairing, withdrawal notice, and the fact that notices never invoke the updater. Assert client-visible text and durable state rather than internal call order except where the prewrite boundary is itself the contract.
- A good test starts from a client or maintainer action and verifies files, status, publication state, notice output, or recovery result. It must not assert incidental function structure or duplicate the implementation's algorithm.

## Out of Scope

- Implementing, tagging, publishing, or deploying a release as part of this planning spec.
- Changing an existing client's radio choice as a side effect of updating.
- A client canary or staged rollout.
- Automatic rollback of an already applied withdrawn release.
- Switching a deployed harness between Codex and Claude Code during an update.
- Migration writes to live external accounts.

## Further Notes

- Source decisions are the five resolved release-update records under the planning map. This spec consolidates them; it does not claim that the current release workflow or updater already implements the contract.
- The current workflow reads notes from `main` and does not gate publication on the exact candidate's CI. The current documented updater clones `main`. Both need to change to honor the release identity above.
- The existing release-contract test currently fails on a deleted manifest source and an outdated three-skill expectation. Those failures block publication under the proposed gate and should be repaired before the first release governed by it.
- The radio bridge and release publisher are cross-system dependencies. Their notice, withdrawal, eligibility, and display-acknowledgment contracts must be implemented together with the deployed harness behavior.
