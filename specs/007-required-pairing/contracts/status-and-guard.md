# Contract: required pairing and work guard

**Policy approved and client implementation aligned 2026-11-19.**
Constitution 2.1.0 ratifies this revision. See verification.md for fresh local
evidence and the deferred database/live requirements. Client schema remains 2.0.0;
the nested pairing marker advances to version 2.

## Server contract and evidence

Confirmed against mono `b4ebd5b0f0408775bcb4f3701f85fde1f43c682e`,
`specs/005-radio/contracts/radio.md`, `specs/002-intelligence-bridge/contracts/bridge.ts`,
`apps/enablement/app/api/bridge/{pair,pairing-code,verify}/route.ts`, and
`20261118000001_self_service_pairing.sql`. Focused route/component tests (20) and
server typecheck passed. Database concurrency runner exists but was not executed;
real account verification and deployment remain ticket 07 requirements. This is
implementation evidence, not a claim that the new routes are live.

- Human page `/home/pair`: signed-in account, explicit issue/renew. Browser
  `POST /api/bridge/pairing-code` requires verified session and exact same-origin
  Origin, accepts no caller account/harness identity, returns 200
  `{ "code": "BCDF-GHJK-LMNP", "expires_at": "2026-11-18T12:15:00.000Z" }`.
  401 sign in, 403 cross-origin, 503 service failure; `Cache-Control: no-store`.
  Creates owned draft harness if needed or reuses newest owned harness, preserves
  profile/roles, supersedes unclaimed codes, expires after 15 minutes; no payment check.
- `POST {bridge_url}/pair`, unauthenticated JSON `{code}`: 12 consonants,
  separators/case normalized. Transactional single-use redemption returns 200
  `{install_token,harness_id,bridge_url}`. 400 malformed, 404 unknown/expired/used/
  superseded (indistinguishable), 429 throttled, 503 service failure. Database
  rollback permits retry; a lost successful response may require a fresh code.
- `GET {bridge_url}/verify`, bearer credential: 200
  `{ "status": "accepted", "harness_id": "<expected folder harness>" }`;
  401 missing/invalid/revoked, 503 database/runtime failure, all no-store. Reads only:
  no contact, version, activity or message writes. Never use `/nudges` for verification.
- Network exception/timeout is `unreachable`; any unexpected HTTP status or malformed
  200 body is `server_error`. A mismatched accepted harness is `invalid`: recover the
  credential/folder association, never overwrite local identity from that response.
  Do not log credentials, code responses, raw server errors or database details.

## Persistent pairing and credential recovery

`sharing.pairing` has `version: 2`, `state` (`unpaired`, `exchanged`,
`verified`), nullable `verified_at`, `last_check` (null, `accepted`, `invalid`,
`unreachable`, `server_error`), and nullable `last_connected_at`. See
`pairing.schema.json`. Timestamps are full ISO UTC instants, not date-only.
`verified_at` records accepted authentication; `last_connected_at` records the
completed verification-and-delivery cycle that starts the connection allowance.

Exchange stores identity/key durably before `exchanged`; only matching accepted
verification sets `verified` and `verified_at`. No code/verification failure may
finish setup or print handoff. Setup still needs current accepted verification
and acknowledged setup reporting; the allowance never completes installation.
`state: verified` alone is not authorization. Failed temporary checks preserve the
last successful connection time; invalid/revoked credentials clear
`last_connected_at` so a later outage cannot revive an invalidated allowance.

Ordinary folders store key in `sharing.install_token`. Homed folders keep it only
in machine-local `status/radio.key` (0600 where supported), with status token null;
never commit the key to home. Existing resolver precedence remains environment
`ORION_INSTALL_TOKEN`, radio.key, status token. Cloud-attached execution may omit
Authorization locally only where the established cloud environment attaches it;
it still must receive matching server acceptance. Do not infer attachment from
missing local keys. Never print even a token suffix. Atomic key/status persistence
uses the shared lock. Resume after stored exchange by verifying it, without asking
previous answers. A spent code with no recoverable saved key requires a new code.
An interrupted key/status write must pause/recover, not silently claim pairing.

## Immediate pairing and 48-hour connection allowance

No existing-harness progress detection or 30-day transition remains. New and
existing unpaired harnesses pause normal work until explicit pairing. Preserve
`radio_choice: declined` until explicit pairing; checking existing credentials
must not rewrite the choice. An already paired enabled folder can use its current
credential without a new code.

Upgrade absent/version-1 pairing state to version 2 under the shared lock. Keep
legacy migration fields readable but inert; do not create or honor their clocks.
Do not derive `last_connected_at` from `verified_at` or migration timestamps.
Without a saved qualifying connection time, the first updated run needs accepted
verification and complete queued-report delivery. Unknown marker versions or
malformed active state require recovery rather than a replacement allowance.

