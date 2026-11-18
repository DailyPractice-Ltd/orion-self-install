# Contract: required pairing and work guard

Ratified under self-install constitution 2.0.0 and its recorded written approval.
Client schema remains 2.0.0; release candidate template is 3.0.0. Neither version
number detects legacy users: both were already 2.0.0 before this feature.

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

`sharing.pairing` has `version: 1` (the feature marker), `state` (`unpaired`,
`exchanged`, `verified`), nullable `verified_at`, `last_check` (null, `accepted`,
`invalid`, `unreachable`, `server_error`), `migration_started_at`,
`migration_deadline_at`, and `migration_satisfied_at`. See `pairing.schema.json`.
All timestamps are full ISO instants, not date-only. Absent older fields are read
compatibly; present malformed fields require recovery, never a new grace clock.

Exchange stores identity/key durably before `exchanged`; only matching accepted
verification sets `verified` and `verified_at`. Prior verified time is diagnostic,
never authorization. Failed later checks preserve the exchange identity and last
successful time, record failure and pause. `state: verified` means accepted before,
not permission now. No code/verification failure may finish setup or print handoff.

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

## One-time existing-user migration

Detect before wizard profile, started_at or checklist mutation. An existing harness
has no feature marker AND recorded progress: non-null started_at, existing machine
profile, any true checklist item, or an ops stage beyond booked. A pristine copied
status file is new. Newly created pairing defaults never themselves grant grace.

Under the shared lock, a genuine existing unmarked harness with neither migration
timestamp receives version 1, start now, deadline start + 30 × 24 hours, durably
before work. Both timestamps are written together. No reset on resume or update.
Any present partial/malformed timestamp or future start fails closed. A future
recorded deadline is normal only within start + 30 days; effective deadline is
min(recorded valid deadline, start + 30 days). Deadline <= start is expired. At
`now == effective deadline` grace ends. Unknown marker versions require recovery.
A malformed or future satisfied marker also fails closed rather than granting grace.

Accepted enabled verification durably sets migration_satisfied_at once; subsequent
revocation, disablement or connectivity failure never grants fresh grace. Preserve
radio_choice declined until explicit code pairing; merely checking a credential
must not silently rewrite it. During unsatisfied, valid grace allow existing work
with a concise reminder even on connection failure or pending reports; connected
reports retain original identities and replay when possible. New installs and
expired/satisfied migrations require enabled connection, fresh acceptance and an
empty successfully delivered outbox. Malformed/unwritable local state is a recovery
failure, not permission under grace. An already paired enabled legacy folder can
satisfy migration immediately without a new code.

## Shared runtime interfaces (tickets 03–05)

- `status/guard.mjs` exports
  `checkWork({root, now = () => new Date(), fetchImpl = globalThis.fetch, replay = true})`
  -> Promise `{allow, reason, grace, deadlineAt}` (optional structured outcome).
  reason is plain language, deadlineAt nullable ISO. `node status/guard.mjs check
  [--quiet]` exits 0 allow, 2 pause. Quiet suppresses routine success only; failures
  and grace reminders remain actionable. `replay:false` is for controlled setup
  verification only and cannot authorize work while pending reports exist.
- `status/store.mjs` exports `withStatusLock(root, async store => result)`;
  store exposes `readStatus()`, `writeStatus(status)`, `readOutbox()`,
  `writeOutbox(entries)`. Reads/writes are awaited-compatible. All guard, pairing,
  reporting and replay mutations use this shared cross-process lock. No recursive
  acquisition. Invalid files, lock contention timeout and write failure surface
  recovery errors; never replace corrupt data with empty defaults. Missing outbox
  alone means empty. Atomic same-directory temporary writes + rename preserve
  previous valid contents; durable flush before claiming success. Stale locks may
  be recovered only when owner death is established, never just an old timestamp.
- `status/report.mjs` exports
  `reportSignal({root,signalType,payload,occurredAt,fetchImpl})`,
  `reportAsset({root,asset,fetchImpl})`, `replayOutbox({root,fetchImpl})`, and
  `replayOutboxLocked(store,{status,fetchImpl})`. Optional fetchImpl defaults to
  global fetch; absent occurredAt is allocated once at original report creation.
  Wrappers obtain the store lock; guard calls the Locked sibling while holding it.
  Return `{status: 'sent'|'queued'|'off'|'invalid', pending}` plus plain reason as
  needed. Replay reports sent only if no entries remain. No reporting function
  calls guard. Preserve radio result-line behavior consumed by done.mjs.

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
Optional harness_id may be absent for work completed during unpaired grace: freeze
all other identity fields then attach the verified folder identity once at delivery.
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
invalid/unreachable/server_error as appropriate. Pending entries block new work
outside valid grace. Successful verification alone never clears pending reports.

A valid queued example (local work-log text is deliberately absent):

```json
[
  {
    "kind": "signal",
    "body": {
      "signal_type": "task_completed",
      "occurred_at": "2026-11-18T12:00:00.000Z",
      "payload": { "ops_stage": "formalised", "harness_status": "running", "template_version": "3.0.0", "tag": "research", "count": 1 }
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
