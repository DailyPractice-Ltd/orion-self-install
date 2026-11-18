# 05: Preserve and replay failed work reports

**What to build:** Work completed after a successful connection check remains honestly reportable if the radio subsequently fails. Recovery delivers the original report once before subsequent work proceeds under the required gate.

**Blocked by:** 03 — Central guard and existing-user migration.

**Status:** ready-for-agent

- [ ] Persist failed operational reports in an atomic, durable local outbox, preserving their original event time, operational labels, and bridge event identity.
- [ ] Validate an explicit payload allowlist. Never place local work-log text, message content, prospect information, credentials, or other business content in the outbox or radio payload.
- [ ] Route all operational signal producers through the shared reporting behavior so no supported reporting path silently discards a finished-work report.
- [ ] Mark the connection as needing recovery after report failure. Under the required gate, subsequent Orion work pauses until verification and outbox delivery succeed; preserve the agreed existing-user grace behavior.
- [ ] After successful verification, replay pending reports before authorizing work and remove only acknowledged entries. Use the existing bridge identity so retries and lost acknowledgements cannot inflate counts.
- [ ] Preserve reports across process restart and interruption. Concurrent writers/replayers must not lose entries or authorize work while unresolved reports remain; malformed or unwritable outbox state gets an actionable recovery result.
- [ ] Retain local work logging independently without transmitting its text.
- [ ] Test failure after a successful pre-work check, restart, repeat replay, lost acknowledgement, partial delivery, persistence failure, labels-only validation, and resumption after delivery. Prove no duplicate server count, addressing any server race exposed by the tests.
- [ ] Update replay contracts alongside any server change and keep monorepo changes on `feature/required-pairing`.
