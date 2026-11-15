# 10: Withdraw a published release and notify affected clients

**What to build:** Let a maintainer withdraw a published release and inform paired harnesses that heard about it or applied it. The release remains auditable and any harness that already applied it waits for its client's recovery decision.

**Blocked by:** 09 — Show one radio notice for the newest eligible release

**Status:** completed

- [x] The maintainer can persist withdrawal without changing the release tag or commit. Discovery and the immediate prewrite check both reject the withdrawn release.
- [x] The bridge sends a distinct withdrawal notice to paired harnesses recorded as notified of or as applying that release. The harness says whether it applied the release and gives the next safe action.
- [x] A withdrawal notice suppresses any pending offer for that release and leaves the harness files and applied identity in place.
- [x] The published-release and radio journeys cover a withdrawal after discovery but before the first write, and notices for both notified-only and applied harnesses.

## Implementation evidence

- Client merge `ca376b8` adds the maintainer withdrawal workflow and the radio
  notice. All 309 tests passed with disposable loopback fixtures. They cover
  withdrawal before the first harness write, suppression of the old offer,
  and guidance for notified-only, currently applied, and previously applied
  releases. The fingerprint registry and `git diff --check` passed.
- Bridge commit `1128716` on `dailypractice-mono` branch
  `spec-006-release-notices` sends and acknowledges withdrawals for affected
  paired harnesses. The focused Bridge notice tests and the full Enablement
  unit suite passed. Verification used fixtures throughout.
