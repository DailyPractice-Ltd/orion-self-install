# 02: Publish a verified release candidate

**What to build:** Let a maintainer explicitly publish a stable GitHub Release for a nominated commit. The tag, commit, manifest, checks, and release notes identify the same release candidate.

**Blocked by:** 01 — Repair the release contract checks

**Status:** ready-for-agent

- [ ] Publication requires a valid vX.Y.Z tag resolving to the nominated full commit and a matching manifest version. A candidate without the matching changelog section is rejected.
- [ ] The exact commit must pass CI covering the complete release inventory, historical fingerprints, install behavior, and update behavior. Passing CI on a different commit cannot satisfy the gate.
- [ ] Major releases and releases with migration scripts require Henri's recorded local trial on a disposable deployed harness before publication.
- [ ] Release notes are built from the nominated commit's changelog section even if main has advanced.
- [ ] A published tag and its bytes stay fixed. A correction is published under a new version.
- [ ] A workflow test follows a candidate through publication using fixture Git history and simulated GitHub responses, including rejected candidates.
