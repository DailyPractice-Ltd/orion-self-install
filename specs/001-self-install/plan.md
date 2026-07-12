# Implementation Plan: Orion Self-Install

**Branch**: `001-self-install` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-self-install/spec.md`

---

## Summary

A single, generic, publicly-cloneable repository that installs Orion onto a non-technical
client's own machine and accounts, guided entirely by whatever AI assistant they already
use — no Daily Practice coach present. Adapted from `dailypractice-mono`'s coach-led
`packages/harness/templates/install-kit/` (v1.1.0), reusing its knowledge-base capture,
CRM templates, connector checklist, n8n workflows, and validation-task discipline, with
two structural additions the coach-led kit never needed: a resumability mechanism
(`status/`) and a fourth, code-capable adapter (`agent/adapters/claude-code.md`).

---

## Technical Context

**Language/Version**: Markdown (content), plain Node.js scripts with zero dependencies
(`node:fs` + global `fetch` only — no `package.json`, no `npm install` step anywhere).

**Primary Dependencies**: none beyond a client's own AI assistant. Optionally: Node.js (for
the scripted CRM-apply and status-emission paths — never required, always an accelerator).

**Storage**: a single local `status/status.json` file inside the client's own copy of this
repository. No database, no Daily-Practice-hosted state (constitution Article IV).

**Testing**: no automated test suite in the software sense — most of this repository is
markdown. Verification is live-check-based (constitution Article VIII): connector live
tests, VT-00..VT-08 validation tasks against the client's real accounts, and one non-
technical dry run as the acceptance gate (see `tasks.md`).

**Target Platform**: the client's own machine (any OS) plus whatever AI product they
already use. No server, no hosting, no build step.

**Project Type**: standalone template repository (GitHub Template Repository), not a
package or app inside any workspace.

**Performance Goals**: mirrors the coach-led kit's own targets where the mechanic carries
over — under 3 minutes for a staged prospect-research task, under 5 for a post-call
debrief (both from `validation/validation-tasks.md`). No equivalent timing target for the
install itself, since (unlike the coach-led kit's "one sitting") this is explicitly
resumable and un-timed.

**Constraints**:
- No client-side dependency may be assumed beyond an AI assistant. Node.js, git, and a
  GitHub account are all optional accelerators with a documented manual-equivalent path.
- Nothing leaves the client's machine beyond the two channels named in constitution
  Article V.
- One shared, generic template — no per-client fork or generated variant (decision made
  upstream of this plan).
- Content-template layer (Instagram/LinkedIn) and the Skool support system are out of
  scope (constitution Article X) — named as follow-on work, not designed here.

**Scale/Scope**: single-operator, single-client-per-copy. Architecture assumes many
clients running independent copies of the same repository in parallel, not a shared
multi-tenant system.

---

## Constitution Check (Phase -1 Gates)

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. See
`.specify/memory/constitution.md`.*

- [x] **Art. I — Non-Technical-First**: every required step in `agent/`, `crm/`,
  `connectors/`, `n8n/` carries a preceding plain-language sentence; manual paths exist
  alongside every scripted one.
- [x] **Art. II — Resumable by Default**: `status/status.json` is the single record of
  truth for progress; every stage's completion is readable back from it.
- [x] **Art. III — Reputation Safety**: refusal behaviour reused from
  `agent/agent-definition.md`; boundary case covered by VT-05.
- [x] **Art. IV — Client-Owned, Transparent Data**: no Daily-Practice-hosted database;
  CRM/email/calendar/KB all live in the client's own accounts and repository copy.
- [x] **Art. V — Explicit, Opt-In Data Sharing**: status signal (on/disclosed) and
  Intelligence Library signal (off/explicit opt-in) kept structurally separate —
  `status/status.json`'s `sharing` object and `docs/intelligence-library-opt-in.md`.
- [x] **Art. VI — Template Integrity & Placeholder Discipline**: every `{{PLACEHOLDER}}`
  is documented as agent-filled (per-client, during conversation) or maintainer-filled
  (once, before distribution) — see `data-model.md`.
- [x] **Art. VII — Spec-Before-Build**: `data-model.md` and
  `contracts/status-signal.schema.json` precede `status/emit-status.mjs`.
- [x] **Art. VIII — Live-Verification Imperative**: connector checklist and VT-00..VT-08
  tasks are all live-account checks, never sandboxed/mocked.
- [x] **Art. IX — Model-Adapter Portability**: behaviour lives once in
  `agent/agent-definition.md`; all four adapters are mechanics-only.
- [x] **Art. X — Foundation Scope Discipline**: content templates and Skool support are
  named as follow-ons requiring their own spec, not designed in this plan.

**All ten gates pass. No Complexity Tracking entries required.**

---

## Project Structure

### Documentation (this feature)

```text
specs/001-self-install/
├── plan.md              # This file
├── data-model.md         # Phase 1: status.json shape, CRM/connector/validation entities
├── tasks.md              # Phase 2 (/speckit-tasks)
└── contracts/
    └── status-signal.schema.json   # the emitted-payload schema
```

### Source tree (repository root)

```text
orion-self-install/
├── README.md · AGENTS.md · CLAUDE.md · CHANGELOG.md · LICENSE
├── .specify/                 # vendored wholesale from dailypractice-mono
├── .claude/skills/speckit-*/  # vendored wholesale
├── specs/001-self-install/   # this feature's own docs (above)
├── agent/
│   ├── agent-definition.md
│   ├── adapters/{claude,chatgpt,copilot,claude-code}.md
│   └── knowledge-base/{README,01..07}.md
├── crm/
│   ├── README.md
│   ├── attio/{README,attio-template.json,apply-attio-template.mjs}
│   ├── hubspot/{README,hubspot-template.json,apply-hubspot-template.mjs}
│   └── other-crm-manual-setup.md
├── connectors/connector-checklist.md
├── n8n/{README,wf-01-prospect-research-outreach.json,wf-02-post-call-debrief.json}
├── validation/validation-tasks.md
├── status/{status-schema.md,status.schema-template.json,emit-status.mjs}
├── notion/project-tracker-template.md
└── docs/{intelligence-library-opt-in.md,self-serve-learnings.md}
```

**Structure Decision**: single standalone repository, no workspace/monorepo structure —
Article X (Foundation Scope Discipline) keeps this list closed; a new top-level directory
requires its own spec, not just an implementation convenience.

---

## The agent-guided mechanic, end to end

1. Whatever AI agent the client opens the folder with reads `AGENTS.md` first (Claude Code
   arrives via `CLAUDE.md`'s pointer to `AGENTS.md`).
2. `AGENTS.md` directs it to read `status/status.json` next. Absent → copy
   `status/status.schema-template.json`, initialize at `ops_stage: "booked"`. Present →
   resume at the recorded stage, skip everything the `checklist` already marks `true`,
   greet the client using `business_name`/`agent_name`.
3. The agent proceeds stage by stage (US1 → US2 → US3 in spec.md), consulting the adapter
   file matching the active surface for *how* to perform each step mechanically, and
   writing back to `status/status.json` after every completed unit — never batching
   updates to session end, since a session may not have an end the client controls.
4. At `validated`, the client drives one task unassisted (SC-05) and the install reaches
   `installed/running` / `ops_stage: seven_day_checkin`.

---

## Complexity Tracking

> No violations to justify. All ten constitution gates pass within a single, closed
> top-level directory list.
