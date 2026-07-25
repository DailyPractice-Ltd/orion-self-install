# Data Model: The Production Line

**Phase 1 output** | **Date**: 2026-07-25 | **Plan**: [plan.md](plan.md)

Still no database. Everything below is either a new region of `status/status.json`
(schema 1.0.0 → **1.1.0**), a document the client receives (welcome pack), a file shape
(`PACKAGE.md`), or a transient payload on the radio. Feature 001's
[data-model.md](../001-self-install/data-model.md) remains authoritative for everything
it already defines.

---

## `status/status.json` additions (schema 1.1.0)

### `machine_profile` — what the wizard learned (FR-001)

Written by `start.mjs`; read by every later session so no question the machine already
answered is ever re-asked. Absent on installs that never ran the wizard — every reader
must tolerate that (the conversational path fills it by asking, FR-010).

| Field | Type | Notes |
|---|---|---|
| `machine_profile.os` | `'macos' \| 'windows' \| 'linux' \| string` | From `process.platform`, reported in plain words |
| `machine_profile.os_version` | `string` | `os.release()` — informational only |
| `machine_profile.node_version` | `string` | `process.version` — the wizard is running, so always present when this object exists |
| `machine_profile.git_present` | `boolean` | `git --version` probe; absence is reported, never fatal |
| `machine_profile.surfaces_found` | `string[]` | Slugs from the fixed vocabulary below; best-effort, honest |
| `machine_profile.chosen_surface` | `string \| null` | One slug, or `'website-chat'`; set automatically when exactly one surface is found, by the one human question when two or more are (US1 edge case) |
| `machine_profile.detected_at` | ISO 8601 | Refreshed on every wizard run |

**Surface slug vocabulary** (fixed — detection method per slug in
[research.md](research.md) R1): `claude-desktop`, `claude-code`, `cursor`,
`chatgpt-app`, `copilot-vscode`, plus the always-available fallback `website-chat`.

### `sharing` — extended for the radio (FR-008)

The 1.0.0 fields keep their exact meaning. New fields:

| Field | Type | Notes |
|---|---|---|
| `sharing.radio_choice` | `'accepted' \| 'declined' \| null` | `null` = the check-in choice has never been presented. Set once by the wizard (or the conversational equivalent); its presence is why a re-run never re-asks. Declining also sets `status_signal_enabled` to `false`. |
| `sharing.bridge_url` | `string \| null` | The radio address from the welcome pack (e.g. `https://www.dailypractice.world/api/bridge`). `null` until a pack is entered — and **the stub default while the bridge is unbuilt** (research R3). |
| `sharing.harness_id` | `string \| null` | From the welcome pack; identifies this harness to the bridge |
| `sharing.install_token` | `string \| null` | From the welcome pack; typed by the client into a masked prompt, never echoed, never logged; lives here because this file is the radio's config home (FR-002/FR-008). Revocable by Daily Practice at any time. |

**Radio-on definition** (used by every outbound path):
`status_signal_enabled === true` **and** `bridge_url` **and** `install_token` **and**
`harness_id` are all set. Anything less → silent local-only no-op. The legacy
`status_signal_endpoint` keeps working for the plain lifecycle signal when the bridge is
not configured; when both are set, the bridge wins (path-drift fix mirrored from the
sister spec's FR-B03).

### `packages` — what's installed here (FR-005/FR-007, Article II)

A map keyed by package slug. Written by the installing agent the moment a package's
smoke test passes; read for shelf reports and for "what do I already have."

| Field | Type | Notes |
|---|---|---|
| `packages.<slug>.kind` | `'agent' \| 'skill' \| 'workflow' \| 'program'` | Matches the package's directory |
| `packages.<slug>.version` | `string` | From PACKAGE.md at install time |
| `packages.<slug>.installed_at` | ISO 8601 | First install |
| `packages.<slug>.smoke_test_passed` | `boolean` | Only `true` after the live check (Article VIII) |

**Migration rule**: files written under schema 1.0.0 simply lack these regions. Every
1.1.0 reader treats a missing region as "not yet" — never as an error — and adds it on
next write. `schema_version` moves to `"1.1.0"` on first 1.1.0 write.

---

## Welcome pack (received at sale — a document, not a file in this repo)

Minted by Daily Practice (sister spec FR-B06). The wizard's check-in step consumes it:

| Item | Lands in |
|---|---|
| Client id | `client_id` (if not already set) |
| Harness id | `sharing.harness_id` |
| The key (install token) | `sharing.install_token` — masked entry, shown back as last-4 only |
| The radio address | `sharing.bridge_url` |

No pack in hand → the wizard says exactly what's missing and who to ask
(support@dailypractice.world), leaves the radio silently off, and continues — never a
blocker (US4 edge case).

---

## Package (`library/<kind>/<slug>/PACKAGE.md`)

The one packaging shape (FR-005), specified in
[contracts/package-shape.md](contracts/package-shape.md): name / kind / version /
requires up top, install prompt as the **first block**, a smoke test on the client's own
data, a changelog line. Kinds: `agents`, `skills`, `workflows`, `programs`.

---

## Nudge and radio payloads (client-side view)

Client-side expectations of the bridge, specified in
[contracts/bridge-radio.md](contracts/bridge-radio.md): signal POST, asset-report POST,
nudge GET and reply POST, all Bearer-authenticated with the install token. The sister
feature owns the server truth; that contract file lists the items its build must
confirm. Until then `bridge_url` stays `null` and nothing dials out.

---

## Placeholder inventory — additions (Article VI gate)

Feature 001's inventory table stays the master for existing files. New placeholders
introduced by this feature, all **agent-filled during the install/training
conversation** unless noted:

| Placeholder | Appears in | Filled by |
|---|---|---|
| `{{CLIENT_ICP}}`, `{{CLIENT_BUSINESS}}`, `{{AGENT_NAME}}` | agent packages (reused from 001's vocabulary) | Installing agent, in conversation |
| `{{TEAM_MEMBERS}}` | `call-planner` (owner lists), `revenue-operating-cadence` (role table) | Installing agent |
| `{{PIPELINE_STAGES}}` | `call-planner`, `friday-report` | Installing agent, from the client's CRM template choice |
| `{{CRM_NAME}}` | all three agent packages | Installing agent |
| `{{ACCOUNTING_TOOL}}` | `revenue-operating-cadence` | Installing agent |
| `{{TIMEZONE}}` | `call-planner`, `revenue-operating-cadence` | Installing agent |
| `{{REPORT_DAY}}` | `friday-report` (defaults to Friday) | Installing agent |

No placeholder in any package may reach a client rendered unfilled — same rule, same
gate, as feature 001.
