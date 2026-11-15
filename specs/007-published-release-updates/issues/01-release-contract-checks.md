# 01: Repair the release contract checks

**What to build:** Give maintainers a passing release contract for the current Orion inventory so a release candidate can be evaluated against the files it actually ships and the historical fingerprints deployed harnesses rely on.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] The release contract passes with the current manifest and the intended shipped skill inventory.
- [x] The contract still fails if a declared source or required historical fingerprint is missing.

## Implementation evidence

- Confirmed branch descends from `implement/006-published-release-updates`.
- Extended the existing release-contract CLI seam specified by the spec. Recorded red failures for the 11-skill inventory, missing supporting files, and a deleted required historical fingerprint before fixing each slice.
- Mapped all 11 shipped skills and supporting files for both tools; retired the deleted Notion source through the existing remove list while retaining its historical fingerprints.
- Contract rejects missing declared sources, unmapped/duplicate skill files, and missing required historical fingerprints. Regenerated the full-history registry.
- Made the Spec Kit retirement journey install a fixed historical commit and execute the incoming pinned updater, independent of the current HEAD inventory.
- Validation: `node --test` — 255 passed, 0 failed; `git diff --check` passed. All harness operations used disposable test fixtures; no live radio or user state touched.
