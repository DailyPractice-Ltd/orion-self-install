# 01: Repair the release contract checks

**What to build:** Give maintainers a passing release contract for the current Orion inventory so a release candidate can be evaluated against the files it actually ships and the historical fingerprints deployed harnesses rely on.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The release contract passes with the current manifest and the intended shipped skill inventory.
- [ ] The contract still fails if a declared source or required historical fingerprint is missing.