Every task/shift guard attempts verification. If accepted, attempt replay. Refresh
`last_connected_at` to the completed cycle's current time only after all reports
are acknowledged and the outbox is empty, under the same lock. Acceptance alone,
partial replay, failed reporting, updates and restarts never refresh it. Empty
outboxes need no report request: accepted verification and confirmed emptiness
are sufficient. Report send success outside this guarded cycle does not itself
refresh the clock.

For temporary `unreachable`/`server_error` verification or reporting failures,
allow work only with prior verified pairing, enabled radio, valid local state,
and `last_connected_at <= now < last_connected_at + 48 * 60 * 60 * 1000`.
Use elapsed UTC time; at the exact deadline pause new work unless the current
verification-and-delivery cycle succeeds. Missing, malformed or future connection
times cannot grant an allowance. Invalid/revoked credentials, mismatched folder
identity, disabled radio, corrupt/unwritable status or queue, and unsafe locks
pause immediately regardless of the timestamp. Never treat them as outages.

Show no connection notice or countdown while allowing work, including scheduled
runs. Record operational state locally without sending repeated outage alerts.
When blocking, give one plain reason and recovery action. Recovery remains
available. A task admitted before expiry may finish, perform its already-authorized
actions and report afterward; the next task or shift must run the guard again.
The guard does not hold a lock or enforce a mid-task deadline during sales work.
Updates or failures never start a new allowance. Local clocks/files are editable;
this is supported-flow policy rather than tamper-proof licensing.

## Shared runtime interfaces (tickets 03–05)

- `status/guard.mjs` exports
  `checkWork({root, now = () => new Date(), fetchImpl = globalThis.fetch, replay = true, scope = true})`
  -> Promise `{allow, reason, allowance, deadlineAt}` (target structured outcome;
  replacing the old migration-oriented `grace` field).
  reason is plain language, deadlineAt nullable ISO. `node status/guard.mjs check
  [--quiet]` exits 0 allow, 2 pause. Allowed results show no outage notice, with
  or without quiet mode. Quiet also suppresses routine success. Blocking results
  remain actionable. `replay:false` is for controlled setup verification only;
  it neither refreshes the connection clock nor grants work permission.
- `runWork({root,command,args,now,fetchImpl})` and
  `node status/guard.mjs run -- <command> [args]` admit a command invocation once.
  A random capability in its descendant environment reaches a live loopback
  listener owned by the parent, bound to this canonical folder. After the command
  exits the listener closes; a saved environment cannot authorize later tasks.
  Nested checks validate local state, known credential refusal, radio enablement
  and queue identity, without imposing another deadline or network gate.
  Failure to open the local listener prevents effects and gives a recovery action.
  Setup passes `scope:false` for its final check and always verifies currently.
  For interactive connector tasks, check once at task admission, finish authorized
  actions and reporting, then check again at the next task boundary. Compose
  scripted tasks inside the runner rather than a separate check followed by
  independent nested gates. This is supported-flow scope, not a security boundary
  against user-edited programs or credentials.
- `status/store.mjs` exports `withStatusLock(root, async store => result)`;
  store exposes `readStatus()`, `writeStatus(status)`, `readOutbox()`,
  `writeOutbox(entries)`. Reads/writes are awaited-compatible. All guard, pairing,
  reporting and replay mutations use this shared cross-process lock. No recursive
  acquisition. Invalid files, lock contention timeout and write failure surface
  recovery errors; never replace corrupt data with empty defaults. Missing outbox
  alone means empty. Atomic same-directory temporary writes + rename preserve
  previous valid contents; durable flush before claiming success. Stale locks may
  be recovered only when owner death is established, never just an old timestamp.
  This implementation waits five seconds then pauses: it does not reclaim locks
  automatically. For interrupted-process recovery, inspect
  `status/.radio-lock/owner.json`, establish that its PID on its named host has
  stopped (or stop that command), and only then remove that lock directory. Never
  remove an active/unknown owner's lock or replace status/outbox files. Leftover
  same-directory `.tmp` files are never read as committed state.
- `status/report.mjs` exports
  `reportSignal({root,signalType,payload,occurredAt,fetchImpl})`,
  `reportAsset({root,asset,fetchImpl})`, `replayOutbox({root,fetchImpl})`, and
  `replayOutboxLocked(store,{status,fetchImpl,now})`, and pure
  `validateOutbox(entries)` (throws on invalid envelopes or labels). Guard validates
  pending entries before checking connectivity, including while the connection
  allowance is active. Optional fetchImpl defaults to global fetch; absent
  occurredAt is allocated once at original report creation.
  Wrappers obtain the store lock; guard calls the Locked sibling while holding it.
  Return `{status: 'sent'|'queued'|'off'|'invalid', pending}` plus plain reason as
  needed. Replay reports sent only if no entries remain. No reporting function
  calls guard. Preserve machine-readable reporting outcomes consumed by done.mjs;
  do not surface temporary transport warnings to the user while work is allowed.

