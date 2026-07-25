# Contract: the radio, client side (`/api/bridge/*`)

This is the client-side view of the doors delivered by the sister feature
(`002-intelligence-bridge` in `dailypractice-mono`). **Status at 2026-07-25: the sister
feature is spec-committed but not built.** Everything below mirrors its spec
(FR-B01..B08); the server remains the source of truth. Until the bridge exists,
`sharing.bridge_url` ships `null`, so no code path in this repository performs any
outbound call — that is the stub posture, and it is byte-identical to the
client-declined path.

## Transport rules (all four doors)

- Base URL: `sharing.bridge_url` (from the welcome pack; e.g.
  `https://www.dailypractice.world/api/bridge`).
- Auth: `Authorization: Bearer <sharing.install_token>` on every request. 401 means the
  token is wrong or revoked — the client reports it plainly and does nothing else.
- Radio-on gate before any call: `sharing.status_signal_enabled` AND `bridge_url` AND
  `harness_id` AND `install_token`. Anything less → silent local no-op, exit 0.
- Failures never retry automatically and never block local work (same posture as
  `status/emit-status.mjs` since feature 001).
- No PII in any payload: no message content, no KB content, no prospect data — ever.

## Door 1 — `POST {bridge_url}/signals` — "I'm alive, I just did real work"

```json
{
  "harness_id": "<sharing.harness_id>",
  "signal_type": "install_checkpoint | workflow_execution_completed | outreach_approved | outreach_rejected | debrief_completed | crm_updated",
  "sent_at": "<ISO 8601 — client clock; part of the server's replay-idempotence key>",
  "payload": { "ops_stage": "…", "harness_status": "…", "template_version": "…" }
}
```

- `signal_type` values other than `install_checkpoint` come verbatim from
  `dailypractice-mono` `specs/001-sales-harness/contracts/intelligence.ts` (`SignalType`).
- `payload` is optional and jsonb-shaped; for `install_checkpoint` it carries the three
  lifecycle fields shown (a strict subset of feature 001's status-signal payload).
- The wizard sends the **first signal** (`install_checkpoint`) during the install
  session when the client accepts the check-in (FR-008). `status/radio.mjs signal`
  sends the rest; `status/emit-status.mjs` also routes its lifecycle emission through
  this door when the bridge is configured (path-drift fix, sister FR-B03).

## Door 2 — `GET {bridge_url}/nudges` — the mailbox

- Returns this harness's unread nudges (server marks them delivered/read on fetch —
  sister FR-B04): `[{ "id": "…", "body": "…", "created_at": "…" }]`.
- Empty list is the normal case and must be fast and silent — no noise for the client.
- Checked at session start by the agent (`node status/radio.mjs check`) when the radio
  is on. The agent presents any nudge in plain words.

## Door 3 — `POST {bridge_url}/nudges/:id/reply` — the reply

```json
{ "harness_id": "<sharing.harness_id>", "message": "<the client's reply, in their words>" }
```

- Sent **only after the client's explicit yes in that session** (FR-009). The client's
  reply text is the one payload a human authors — the agent never composes and sends one
  on its own.

## Door 4 — `POST {bridge_url}/assets` — the shelf report

```json
{
  "harness_id": "<sharing.harness_id>",
  "slug": "<package slug>",
  "kind": "agent | skill | workflow | program",
  "version": "<PACKAGE.md version at install>",
  "installed_at": "<ISO 8601>"
}
```

- Sent by `node status/radio.mjs report-install` after a package's smoke test passes,
  when (and only when) the radio is on (FR-007). Upsert-by-slug on the server, history
  preserved (sister FR-B05).

## To confirm at the bridge build (owned by the sister feature)

1. Accept (or map) `signal_type: "install_checkpoint"` — it is not yet in
   `intelligence.ts`'s `SignalType` union.
2. Exact response bodies (this client treats any 2xx as success and prints nothing
   sensitive either way).
3. The nudge JSON field names above (`id`, `body`, `created_at`).
4. Whether `harness_id` in bodies is required or derived from the token server-side —
   the client sends it either way; the server may ignore it.

When the bridge is live: run [quickstart.md](../quickstart.md) §"Radio round trip" and
update this file's status line. SC-005 stays open until then.
