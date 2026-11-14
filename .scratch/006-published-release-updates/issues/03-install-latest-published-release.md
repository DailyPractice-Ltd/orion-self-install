# 03: Install the latest published release

**What to build:** Let a new client install from the highest eligible stable Orion release and finish with a working radio and the exact published release identity recorded in the deployed harness.

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] Rank valid vX.Y.Z GitHub Releases by semantic version regardless of publication date or GitHub's latest designation. Exclude drafts, prereleases, and withdrawn releases.
- [x] Pin the GitHub Release ID, tag, peeled full commit hash, and manifest version. Install from the verified pinned source and recheck publication and identity immediately before the first install write.
- [x] A failed lookup, unavailable source, identity mismatch, or withdrawal before the first write stops installation. There is no branch, cache, or installed-code fallback.
- [x] Installation pauses if the enabled radio cannot be paired and confirmed working. The client can resume when pairing becomes available.
- [x] Successful installation records the tag, full commit hash, Release ID, and application time. A paused or failed install has no successful application record.


## Implementation evidence

- `install-published.mjs` is the README new-client entry. It runs `install.mjs`
  from the verified pinned checkout; the existing installer remains an explicit
  offline maintainer/test primitive.
- `update/published-release.mjs` supplies paginated semantic discovery, immutable
  identity pinning and fresh prewrite verification for this and future updater
  tickets. The withdrawal marker and public interface are documented in
  `docs/published-install.md`.
- Installation stages privately, confirms radio pairing through the real HTTP
  protocol, and atomically promotes the completed harness with `applied_release`.
  Paused requests resume their original pin, reject altered staged bytes, support
  fresh pairing after revocation, and recover an interrupted prepared promotion.
- `tests/published-install.test.mjs`: 12 CLI journeys using disposable real Git
  repositories, annotated tags, the real pinned installer, and fixture release/radio
  HTTP servers. Covers both tools, pagination, semantic ordering, eligibility,
  prewrite outage/withdrawal/retag/missing source/manifest mismatch, pairing resume,
  staged tampering and interrupted promotion recovery.
- Validation: complete `node --test tests/*.test.mjs` passed **267/267**. New source
  files must be staged for the existing deployed-journey Git-diff fixtures to include
  them; the first unstaged full run failed only those six fixture missing-source
  checks. Source files were staged and the complete suite then passed.
- Integration base merged: `de58554` (ticket 01 inventory repairs). No published
  tag, release, live radio, live client state, or external account was changed.
