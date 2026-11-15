# 02: Publish a verified release candidate

**What to build:** Let a maintainer explicitly publish a stable GitHub Release for a nominated commit. The tag, commit, manifest, checks, and release notes identify the same release candidate.

**Blocked by:** 01 — Repair the release contract checks

**Status:** completed

- [x] Publication requires a valid vX.Y.Z tag resolving to the nominated full commit and a matching manifest version. A candidate without the matching changelog section is rejected.
- [x] The exact commit must pass CI covering the complete release inventory, historical fingerprints, install behavior, and update behavior. Passing CI on a different commit cannot satisfy the gate.
- [x] Major releases and releases with migration scripts require Henri's recorded local trial on a disposable deployed harness before publication.
- [x] Release notes are built from the nominated commit's changelog section even if main has advanced.
- [x] A published tag and its bytes stay fixed. A correction is published under a new version.
- [x] A workflow test follows a candidate through publication using fixture Git history and simulated GitHub responses, including rejected candidates.

## Implementation evidence

- Replaced tag-push publication and mutable release editing with a main-only explicit dispatch using the protected `release` environment. The maintainer nominates an existing stable tag and full SHA.
- Publisher reads manifest and notes from that Git object, checks the approved Test workflow and required inventory/history/install/update entry points, and requires all six successful CI jobs from a successful exact-SHA Test run.
- Major and migration-script releases require a GitHub issue comment authored by the configured Henri account, recording a passed local disposable-harness trial bound to the exact tag and SHA.
- Before creation, verifies remote tag resolution and GitHub immutable-release settings. Existing releases are refused; the workflow cannot edit or retag. Documented setup and catalog ingestion in `docs/publishing.md`; corrected the changelog introduction while preserving historical sections.
- TDD at the spec-approved candidate-to-publication CLI seam: observed red tests before implementation for publication, local-trial gating, immutability/remote tag checks, and weakened CI rejection. Seven fixture-Git/simulated-GitHub journeys cover publication after main advances and rejected candidates.
- Validation: `node --test` — 262 passed, 0 failed. `git diff --check` passed. Regenerated pristine fingerprints for the changed changelog. No actual release, remote tag, deployment or live harness change.
- GitHub setup (environment/reviewers, token, Henri login and immutable releases) remains an explicit administrator prerequisite, not a claimed live configuration. API settings and job schema verified against official GitHub REST documentation.
