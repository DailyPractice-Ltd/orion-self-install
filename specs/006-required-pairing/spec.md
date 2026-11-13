# Require Daily Practice pairing and active radio for Orion

## Goal

A supported Orion install completes only after its folder is paired to a signed-in Daily Practice account and the connection is verified. A paired harness checks the connection before every interactive Orion session and scheduled agent shift. If the check fails, Orion work pauses until the connection returns.

This is a supported-flow gate in a user-owned local folder, not tamper-proof licensing. A user can edit local files or bypass an AI prompt. Do not claim otherwise.

## Decisions

- Pairing and ongoing check-ins are required for supported Orion use.
- A failed connection check pauses Orion work immediately. Troubleshooting, repair, updating, and re-pairing remain available.
- Existing harnesses get 30 days from their **first run of the updated version** to pair and enable the radio. Record that start time durably; do not restart the clock on later runs or updates.
- A signed-in Daily Practice account issues a self-service, short, single-use pairing code. Pairing establishes account linkage only; it does not check payment or subscription status.
- Website-only and paste-only chat cease to be supported install paths because they cannot execute the pairing and connection checks.
- The radio continues to carry its current operational metadata. This requirement does not expand the payload.
- Keep the installer explanation short. Approved wording: **“Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.”**

## Current behavior to replace

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

At the start of every supported interactive session and before every scheduled shift, perform an authenticated server check before Orion work. The check must distinguish accepted, revoked or invalid credentials, unreachable service, and other server errors. Use a side-effect-free endpoint or prove that an existing endpoint is safe for this purpose; a health check must not silently consume support messages.

On any failed check, pause Orion tasks, outbound messages, CRM writes, and scheduled shifts. Allow only diagnosis, code renewal or re-pairing, status inspection, updating, and other recovery steps. Give one plain-language reason and next action. On a successful check, resume normally and deliver any pending radio reports before new work.

If a report fails **after** a successful pre-work check, preserve its operational labels and original event time in a durable local outbox, mark the connection as needing recovery, and pause subsequent Orion work until the outbox is delivered. Replay idempotently using the bridge's existing event identity; never include local work-log text or business content in the outbox or radio payload. Do not silently discard finished-work reports.

Centralize the gate so wizard, stage transitions, direct script entry points, hired-agent scheduling, and agent instructions agree. Document the unavoidable limitation for generic user-edited local AI prompts and scripts.

### 3. Existing harness migration

On the first run of the updated version, record a one-time migration start timestamp and 30-day deadline for an existing harness. Show the changed requirement and the approved explanation, plus the self-service pairing route. During the 30 days, support existing work while showing a concise reminder at session start; keep the existing radio behavior where connected. At expiry, apply the same pairing and connection gate as new installs. An already paired harness with a valid, enabled radio satisfies migration without a new code. A revoked token or disabled radio requires recovery. Do not silently flip a prior `radio_choice: "declined"` to `"accepted"`; record the new state explicitly after the user completes pairing.

Specify clock handling and test the deadline boundary. Local timestamps can be edited, so this migration is a supported-flow policy, not an anti-tamper measure.

### 4. Disclosure and documentation

Propose the constitution amendment **in writing** before implementation: Article V currently guarantees an optional, switchable-off radio with no effect on use. The amendment must state the changed principle, rationale, effect on installs already underway, and migration. Daily Practice maintainer approval is required by the constitution's Amendment Process. Update the linked spec, status schema, bridge contract, installer brief, radio guide, README, adapters, and validation instructions in the same release. Remove all contradictory “skip”, “decline”, “radio off changes nothing”, and “website chat always works” promises. Keep the short approved explanation in the setup flow; put the precise operational-data disclosure in the radio guide.

### 5. Verification

Automated tests must cover at least:

- New install: no code, malformed, expired or reused code, network failure, exchange success but failed verification, and full success; only full success produces a handoff.
- Resumption after interruption at each pairing step; token never appears in output or logs.
- Existing paired, unpaired, and previously declined harnesses; first-run migration clock, 30-day boundary, and no clock reset.
- Paired session and scheduled shift with accepted, revoked, unreachable, and server-error checks; no Orion work on failure.
- A report failure after work: durable labels-only outbox, no duplicate server count on replay, and resumption after delivery.
- Homed folders with `status/radio.key` and cloud-attached credentials where applicable.
- Documentation and contract consistency and the removed website-only path.
- A live end-to-end check against a real Daily Practice account and bridge before claiming the feature works.

## Implementation order and done criteria

1. Confirm the server contract and implement self-service code issuance plus an authenticated, side-effect-free verification route in Daily Practice.
2. Write and approve the constitution amendment and update the client-side status and bridge contracts.
3. Implement the migration and centralized local guard, then apply it to wizard, sessions, scheduled work, and radio reporting.
4. Update all user-facing copy and adapters; run automated tests and the live account and bridge check.

Done when a new user can obtain a code without support, a verified pairing is required for handoff, a failed check visibly pauses interactive and scheduled Orion work, existing users get their one-time 30-day transition, and successful recovery resumes work without lost or duplicate radio reports.
