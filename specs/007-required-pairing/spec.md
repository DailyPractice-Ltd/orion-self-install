# Require Daily Practice pairing and active radio for Orion

**Policy revision approved: 2026-11-19.** This specification supersedes the candidate’s 30-day migration and immediate outage-pause policy. The revised client behavior is not implemented or verified yet; earlier passing tests are historical evidence only.

## Goal

A supported Orion install completes only after its folder is paired to a signed-in Daily Practice account and the connection is verified. A paired harness checks the connection before every interactive task and scheduled agent shift. Temporary connection or reporting failures permit work for up to 48 hours after the last successful verification and delivery of all queued reports. At expiry, new work pauses until the connection recovers. Invalid or revoked credentials pause new work immediately.

This is a supported-flow gate in a user-owned local folder, not tamper-proof licensing. A user can edit local files or bypass an AI prompt. Do not claim otherwise.

## Decisions

- Pairing and ongoing check-ins are required for supported Orion use.
- New and existing unpaired harnesses must pair before normal work, including on the first run after updating. There is no migration grace period.
- Paired harnesses may continue through temporary network, server, or reporting failures while `now < last_connected_at + 48 hours`. Reset `last_connected_at` only after accepted verification and acknowledged delivery of all pending reports. Failed attempts, partial replay, restarts and updates never reset it.
- Invalid or revoked credentials, disabled radio, and unsafe local state do not qualify for the connection allowance. Troubleshooting, repair, updating, and re-pairing remain available while blocked.
- Show no outage notices, countdowns or repeated alerts while work is allowed. Explain the connection issue and next recovery action only when it blocks new work.
- A task admitted before expiry may finish and report afterward. Check again before the next task or scheduled run; do not interrupt an underway task at the deadline.
- A signed-in Daily Practice account issues a self-service, short, single-use pairing code. Pairing establishes account linkage only; it does not check payment or subscription status.
- Website-only and paste-only chat cease to be supported install paths because they cannot execute the pairing and connection checks.
- The radio continues to carry its current operational metadata. This requirement does not expand the payload.
- Keep the installer explanation short. Approved wording: **“Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.”**

## Original pre-feature behavior to replace (historical baseline)

- `start.mjs` permits `--checkins no`, blank or invalid codes, failed pairing, and a handoff in all those cases.
- `AGENTS.md`, `docs/radio.md`, `README.md`, the adapter docs, the 002 spec and contracts, and constitution Article V promise a one-click decline and unchanged work when the radio is off.
- `status/shapes.mjs` treats a well-shaped local key as configured, which is not proof that the server accepts it.
- Radio calls currently fail open. `status/done.mjs` logs an unreachable or refused report after completing work.
- The pure website chat path cannot run the scripts.
- The deployed bridge contract is described in `specs/002-production-line/contracts/bridge-radio.md`. Confirm the actual current server contract in the separate Daily Practice repository before changing the client.

## Required behavior

### 1. Account and pairing

Provide a signed-in Daily Practice page that issues a one-time pairing code for this account. Keep the existing short code exchange and server-derived harness identity unless current server evidence requires a change. Show the code's expiry and a way to request a fresh one. Do not expose or ask the user to paste an install token.

The installer obtains the code, exchanges it with Daily Practice, stores the returned token in the existing appropriate location (`status/status.json` or `status/radio.key` for a homed folder), and verifies that the server accepts it. A local key shape, stored `paired_at`, or HTTP exchange alone is insufficient to mark pairing complete. Persist a resumable, explicit pairing and verification state in the status schema. Never print or log the token.

A new install with no code, an expired or invalid code, an unreachable bridge, or rejected verification remains in setup. It gives a specific recovery instruction and does not print the day-to-day agent handoff or mark installation complete. Resume without re-asking earlier setup answers. Direct conversational installs follow the same gate.

### 2. Connection check and pause

Before every supported interactive task and scheduled shift, attempt an authenticated server check before Orion work. The check must distinguish accepted, revoked or invalid credentials, unreachable service, and other server errors. Use a side-effect-free endpoint or prove that an existing endpoint is safe for this purpose; a health check must not silently consume support messages.

On accepted verification, attempt delivery of all pending radio reports. Only accepted verification plus a successfully empty outbox refreshes the durable `last_connected_at` timestamp. Temporary network, server, or reporting failures permit work silently within 48 hours of that timestamp; a stored credential or verification time alone is insufficient. At the exact deadline or with no qualifying timestamp, pause new tasks and shifts. Invalid/revoked credentials pause immediately and invalidate the saved allowance; disabled radio and malformed/unwritable state also block work. Give one plain-language reason and next action only when work is blocked. Diagnosis, code renewal or re-pairing, status inspection, updating, and other recovery steps remain available. A task admitted before expiry may finish and queue its report afterward; the deadline applies at the next task boundary.

