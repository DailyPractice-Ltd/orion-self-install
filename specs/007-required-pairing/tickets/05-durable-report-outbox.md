# 05: Preserve and replay failed work reports

**What to build:** Work completed after a successful connection check remains honestly reportable if the radio subsequently fails. Recovery delivers the original report once before subsequent work proceeds under the required gate.

**Blocked by:** 03 — Central guard and existing-user migration.

**Status:** implemented; real deployed database/account verification remains ticket 07

- [x] Persist failed operational reports in an atomic, durable local outbox, preserving their original event time, operational labels, and bridge event identity.
- [x] Validate an explicit payload allowlist. Never place local work-log text, message content, prospect information, credentials, or other business content in the outbox or radio payload.
- [x] Route all operational signal producers through the shared reporting behavior so no supported reporting path silently discards a finished-work report.
- [x] Mark the connection as needing recovery after report failure. Under the required gate, subsequent Orion work pauses until verification and outbox delivery succeed; preserve the agreed existing-user grace behavior.
- [x] After successful verification, replay pending reports before authorizing work and remove only acknowledged entries. Use the existing bridge identity so retries and lost acknowledgements cannot inflate counts.
- [x] Preserve reports across process restart and interruption. Concurrent writers/replayers must not lose entries or authorize work while unresolved reports remain; malformed or unwritable outbox state gets an actionable recovery result.
- [x] Retain local work logging independently without transmitting its text.
- [x] Test failure after a successful pre-work check, restart, repeat replay, lost acknowledgement, partial delivery, persistence failure, labels-only validation, and resumption after delivery. Prove no duplicate server count, addressing any server race exposed by the tests.
- [x] Update replay contracts alongside any server change and keep monorepo changes on `feature/required-pairing`.


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
