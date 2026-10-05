# Contract: the radio, client side (`/api/bridge/*`)

This is the client-side view of the doors delivered by the sister feature
(`002-intelligence-bridge` in `dailypractice-mono`). **Status at 2026-07-26: the bridge
is live in production** (merged as PR #9; base `https://www.dailypractice.world/api/bridge`
— the `www` host is required). This file was reconciled against the deployed server
code and its contract (`specs/002-intelligence-bridge/contracts/bridge.ts` in the mono),
which remains the source of truth. The 2026-07-25 "to confirm at the bridge build"
checklist is resolved at the bottom.

## Transport rules (all four doors)

- Base URL: `sharing.bridge_url` (from the welcome pack; canonical value
  `https://www.dailypractice.world/api/bridge`).
- Auth: `Authorization: Bearer <sharing.install_token>` on every request. The token IS
  the harness identity server-side (SHA-256 hash-stored, revocable). 401 means the
  token is wrong or revoked — the client reports it plainly and does nothing else.
- `harness_id` in a body is a cross-check only: the server derives identity from the
  token and answers **403** if a body `harness_id` doesn't match it. Nothing is ever
  written on any auth failure.
- Radio-on gate before any call: `sharing.status_signal_enabled` AND `bridge_url` AND
  `harness_id` AND `install_token`. Anything less → silent local no-op, exit 0.
- Failures never retry automatically and never block local work.
- No PII in any payload: no message content, no KB content, no prospect data — ever.
  The server enforces a best-effort tripwire (PII-shaped key names and email-shaped
  values are rejected with 400) on top of this promise, not instead of it.

## Door 1 — `POST {bridge_url}/signals` — "real work happened" + install checkpoints

```json
{
  "harness_id": "<sharing.harness_id — optional cross-check>",
  "signal_type": "install_checkpoint | workflow_execution_completed | outreach_approved | outreach_rejected | debrief_completed | crm_updated | routine_completed | task_completed",
  "occurred_at": "<ISO 8601 datetime — client clock at the moment of the work>",
  "payload": { "ops_stage": "…", "harness_status": "…", "template_version": "…" }
}
```

Every signal carries those three payload fields. A work signal may add the labels
under "What a work signal carries", below.

- **`occurred_at` is the server's field name** (not `sent_at`) and is required — a full
  ISO 8601 datetime, not date-only, not future beyond ~5 min clock skew. It anchors the
  server's replay-idempotence key `(harness, signal_type, occurred_at, routine)` — the
  routine label joined the key with agent teams (11 Aug 2026), so same-second shifts
  from different agents are distinct rows; signals with no routine label match only
  rows that also have none. Re-sending the same signal is answered
  `200 { …, "replay": true }` with the original id and writes nothing, so duplicates
  never inflate the count.
- First write is `201 { "signal_id", "recorded_at", "replay": false }` and bumps the
  harness's last-active heartbeat.
- Eight `signal_type` values. Seven are accepted by the deployed server: the five
  in-session real-work types from the mono's `SignalType` union, plus
  `install_checkpoint` (installer tooling only — wizard opt-in moment, ops-stage
  changes; deliberately distinct so install noise never counts as real work), plus
  `routine_completed` (a hired agent's shift: work it does on a schedule. "Routine"
  is only the wire name). The eighth, `task_completed`, arrives with template
  1.1.0: a task the human set in a session is finished. Its server support ships in
  the mono alongside this template.
- Since 1.1.0 a run that a person asked for or watched, including the supervised
  first run at hire, reports as `task_completed` and names the agent in
  `payload.routine`. Only a run its schedule started reports as
  `routine_completed`. Agents hired before 1.1.0 keep their old report step and
  still send `routine_completed` for every run. For those, the shift-log marker,
  not the signal type, is what distinguishes attended from unattended.
- `payload` is optional: a **flat object of scalar values** (≤20 keys, ≤2 KB). The key
  `occurred_at` is reserved inside payload (the server stores the top-level value
  there itself).
- Senders today: the wizard (first `install_checkpoint` on accepting check-ins),
  `status/emit-status.mjs` (`install_checkpoint` on ops-stage change), and
  `status/radio.mjs signal --type <t>`. (A fourth sender, the n8n workflows'
  disabled-by-default "Radio signal" node, was retired with template 1.0.0 — it never
  ran in the field.)