Verification, replay and final pending inspection remain inside one lock before
allow returns. Report writers hold it across write-ahead/send/ack removal. A writer
cannot disappear behind a stale snapshot or be lost by another process's rewrite.
This is a point-in-time pre-work decision, not a lock held for the whole sales task.

## Durable labels-only outbox

`status/radio-outbox.json` is an array of typed `{kind, body}` envelopes, not raw
signal bodies. `kind` is `signal` (/signals) or `asset` (/assets). Never tokens,
URLs, log lines, notes, client words/files or arbitrary payload keys. Before any
network attempt, validate and atomically persist the complete original envelope
under lock (even when disconnected/disabled); then send if configured. Return off
when disabled with the labels still pending. A failed save prevents a send and
returns actionable recovery. No item cap may silently discard finished work.

Signal body allowlist: harness_id, signal_type, occurred_at, payload. Payload
allowlist: ops_stage, harness_status, template_version, tag, count, routine, asset,
asset_kind, asset_version, outcome, surface. Validate stages/status against their
menus, type against eight supported signal types, tag against WORK_TAGS, counts
as nonnegative integers (task_completed >=1), routine/asset as public slug labels,
asset_kind against capability kinds, outcome/surface against bridge enums, versions
as bounded version labels. No legacy free-form routine enters the ambient queue;
reject it visibly for repair. Task requires tag/count; routine requires routine/count;
asset requires outcome/surface. Flat scalar labels only, <=20 keys and <=2 KB.
Optional harness_id may be absent for historical queued reports or setup reporting
before verified identity is available: freeze all other identity fields, then attach
the verified folder identity once at delivery. This does not authorize unpaired work.
Never replay a recorded harness_id through a different credential/account: pause
for explicit recovery rather than reassign it.

Asset body allowlist: harness_id, slug, kind, version, installed_at, optional role.
slug/role are labels; kind is agent/skill/workflow/crm_template/program. Preserve
original installed_at and version. **purpose is Tier 3 and excluded**: keep existing
per-item preview/consent path separate; never queue words as ambient labels. Messages,
replies, contributions and Library participation also remain outside this queue.

Replay sends the original body/time, sequentially, to its fixed kind endpoint.
Signal replay identity is `(harness,type,occurred_at,routine,asset,tag)`; absent
labels match null, not empty. Server unique constraint resolves concurrent retries
without extra counts. Asset identity is `(harness,slug,version)` via server upsert.
Only 201 `{signal_id,recorded_at,replay:false}` or 200 with replay:true acknowledges
signals; assets use asset_id/reported_at instead. Require nonempty ID, valid full
receipt timestamp, boolean matching status, parsed endpoint-specific response.
Correlate to the exact in-flight envelope: responses do not echo event identity.
Any malformed/missing/lost ACK keeps the original envelope. Remove only that
acknowledged entry atomically; interruption after send/removal failure retains it
for safe replay. Stop on failure, preserve remaining entries and mark last_check
invalid/unreachable/server_error as appropriate. Temporary delivery failures with
pending entries allow new work only within the remaining 48-hour connection
allowance. Invalid/revoked credentials block immediately.
Successful verification alone never clears pending reports or refreshes the clock.

A valid queued example (local work-log text is deliberately absent):

```json
[
  {
    "kind": "signal",
    "body": {
      "signal_type": "task_completed",
      "occurred_at": "2026-11-18T12:00:00.000Z",
      "payload": { "ops_stage": "formalised", "harness_status": "running", "template_version": "2.0.0", "tag": "research", "count": 1 }
    }
  },
  {
    "kind": "asset",
    "body": {
      "slug": "call-planner",
      "kind": "skill",
      "version": "1.0.0",
      "installed_at": "2026-11-18T11:59:00.000Z"
    }
  }
]
```

## Release alignment and limits

Ticket 07 aligns README, AGENTS, agent definition/adapters, docs/radio.md,
docs/scheduled-work.md (including legacy native prompt migration), docs/updating.md,
validation, 001 install/data-model contracts, 002 spec/agent-anatomy, demos and
CHANGELOG. Ticket 04 owns start.mjs; ticket 05 supplies reporting helper integration.
New runtime modules ship through both manifest refresh and common_sources. Pairing
and outbox data remain client-owned; updates never replace them. Constitution is
maintainer-only source. Editable local files/prompts cannot enforce tamper-proof
licensing; this is supported-flow account pairing, never a payment gate.

Setup additionally records optional local `status.setup_checkpoint` progress with
`harness_id`, original `occurred_at`, frozen labels-only `payload`, and boolean
`delivered`. This marker is outside `sharing.pairing`; it is neither a credential
nor authorization. The wizard creates it under the shared lock before reporting,
uses its original identity on recovery, and marks it delivered only after an
acknowledged empty outbox and unchanged accepted folder association. Subsequent
wizard resumes still run the fresh guard but do not create another checkpoint.
A crash between ACK and marker persistence may retry the original identity safely.
