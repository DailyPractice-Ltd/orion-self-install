# Data Model: Orion Self-Install

**Phase 1 output** | **Date**: 2026-07-12 | **Plan**: [plan.md](plan.md)

No database. Every entity below lives as a plain file inside the client's own copy of this
repository, or (for the emitted signal only) as a transient outbound payload. Nothing here
requires a schema migration or a shared store — this is the entire persistence model.

---

## `status/status.json` — the resumability record (constitution Article II)

The single source of truth for install progress. Created from
`status/status.schema-template.json` on session 1; read and updated after every completed
unit of work thereafter.

| Field | Type | Notes |
|---|---|---|
| `schema_version` | `string` | Version of this shape, independent of `template_version` |
| `template_version` | `string` | The `orion-self-install` `CHANGELOG.md` version this client started from |
| `client_id` | `string \| null` | Slugified business name, set once known |
| `business_name` | `string \| null` | Agent-filled during US1 |
| `agent_name` | `string \| null` | The client-chosen name for their Orion agent |
| `harness_status` | `enum` | `'draft' \| 'configured' \| 'connected' \| 'validated' \| 'installed/running'` — reused verbatim from `dailypractice-mono`'s `specs/001-sales-harness/contracts/harness.ts` `HarnessStatus` type; forward-only, no skipped steps |
| `ops_stage` | `enum` | `'booked' \| 'day1_encode' \| 'day2_wire_and_run' \| 'validated' \| 'seven_day_checkin' \| 'formalised'` — superset mirroring the Daily Practice internal tracking board's stage names exactly (do not rename) |
| `started_at` | `ISO 8601 \| null` | Set on first initialization |
| `updated_at` | `ISO 8601 \| null` | Set on every write |
| `checklist` | `object` | Boolean per install unit — see below |
| `stage_history` | `array` | `{ stage, at }` entries, append-only, never edited in place |
| `sharing.status_signal_enabled` | `bool` | Default `true` — constitution Article V channel 1 |
| `sharing.status_signal_endpoint` | `string \| null` | Filled if/when a webhook target exists |
| `sharing.intelligence_library_opt_in` | `bool` | Default `false` — constitution Article V channel 2, separate and explicit |
| `notes` | `string` | Free text; the installing agent's own scratch notes across sessions |

**`checklist` keys** (all boolean, default `false`):
`agent_identity_set`, `kb_business_context`, `kb_icp_vocabulary`, `kb_offer_value_prop`,
`kb_methodology_motion`, `kb_tone_voice`, `kb_objection_library`, `kb_commitments`,
`crm_choice_made`, `crm_template_applied`, `connector_crm_live`, `connector_email_live`,
`connector_calendar_live`, `n8n_wf01_imported`, `n8n_wf02_imported`,
`vt00_environment_sanity`, `vt01_research_e2e`, `vt02_decline_path`, `vt03_approve_path`,
`vt04_debrief_e2e`, `vt05_safety_boundary`, `vt06_daily_drive`,
`vt07_resume_after_interruption`, `vt08_status_signal_emission`.

**Validation rule**: `harness_status` is forward-only (same rule as the coach-led kit's
`HarnessStatus` state machine) — an install agent MUST NOT write a `harness_status` value
earlier in the sequence than the current one. `ops_stage` likewise only moves forward.

---

## Emitted status signal (constitution Article V, channel 1)

A minimal, deliberately narrow subset of `status.json`, defined formally in
[`contracts/status-signal.schema.json`](contracts/status-signal.schema.json). Never
includes KB content, prospect data, or message content — identity + stage + timestamp
only. Emitted via an n8n webhook node (preferred) or `status/emit-status.mjs` (code-capable
agent path), and only when `sharing.status_signal_enabled` is `true`.

---

## Knowledge base sections (`agent/knowledge-base/`)

Seven markdown files, structurally identical to the coach-led kit's shape (business
context, ICP & vocabulary, offer & value prop, methodology & motion, tone & voice,
objection library, commitments) — see `agent/knowledge-base/README.md` for the full
capture rules. Each file's completion sets the matching `checklist` key above.

---

## CRM choice & template

`crm_choice_made` records that the client has named their CRM (Attio, HubSpot, another, or
none); `crm_template_applied` records that the matching template (or the manual-shape
equivalent for "another"/"none") has been brought to the expected pipeline shape. The
applied CRM template itself is not tracked as separate state — its correctness is verified
live (VT-01..VT-04 exercise it directly), per constitution Article VIII.

---

## Connector credentials

**Never stored in this repository, never transmitted to Daily Practice.** CRM, Gmail, and
Calendar credentials live exclusively in the client's own n8n instance (their own account).
`status.json`'s `connector_*_live` booleans record only that a live test passed at a point
in time — not the credential itself, not even a reference to it.

---

## Validation tasks (`validation/validation-tasks.md`)

VT-00 through VT-08, each a live pass/fail check against the client's real accounts. VT-00,
VT-07, and VT-08 are new relative to the coach-led kit's VT-01..VT-06 (see that file for
the full detail and rationale).

---

## Notion tracker

`notion/project-tracker-template.md` specifies the page structure a client sets up in
their own Notion — not tracked in `status.json`, since it's the client's own copy-facing
tool, not part of the install's internal state machine.

---

## Placeholder inventory (constitution Article VI gate)

| Placeholder | Filled by | When |
|---|---|---|
| `{{DAILY_PRACTICE_SUPPORT_CONTACT}}` (`README.md`, `notion/project-tracker-template.md`, `docs/intelligence-library-opt-in.md`) | Daily Practice (maintainer) | Once, before the template is distributed |
| `{{CLIENT_NAME}}`, `{{CLIENT_BUSINESS}}`, `{{AGENT_NAME}}`, `{{CLIENT_VOCABULARY}}`, `{{CLIENT_ICP}}`, `{{CLIENT_COMMITMENTS}}`, `{{CLIENT_CRM}}`, `{{CLIENT_AI_TOOL}}` (`agent/`, `crm/`) | The installing agent | During the install conversation, before the client sees the rendered file |
| `{{CLIENT_EMAIL}}` (`n8n/wf-01-*.json`, `n8n/wf-02-*.json`) | The installing agent | When setting up the approval-email recipient during n8n import (US3) |
| `{{DATE}}` (`agent/knowledge-base/07-commitments.md`) | The installing agent | The day the commitments are agreed with the client |

No other placeholders exist in this repository. Any new one introduced by future work must
be added to this table (Article VI gate) before it ships.