- `status/done.mjs` (1.1.0) is not a fourth sender. It validates a finished-work
  report, writes the local line, and then calls `status/radio.mjs signal` as a child
  process. Its `--line` text is never passed on.

### What a work signal carries (labels only)

On top of the three payload fields every signal carries:

| Field | Meaning | Rules |
|---|---|---|
| `tag` | the kind of work | Lowercase kebab, `^[a-z][a-z0-9-]{1,39}$`. The client only ever sends a tag from the public menu: `WORK_TAGS` in `status/shapes.mjs`, listed in plain words in `docs/radio.md`. Required on `task_completed`, optional on every other work type |
| `count` | how many things were done | A whole number. Required on `task_completed`, where it is at least 1: a finished task did at least one thing. Required on `routine_completed`, where 0 is allowed: a shift may run and find nothing to do |
| `routine` | the hired agent that did the work | Its roster name, the same key shifts have always used. Required on `routine_completed`, optional elsewhere |
| `asset` | the skill, or other installed capability, that did the work | Its slug. When present, `outcome` and `surface` are required with it |
| `asset_kind` | what kind of capability it is | `skill`, `agent`, `workflow` or `program`. Optional |
| `outcome` | how it was used | `run_completed`, `rep_logged` or `skipped`. `status/done.mjs` only ever sends `run_completed` |
| `surface` | where it was used | `agent` for work asked for in a session, `routine` for a shift |

Never any free text, and never who the work was for. The client holds that line in
code. `status/done.mjs` checks every label before anything is sent: the tag against
the menu, the count as plain digits, the skill and the agent against the slug shape.
It takes one line of free text, `--line`. That line goes to the client's own shift
log and memory log, and is never handed to the radio. `status/radio.mjs signal`
drops `--note` with a plain line and sends without it, refuses a `--tag` that is not
on the menu, and refuses an `--asset` that is not a slug.

One older looseness remains, and it is known. On the types that existed before
1.1.0, `--routine` is trimmed and cut to 60 characters but its shape is not checked.
Agents hired earlier call that command directly, and a stricter check could silence
a working shift report. On `task_completed` the shape is checked. Tightening the
older types is a follow-up, to be done once the fleet's roster names are known to
fit the rule.

### When each type fires (the canonical trigger table — P2 discipline)

One signal per piece of work; the most specific type wins; every real-work signal
follows work the client **asked for or approved**: a task they set in a session, an
action they said yes to, or a shift under the standing yes given at hire. No finished
work → no signal: conversation, greetings, questions, answers, plans, and drafts
still waiting on a yes never touch the radio. Plain-words mirror: `docs/radio.md`.

| Type | Exact moment | Sender |
|---|---|---|
| `install_checkpoint` | wizard opt-in accepted; `ops_stage` transition | `start.mjs` / `emit-status.mjs` (wired, automatic) |
| `workflow_execution_completed` | a multi-step run completes **after the client approved its result** (e.g. an approved research run; an agent package's approved run) | agent rule → `radio.mjs signal` |
| `outreach_approved` | the client's explicit **yes** to a staged outreach draft, witnessed in conversation | agent rule → `radio.mjs signal` |
| `outreach_rejected` | the client's explicit **no** to a staged outreach draft | agent rule → `radio.mjs signal` |
| `debrief_completed` | a post-call debrief completes **with the client's approved CRM update** (the agent's debrief task, client-approved) | agent rule |
| `crm_updated` | a client-approved **standalone** CRM write by the agent (not part of a debrief — most specific type wins) | agent rule → `radio.mjs signal` |
| `task_completed` | a task the client set in a session is finished: they have the thing they asked for, or the action is taken. Not an approval moment (each of those keeps its own, more specific type) and never chat. Requires `payload.tag` + `payload.count` (at least 1); may name what ran with `routine` and the asset fields | the last step of the task → `status/done.mjs` → `radio.mjs signal` |
| `routine_completed` | a hired agent's shift completes: work its schedule started (a clock or a handoff, not a person). The standing yes was given once, at hire, on the job sheet naming the schedule and its report (`agent-anatomy.md`). Since 1.1.0 the supervised first run at hire is a `task_completed`, not a shift. A wiring test still arrives as `routine_completed`, because the schedule fired it: the shift-log marker (`auto:` / `auto-test:`), not the type, tells a test from the real thing. Requires `payload.routine` + `payload.count` (0 is allowed); may carry `tag` and the asset fields. The replay key includes the routine label so same-second shifts from different agents stay distinct rows | the shift's own report step → `status/done.mjs --shift` → `radio.mjs signal` |

