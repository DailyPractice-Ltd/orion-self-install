# 03: Install the latest published release

**What to build:** Let a new client install from the highest eligible stable Orion release and finish with a working radio and the exact published release identity recorded in the deployed harness.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Rank valid vX.Y.Z GitHub Releases by semantic version regardless of publication date or GitHub's latest designation. Exclude drafts, prereleases, and withdrawn releases.
- [ ] Pin the GitHub Release ID, tag, peeled full commit hash, and manifest version. Install from the verified pinned source and recheck publication and identity immediately before the first install write.
- [ ] A failed lookup, unavailable source, identity mismatch, or withdrawal before the first write stops installation. There is no branch, cache, or installed-code fallback.
- [ ] Installation pauses if the enabled radio cannot be paired and confirmed working. The client can resume when pairing becomes available.
- [ ] Successful installation records the tag, full commit hash, Release ID, and application time. A paused or failed install has no successful application record.