If a report fails **after** a successful pre-work check, preserve its operational labels and original event time in a durable local outbox, mark the connection as needing recovery, and allow subsequent work only within the same remaining 48-hour allowance. Pending reports do not create a separate immediate blocker or a new clock. Accepted verification with failed or partial delivery does not refresh the timestamp. Replay idempotently using the bridge's existing event identity; never include local work-log text or business content in the outbox or radio payload. Do not silently discard finished-work reports.

Centralize the gate so wizard, stage transitions, direct script entry points, hired-agent scheduling, and agent instructions agree. Document the unavoidable limitation for generic user-edited local AI prompts and scripts.

### 3. Existing harnesses and persisted connection state

Apply the same pairing rule to all harnesses immediately on their first updated run. Remove existing-harness progress detection, migration clocks, deadline reminders, and the 30-day exception. Ignore any saved migration fields for authorization; preserve old data compatibly rather than treating a recorded deadline as permission to work.

An already paired, enabled harness can verify and deliver its queued reports with its existing credential, without a new code. This establishes `last_connected_at` and the 48-hour allowance. Do not infer that timestamp from old migration or verification fields: a candidate upgraded during an outage needs one successful verification and outbox delivery before it can use the new allowance. Preserve a prior `radio_choice: "declined"`; only explicit pairing changes that choice.

Persist the connection timestamp under the same lock as verification and outbox state. Use elapsed UTC hours, including across time zones and daylight-saving changes. At `now == last_connected_at + 48 hours`, new work is blocked unless the current connection check and delivery succeed. Malformed or future connection timestamps require recovery, never a fresh allowance. Local files and clocks remain user-editable; this is supported-flow policy, not an anti-tamper mechanism.

### 4. Disclosure and documentation

Record the constitution amendment **in writing** before implementation. Article V in the earlier candidate requires pairing, a 30-day existing-user transition, and immediate pause after connection/reporting failure. The revised amendment must state the rationale, effect on installs already underway, immediate pairing, and the silent 48-hour connection allowance. The maintainer confirmed this revision on 2026-11-19; align the ratified constitution with it before changing release behavior. Preserve the original approval evidence under the constitution's Amendment Process. Update the linked spec, status schema, bridge contract, installer brief, radio guide, README, adapters, and validation instructions in the same release. Remove all contradictory “skip”, “decline”, “radio off changes nothing”, and “website chat always works” promises. Keep the short approved explanation in the setup flow; put the precise operational-data disclosure in the radio guide.

### 5. Verification

Automated tests must cover at least:

- New install: no code, malformed, expired or reused code, network failure, exchange success but failed verification, and full success; only full success produces a handoff.
- Resumption after interruption at each pairing step; token never appears in output or logs.
- Existing paired, unpaired, and previously declined harnesses: immediate pairing gate, credential reuse, ignored legacy migration fields, and no fabricated allowance on upgrade.
- Interactive tasks and scheduled shifts: accepted checks, temporary failures before/at/after the 48-hour boundary, immediate invalid/revoked refusal, disabled radio, and malformed/future connection state. No notices while work is allowed; a clear recovery action when blocked.
- Failed/partial reporting never refreshes the clock even if verification succeeds; empty acknowledged delivery does. Restarts, repeated failures and updates never extend the allowance. Revocation invalidates it until accepted verification and delivery recover.
- A task admitted before expiry finishes and records its report after expiry; the next task or shift is blocked.
- A report failure after work: durable labels-only outbox, no duplicate server count on replay, and resumption after delivery.
- Homed folders with `status/radio.key` and cloud-attached credentials where applicable.
- Documentation and contract consistency and the removed website-only path.
- A live end-to-end check against a real Daily Practice account and bridge before claiming the feature works.

## Implementation order and done criteria

1. Preserve the existing self-service issuance and side-effect-free verification contract; complete its outstanding server/database/live verification. This policy revision requires no new server endpoint.
2. Align the ratified constitution and linked status/bridge contracts with the confirmed written amendment and target version-2 pairing schema.
3. Replace the migration with the 48-hour connection policy in the centralized local guard, then apply it to wizard, sessions, scheduled work, and radio reporting.
4. Update all user-facing copy and adapters; run automated tests and the live account and bridge check.

Done when a new user can obtain a code without support, a verified pairing is required for handoff, unpaired users are blocked immediately, paired users work silently through temporary failures for at most 48 hours since verified connection and completed report delivery, invalid/revoked credentials block immediately, expiry blocks the next task or shift, and successful recovery resumes work without lost or duplicate radio reports.