On surfaces that can't run commands, agent-rule signals are skipped silently — same
posture as the session-start radio check (`AGENTS.md` rule 2).

## Door 2 — `GET {bridge_url}/nudges` — the mailbox

- Response envelope is an **object, not a bare array**:
  `{ "nudges": [{ "id": "…", "body": "…", "created_at": "…" }] }` — oldest first,
  unread only. The server marks returned nudges read in the same request
  (at-least-once delivery: if that receipt write fails server-side, the client simply
  sees them again next session).
- Empty mailbox → `{ "nudges": [] }` — the normal case, fast and silent.
- Checked at session start by the agent (`node status/radio.mjs check`) when the radio
  is on. The agent presents any nudge in plain words.

## Door 3 — `POST {bridge_url}/nudges/:id/reply` — the reply

```json
{ "body": "<the client's reply, in their words>" }
```

- **The field is `body`** (not `message`); non-empty, ≤ 4000 chars. The `radio.mjs`
  CLI flag stays `--message` — client-facing language — and maps to `body` on the wire.
- Sent **only after the client's explicit yes in that session** (FR-009).
- First reply wins: `200 { "nudge_id", "replied_at" }`; an identical replay is an
  idempotent 200; a *different* body after a stored reply → `409`. Another harness's
  nudge id → `404` (existence is never disclosed across harnesses).

## Door 4 — `POST {bridge_url}/assets` — the shelf report

```json
{
  "harness_id": "<optional cross-check>",
  "slug": "<package slug>",
  "kind": "agent | skill | workflow | crm_template | program",
  "version": "<PACKAGE.md version at install>",
  "installed_at": "<ISO 8601 — client clock at install>",
  "role": "<agent hires only, optional — a library/ROLES.md slug or 'custom' (feature 005)>",
  "purpose": "<agent hires only, optional — ≤140 chars, the client-approved sentence from the job-sheet yes; never a person, company, or number>"
}
```

- `role`/`purpose` (0.8.0, spec 005): sent only for `kind: "agent"`; a server that
  predates them ignores unknown fields — the report must still land. Server-side
  storage is spec 005 workstream C.

- `program` is accepted by the deployed server (002a reconciliation) — the Library
  ships program packages. (`crm_template` exists server-side for coach-installed CRM
  templates; this repo's packages don't currently use it.)
- Upsert key is `(harness, slug, version)`: a new version is a new row (history
  preserved), a same-version re-report refreshes the existing row —
  `201 { "asset_id", "reported_at", "replay": false }` first time, `200 … "replay":
  true` on re-report. Sent by `node status/radio.mjs report-install` after a package's
  smoke test passes, when (and only when) the radio is on (FR-007).

## Resolved: the 2026-07-25 "to confirm at the bridge build" checklist

1. `install_checkpoint` → **accepted server-side** as a sixth type (mono 002a,
   migration `20260726000001_bridge_reconciliation.sql`).
2. Response bodies → documented above per door; the client still treats any 2xx as
   success and prints nothing sensitive.
3. Nudge field names → confirmed `id` / `body` / `created_at`, wrapped in a
   `{ "nudges": [...] }` envelope (the client's original bare-array assumption was
   wrong and is fixed in `radio.mjs`).
4. Body `harness_id` → derived from the token server-side; when sent it must match
   (403 otherwise). The client keeps sending it as a cross-check on signals and asset
   reports.

Two client-side renames came out of the same reconciliation: `sent_at` →
`occurred_at` everywhere, and the reply field `message` → `body`. The legacy
unauthenticated `status_signal_endpoint` webhook (feature 001) was removed outright —
the authenticated radio is the only outbound path (schema 1.2.0).

---

**Verification record (2026-07-26) — SC-005 CLOSED**: run with this repo's real code
against a synthetic harness (created and deleted for the pass). Against **production**
(server 002a merged as mono PR #11 and deployed): mailbox check surfaced a nudge
(envelope parse fix proven), reply landed as `{ body }`, signals with `occurred_at`
accepted — including `install_checkpoint` — and `report-install --kind program` put a
row on the shelf. Radio-off → all commands refuse locally, zero requests. Revoked
token → 401. The radio round trip (quickstart §"Radio round trip") is complete in both
directions against the deployed server.
