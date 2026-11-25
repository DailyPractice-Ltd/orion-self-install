# Revised constitution amendment: required pairing and connection allowance

**Revision approved: 2026-11-19.** The maintainer confirmed the revised policy after the design interview. This written revision supersedes the original 30-day transition and immediate outage-pause policy below. The revision is now ratified in constitution 2.1.0 and implemented in the local client; verification.md records fresh automated evidence and the deferred database/live requirements.

## Principle changed

Supported Orion use requires verified account pairing. New and existing unpaired harnesses must pair before normal work, including on the first run after updating. There is no migration grace period. Existing paired harnesses reuse their credentials without a new code when accepted by the server.

Before each interactive task or scheduled shift, attempt authenticated verification and delivery of queued operational reports. Temporary network, server or reporting failures permit work for up to 48 elapsed hours after the last successful verification and complete report delivery. Failed attempts, partial replay, restarts and updates never renew that allowance. Revoked or invalid credentials block immediately and invalidate the allowance. A disabled radio or unsafe local state also blocks work.

At expiry, pause new tasks and shifts; a task already admitted may finish and report. Show no outage notices while work is allowed. When work is blocked, explain the reason and next recovery action. Diagnosis, status inspection, updating, code renewal and re-pairing remain available.

## Rationale and disclosure

The account link supports each harness, delivers updates and records operational activity. A 48-hour allowance accommodates temporary connection issues without losing finished-work reports: save labels locally and replay them with their original identity and time. Only a successful verification-and-delivery cycle resets the clock.

The Intelligence Library remains separately optional. The radio payload and per-item consent for client words and artifacts are unchanged. Keep the approved short pairing explanation in setup and the precise operational-data disclosure in the radio guide. Website-only and paste-only chat remain unsupported for installation and execution. Editable local files and clocks make this supported-flow policy, not tamper-proof licensing or a payment gate.

## Existing installations and implementation

Remove migration eligibility detection, countdowns and reminders. Historical migration fields remain readable but never authorize work. Do not manufacture a connection timestamp from an old migration or verification timestamp; establish it with accepted verification and complete delivery. Preserve a declined radio choice until explicit pairing.

Align Article V, the linked contracts, client state/schema, guard, setup, reporting, work entry points, user guides and validation in the implementation pass. Tests and live evidence for the old candidate do not validate this revision.

## Historical approval and superseded wording

The following records the original approval and rationale; its 30-day transition and immediate outage pause are superseded by the revision above.

**Status:** Approved by the Daily Practice maintainer in this implementation session. The pre-existing approval evidence below authorizes restoration of the historical self-install constitution (v1.4.0 from `feffff9^`) and the Article V amendment in `.specify/memory/constitution.md` version 2.0.0. This maintainer source is not deployed to client folders.

## Principle changed

Replace Article V's optional radio master switch with a required, disclosed operational connection for supported Orion use. A supported install must pair to a signed-in Daily Practice account and verify its credential with the server. Each interactive session and scheduled shift must pass an authenticated connection check before Orion work begins. A failed check pauses Orion work; diagnosis, updating, re-pairing, and other recovery remain available. The Intelligence Library signal remains a separate, optional channel. The radio's current payload tiers and per-item consent for client words and artifacts remain unchanged.

## Rationale

Daily Practice needs a verified account link to support each installed harness, deliver updates, and know when it is running. A local key's shape does not prove that the server accepts it. Continuing work after a failed check also loses work reports and can leave Daily Practice's view of a running harness inaccurate. This is a supported-flow rule in a user-owned folder; it is not tamper-proof licensing or a payment check.

## Effect on installs already underway

Existing harnesses receive 30 days from their first run of the updated version to pair and enable the radio. The start and deadline are written once to their local status file and survive later runs and updates. During that period they can keep working with a concise reminder. At the deadline the new gate applies. A previously declined radio choice remains recorded as declined until the user explicitly pairs; it is never silently changed. An already paired, enabled harness passes migration when the server accepts its credential.

## Migration and disclosure

The installer says: “Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.” The radio guide continues to list exactly which operational labels cross the connection. Website-only and paste-only chat paths cease to be supported because they cannot perform the check. The schema, bridge contract, installer instructions, adapters, and validation guide change in the same release. Local timestamps are editable; the 30-day transition is a supported-flow policy, not an anti-tamper measure.

**Approval recorded:** The Daily Practice maintainer explicitly approved this written amendment before the ratified Article V and release behavior changed.
