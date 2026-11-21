# 05: Preserve and replay failed work reports

**What to build:** Durable labels-only reporting with original event identity, and continued work during temporary reporting failures within the same 48-hour connection allowance.

**Blocked by:** 03 — Central guard and 48-hour connection allowance.

**Status:** revised client implementation complete; fresh local evidence is recorded in verification.md. Database and real-account verification remain deferred.

- [x] Preserve write-ahead atomic persistence, payload allowlists, original timestamps and identities, strict acknowledgments, concurrency safety and idempotent replay.
- [x] Temporary failed or partial report delivery must not immediately block subsequent work while the connection allowance is valid. It must never start or extend an allowance. Keep transport outcomes machine-readable without showing allowed-outage warnings to the user.
- [x] Only the guard's accepted verification plus complete delivery refreshes `last_connected_at`; verification with a nonempty outbox does not. A successful report send alone does not refresh it.
- [x] Invalid/revoked credentials block immediately and invalidate the allowance. Malformed/unwritable queues and cross-harness identity mismatches remain recovery failures, not outages.
- [x] Keep reports across restarts and expiry; an admitted task may finish and queue its report after the deadline. Reporting already finished work remains available while blocked.
- [x] Preserve historical identity-less reports for verified-identity attachment without authorizing new unpaired work.
- [x] Test reporting outages before/at/after expiry, repeated accepted verification with failed replay, partial replay, full recovery, lost ACKs, concurrent writers and no duplicate counts. Retain privacy and persistence-failure coverage.

## Historical candidate evidence — superseded policy

The following evidence predates the 2026-11-19 revision. It does not demonstrate the revised behavior.

## Implementation evidence

`status/report.mjs` supplies the frozen public interfaces and a pure strict payload
validator. Signals, local status checkpoints, installed Library shelf reports and
manual ambient shelf reports share write-ahead persistence and the guard's store
lock. `done.mjs` retains local text only in local logs and preserves machine result
lines. Explicit `--purpose` words remain outside the queue; only ambient shelf
labels are retained, and undelivered explicit words require a consented retry.
Wizard checkpoints retain a stable local identity and suppress handoff on failure.

Validation: eight focused public reporting/guard tests cover lost ACK and original
identity, strict ACK schemas, partial delivery, concurrent writers/replay, disabled
unpaired identity attachment, wrong-account refusal, privacy, persistence failure,
killed process recovery and fresh gate resumption. Existing radio/Library transport
fixtures now return the documented endpoint receipt schemas. The wizard failure test
first failed because the old sender handed off after failure, then passed after the
durable sender integration. Focused guard/report/setup coverage passes (60 tests).

Mono inspection confirmed the existing six-field unique replay index in
`20261005000001_task_completed.sql` and `/signals` unique-violation retry handling;
`/assets` has the `(harness_id,slug,version)` unique upsert identity. No additional
server change was needed. The mocked public replay seam demonstrates a single
server identity after lost ACK; no live DB runner was executed or claimed.

Full intermediate suite: 217 passed / 15 failed, all in the pre-existing ticket 07 legacy setup, manifest/version/pristine and fake-key fixture consistency set. No network, install, deployment or live account operation was run.
