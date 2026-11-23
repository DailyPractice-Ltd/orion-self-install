# `status/status.json` — field reference

Human-readable companion to `status.schema-template.json`. Use this reference
and [setup and recovery](../agent/install.md) for status fields and operational guidance.

**On session 1**: `status/status.json` doesn't exist yet. Run
`node status/emit-status.mjs` (no flags): it creates `status.json` from the template with
`template_version` taken from `update/manifest.json`. Never copy the template by hand; the
template file itself carries no version and never gets edited.

**On every subsequent session**: read `status.json` first, before asking the client
anything. Its contents ARE the answer to "where did we leave off."

| Field | Meaning | When you write it |
|---|---|---|
| `client_id` | slugified business name | as soon as `business_name` is known |
| `business_name` | the client's business, human-readable | first thing captured (knowledge base §1) |
| `agent_name` | fixed identity: `Orion` | set automatically on fresh install |
| `harness_status` | forward-only: `draft → configured → connected → validated → installed/running` | on each real lifecycle transition — never skip a step, never move backward |
| `ops_stage` | forward-only: `booked → day1_encode → day2_wire_and_run → validated → seven_day_checkin → formalised` | tracks alongside `harness_status`, one notch coarser |
| `machine_profile` | what the Press Start wizard learned about this computer (OS, Node, git, AI tools found, which one the client chose) | written by `start.mjs` only; `null` means the wizard never ran here — ask conversationally instead, never assume. If it's filled, **don't re-ask any of it** |
| `ai_assistant` | authoritative deployed runtime: `claude-code` or `codex`. `null` only before deployment. Install, update, switch, radio, hiring and scheduling resolve destinations from this field; `machine_profile.chosen_surface` is not a substitute | record before first deployment; change only after a validated tool switch |
| `checklist.*` | one boolean per install unit | flip `true` the moment that unit is genuinely done — never optimistically, never in a batch at session end |
| `packages.<slug>` | Installed skill or program with `kind`, `version`, `installed_at`, and `smoke_test_passed`. Preserve historical records as written. | After a successful test on real data |
| `plugin` | Orion plugin setup in this folder, separate from pairing. All fields default to `null` except `setup_state`. `catalog_identity`: a random id; the catalog name is `orion-` plus its first 12 hex digits, never derived from the radio key, business name or folder name. `setup_state` (default `not_started`): `not_started`, `pending`, `failed`, `registered` (the tool's own inspection shows Orion installed for this folder) or `complete` (a fresh session confirmed the skills). `remaining_action`: the step still owed. `verified_version` / `verified_at`: the last release confirmed in a fresh session. `pending_version`: installed but not yet confirmed; never announce it as active. `pending_switch`: a tool switch in progress, `{to, metadata_before, registration_before, remaining_action}`. `registration_before` captures only Orion’s own target settings entries. `metadata_before` maps target manifest and catalog paths to their original text or `null` when absent, so cancellation and rollback restore the original layout. `update_backup`: the backup to restore if an unconfirmed update fails. Details: [install](../agent/install.md#finish-the-orion-plugin), [updating](../agent/updating.md) | `catalog_identity` once, by `update/plugin-package.mjs`; never edit it. Everything else by the installer and `update/apply.mjs`, only from real native inspection. `start.mjs` fills in missing defaults |
| `stage_history` | append-only list of `{stage, at}` | on every stage change — never edit or delete an existing entry |
| `scopes` | the standing permissions the client has given, once (schema 1.8.0). `crm_write` (default `true`): notes, tasks, contact, company and deal properties and meeting outcomes are written straight away and reported in one line, never staged. It never covers a delete, a merge, an owner change or a lifecycle-stage move, which are read back and wait for a yes, and it never covers sending. `send_risk` (schema 1.9.0; `off`, `low`, `medium` or `high`, a fresh install writes `low`): the one risk level the client set, with `send_risk_set_by` and `send_risk_set_on`; a message scored at or under it sends on its own, one above it waits (`agent/risk-matrix.md`). `send_risk_resume` remembers the level while sending is paused. `send_caps` holds the per-day caps per channel group, set with the level. `waiting_session` (optional) is the fixed id of the command-line "waiting for you" session, where the assistant can keep one | the client, by telling their assistant; `node status/send.mjs set-level` writes it and the edit is the record. Skills can further limit actions for their task |
| `home` | whether this folder lives in a private repository its owner controls (schema 1.7.0): `enabled` (default `false`), `branch` (default `main`) | only `node status/home.mjs prepare --yes`, on the owner's say-so. While it is on: the radio key lives in `status/radio.key`, which is never saved to the home, and `sharing.install_token` stays `null`; this file itself is saved there; and `status/done.mjs` saves the folder after every finished piece of work. The script's header is the contract |
| `sharing.status_signal_enabled` | default `true` — required operational connection switch (constitution Article V, channel 1); disabling pauses supported work at all times | only the client changes this, and only if they ask to |
| `sharing.radio_choice` | `null` before pairing; `"accepted"` after code pairing | set by code pairing only |
| `sharing.bridge_url` / `sharing.harness_id` / `sharing.install_token` | the radio's address and key, from the client's pairing code exchange | during the wizard's check-in step (or its conversational equivalent). Exchange returns the token to the folder; the human enters only a short code. Fresh matching server verification, not local shape, authorizes work. Never display/log even token suffixes |
| `status/radio.key` (a file, not a field) | the radio key, one line, when it does not live in `sharing.install_token` (since 1.3.0). The radio uses the first well-shaped key it finds in: `ORION_INSTALL_TOKEN` in the machine's environment, this file, then `sharing.install_token` | written by `status/home.mjs` when the folder gets a home, and by the wizard when a folder that has one is paired. Never by hand, never printed, never saved anywhere but this machine |
| ~~`sharing.status_signal_endpoint`~~ | removed in schema 1.2.0 (002a reconciliation) — the 001-era unauthenticated webhook is gone; the authenticated radio (`bridge_url` + key) is the only outbound path | delete it if an old status.json still carries it |
| `sharing.radio_seen_through` | `null` until the radio has read a message out; then the time of the newest Daily Practice message already read to the client (schema 1.4.0). Messages up to it are not repeated at the next check | written by `radio.mjs check` after it reads a message out. Never by hand. Deleting it only means the most recent message may be read once more |
| `notes` | free text scratch space | anything you want your future (possibly resumed, possibly different-AI-tool) self to know |

## The one rule that matters most

**Write after every completed unit, not at the end of a session.** You do not control
when a session ends — the client might close their laptop mid-sentence. If a completed
step isn't written back yet when that happens, it's lost, and the client will be asked
the same question twice next time. That's the exact failure this file exists to prevent.

## Required pairing

`sharing.pairing` is version 2, with `state`, `last_check`, informational
`verified_at` and nullable `last_connected_at`.
Only accepted verification plus acknowledged empty outbox sets the connection time
under the shared lock. Missing, malformed or future connection timestamps grant no
allowance; malformed active state requires recovery. Invalid/revoked credentials
clear the connection time. Temporary outages allow silent work within the connection allowance in
[agent/install.md](../agent/install.md#the-connection-allowance); updates and restarts never reset it.

Read [setup and recovery](../agent/install.md) in an installed folder for outcomes,
credential recovery and lock handling. `status/radio-outbox.json` holds typed
operational labels only; `status/report.mjs` and `status/store.mjs` implement its
validation and persistence.
Pending reports survive restart and are replayed before work outside valid grace;
no log text, purpose sentence, token or artifact belongs in that queue. Status and
outbox are client-owned and are not replaced by an update.


`setup_checkpoint` is an optional top-level progress object outside `sharing`:
`harness_id`, original ISO `occurred_at`, frozen operational-label `payload`, and
boolean `delivered`. Setup writes it under the shared lock before reporting, reuses
its identity after interruption, and marks it delivered only after acknowledgment,
an empty outbox and unchanged accepted folder association. A retry after a crash
uses the same server identity. It contains no credential and never authorizes work;
every resume still runs a fresh guard. Updaters preserve this client-owned progress.
