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
  "signal_type": "install_checkpoint | workflow_execution_completed | outreach_approved | outreach_rejected | debrief_completed | crm_updated",
  "occurred_at": "<ISO 8601 datetime — client clock at the moment of the work>",
  "payload": { "ops_stage": "…", "harness_status": "…", "template_version": "…" }
}
```

- **`occurred_at` is the server's field name** (not `sent_at`) and is required — a full
  ISO 8601 datetime, not date-only, not future beyond ~5 min clock skew. It anchors the
  server's replay-idempotence key `(harness, signal_type, occurred_at)`: re-sending the
  same signal is answered `200 { …, "replay": true }` with the original id and writes
  nothing, so duplicates never inflate the count.
- First write is `201 { "signal_id", "recorded_at", "replay": false }` and bumps the
  harness's last-active heartbeat.
- All six `signal_type` values are accepted by the deployed server (002a
  reconciliation): the five real-work types from the mono's `SignalType` union plus
  `install_checkpoint` (installer tooling only — wizard opt-in moment, ops-stage
  changes; deliberately distinct so install noise never counts as real work).
- `payload` is optional: a **flat object of scalar values** (≤20 keys, ≤2 KB). The key
  `occurred_at` is reserved inside payload (the server stores the top-level value
  there itself).
- Senders today: the wizard (first `install_checkpoint` on accepting check-ins),
  `status/emit-status.mjs` (`install_checkpoint` on ops-stage change),
  `status/radio.mjs signal --type <t>`, and the (disabled-by-default) "Radio signal"
  node in each n8n workflow. The when-to-send discipline for the five real-work types
  is defined in `docs/radio.md` and `AGENTS.md`.

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
  "installed_at": "<ISO 8601 — client clock at install>"
}
```

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

When this repo's changes and the server's 002a branch are both deployed: run
[quickstart.md](../quickstart.md) §"Radio round trip" and close SC-005.

---

**Verification record (2026-07-26)**: run with this repo's real code against a
synthetic harness. Against **production**: mailbox check surfaced a nudge (envelope
parse fix proven), reply landed as `{ body }`, signal with `occurred_at` accepted,
radio-off sent nothing, revoked token → 401. Against the server's 002a branch (local,
live DB): `install_checkpoint` and `kind: program` accepted. SC-005 closes after 002a
deploys and the last two checks re-run against production.
