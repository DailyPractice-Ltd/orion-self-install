# 09: Show one radio notice for the newest eligible release

**What to build:** Let a paired harness with check-ins enabled hear once about the newest published release it can take, with enough context to decide when to request an update.

**Blocked by:** 06 — Apply declared migrations and verify legacy identity

**Status:** completed

- [x] The bridge uses applied version and declared compatibility to select the newest eligible release newer than the harness's applied version. When several releases were missed, it selects only the newest eligible one.
- [x] The structured payload carries version, tag, full commit hash, Release ID, a short summary from the pinned changelog, and the full-notes link.
- [x] On radio check, the harness displays the version, summary, notes link, and “Say 'update my harness' when you're ready.” The commit hash and Release ID stay in the payload.
- [x] Retry delivery until display is durably recorded. Repeated checks and delivery retries do not display a recorded notice again. A later eligible release can receive its own notice.
- [x] Unpaired harnesses and harnesses with check-ins disabled receive no release notice. Display leaves the installed release and client files alone, apart from the notice record, and neither requires a reply nor starts an update.

## Implementation evidence

- Client merge `2267d59` integrates radio display and local receipt handling.
  The 304-test client suite passed with loopback HTTP fixtures. Tests cover a
  failed acknowledgement followed by a retry without a repeat display, radio
  opt-out and unpaired clients, and explicitly requesting the announced release
  when a higher version is published. The fingerprint registry and
  `git diff --check` passed.
- Bridge commit `5d6eaa1` on `dailypractice-mono` branch
  `spec-006-release-notices` adds the authenticated offer and display endpoints,
  pinned publication checks, compatibility selection, and the notice-receipt
  migration. The Enablement unit suite passed all 344 tests. Targeted lint,
  TypeScript, and the Next.js compile build passed.
- A cross-repository smoke ran the real radio client through the Bridge route
  handlers with fixture GitHub and Supabase responses. The smoke and the two
  suites used fixture data. Deployment and the live migration were outside
  this verification.
