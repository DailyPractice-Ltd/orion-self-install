# 11: Restore or update from an applied withdrawn release

**What to build:** Give an affected client the choice to restore the pre-update backup or apply a corrected release. Run recovery only when the client chooses it.

**Blocked by:** 08 — Recover when automatic restoration fails, 10 — Withdraw a published release and notify affected clients

**Status:** completed

- [x] Before restore, identify the backup and show what will be restored and which later client changes will be kept. A successful restore reinstates the prior recorded release identity while preserving and reporting later client work.
- [x] A corrected release has a new version and can apply directly when it declares a supported path from the withdrawn version. It follows the normal pinned update, conflict, and smoke-check rules.
- [x] If there is no declared path from the withdrawn version, offer pre-update backup restoration before updating. If the client defers, keep the applied release in place.
- [x] The deployed-harness journey covers both recovery choices, preservation of later client edits, and the route when a corrected release lacks a direct path.

## Implementation evidence

- Merge `88e4024` adds the restore preview and confirmation, preservation of
  later client edits, and the option to apply a corrected publication through
  a declared update path. Merge `ea9bcd8` preserves the historical fingerprint
  used for same-version backfill.
- All 312 tests passed on `ea9bcd8` with disposable loopback fixtures. The
  deployed-harness journeys cover deferral, restoration and later client
  edits, direct correction, and recovery after an interrupted restore. The
  fingerprint registry and `git diff --check` also passed.
