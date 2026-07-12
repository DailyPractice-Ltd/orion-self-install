# Tasks: Orion Self-Install

**Input**: [plan.md](plan.md), [data-model.md](data-model.md), [spec.md](spec.md)

Building this repository, not a client's install. `[P]` = parallelizable (no file overlap
with concurrent tasks). Test-first (constitution Article VII/VIII) applies where real code
exists — the two CRM apply scripts and `emit-status.mjs`; everywhere else, "test" means a
live-check task (VT-pattern), since most of this repository is markdown.

---

## Phase 1 — Setup

- T001 Create the GitHub repository as a Template Repository; set visibility/license per
  the plan's recommendation (public, MIT) or the founder's override.
- T002 [P] Scaffold `README.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, `LICENSE`.
- T003 [P] Vendor `.specify/` and `.claude/skills/speckit-*/` wholesale; fix
  `.specify/feature.json` to point at `specs/001-self-install`.

## Phase 2 — Foundational (blocks every user story below)

- T004 Author `.specify/memory/constitution.md` (10 articles, per plan.md's translation).
- T005 Author `specs/001-self-install/spec.md`.
- T006 Author `specs/001-self-install/data-model.md`.
- T007 Author `specs/001-self-install/contracts/status-signal.schema.json` — **before**
  T028 (`emit-status.mjs`) per constitution Article VII.

**Checkpoint**: constitution, spec, data model, and schema exist and are internally
consistent before any user-facing content is written.

---

## Phase 3 — User Story 1: Meet Your Agent (P1)

**Goal**: a client can be interviewed directly by their AI assistant and end with a
complete knowledge base and a named agent identity.

**Independent test**: open the repo cold, run the KB conversation to completion, read a
draft aloud — it should sound like the client, not like a generic tool.

- T008 [P] Adapt `agent/agent-definition.md` from
  `packages/harness/templates/install-kit/agent/agent-definition.md` (main) — reframe
  "behaviour notes" from coach-led to direct-agent-interview voice; keep the system prompt
  and non-negotiable rules structurally intact.
- T009 [P] Write `agent/adapters/claude-code.md` (new — code-capable surface: can run
  scripts, write `status/status.json` directly).
- T010 [P] Adapt `agent/adapters/claude.md` from the install-kit version.
- T011 [P] Adapt `agent/adapters/chatgpt.md` from the install-kit version.
- T012 [P] Adapt `agent/adapters/copilot.md` from the install-kit version.
- T013 [P] Adapt `agent/knowledge-base/README.md` and all seven numbered files
  (`01-business-context.md` … `07-commitments.md`) — capture-prompt comments reworded from
  "ask the client" (coach voice) to "you ask the client directly" (agent voice); structure
  and section numbering unchanged so cross-references keep working.

**Checkpoint**: US1 is independently testable — a fresh clone, opened cold, produces a
complete KB and agent identity through conversation alone.

---

## Phase 4 — User Story 2: Wire Your CRM (P2)

**Goal**: CRM choice is captured and the client's pipeline reaches the expected shape,
scripted or manual, without blocking KB/agent work.

**Independent test**: a person with no CRM-admin experience reaches a working pipeline
unassisted, on any of the three documented CRM paths.

- T014 Write `crm/README.md` — the CRM-choice decision guide (HubSpot / Attio / other /
  none), routing to the matching path.
- T015 [P] Adapt `crm/attio/{README.md,attio-template.json,apply-attio-template.mjs}` from
  `packages/harness/templates/install-kit/attio/` (main) — add first-time API-key
  walkthrough.
- T016 [P] Adapt `crm/hubspot/{README.md,hubspot-template.json,apply-hubspot-template.mjs}`
  from `packages/harness/templates/install-kit/hubspot/` (main) — add first-time
  private-app-token walkthrough.
- T017 Write `crm/other-crm-manual-setup.md` (new) — generalised pipeline-shape spec for a
  third CRM or no CRM yet, so KB/agent work is never gated on this.

**Checkpoint**: US2 is independently testable on all three CRM paths.

---

## Phase 5 — User Story 3: Connect and Validate Live (P3)

**Goal**: connectors authenticate with a live-test gate, workflows import, and validation
proves the system against real accounts.

**Independent test**: all three connectors pass live tests or fail with a specific,
actionable message; VT tasks pass against real data or fail explicitly.

- T018 Adapt `connectors/connector-checklist.md` from the install-kit version — add a
  step zero ("you don't have an n8n account yet") and non-technical language throughout.
- T019 [P] Adapt `n8n/README.md` and both workflow JSONs
  (`wf-01-prospect-research-outreach.json`, `wf-02-post-call-debrief.json`) — import
  instructions rewritten for a non-technical, unaccompanied operator.
- T020 Adapt `validation/validation-tasks.md` into VT-00..VT-06 (VT-00 new: environment/
  tool sanity check; VT-01..VT-06 reused near-verbatim from the coach-led kit — the
  underlying research/debrief mechanics don't change based on who's driving).

**Checkpoint**: US3 is independently testable — connectors, workflows, and VT-00..VT-06 all
run against a real (test) account set.

---

## Phase 6 — User Story 4: Stop and Come Back (P2) — real code, test-first applies

**Goal**: any install can pause and resume, across sessions/days/tools, with zero
re-asking.

**Independent test**: interrupt after any completed unit, reopen (optionally on a
different AI surface), confirm correct resume point with no repeated questions.

- T021 Write `status/status.schema-template.json` (the fresh-install starting state, per
  `data-model.md`'s field table) — this doubles as the schema T007 already specifies.
- T022 Write a failing check first: assert `emit-status.mjs`'s local-write path produces a
  `status/status.json` matching `data-model.md`'s shape before any implementation exists.
- T023 Implement `status/emit-status.mjs` (dependency-free — `node:fs` + global `fetch`
  only) — local status write always; outbound POST only when
  `sharing.status_signal_enabled` is true.
- T024 Write `status/status-schema.md` — the human-readable description of the shape, for
  an agent reading it without parsing JSON Schema.
- T025 Add VT-07 (resume-after-interruption live check) to
  `validation/validation-tasks.md`.

**Checkpoint**: US4 is independently testable — the one genuinely new mechanic in this
repository, with no equivalent in the coach-led kit.

---

## Phase 7 — User Story 5: Let Daily Practice Know You're Progressing (P4)

**Goal**: a disclosed, opt-in-gated signal reflects install progress outward; nothing
beyond it is ever transmitted.

**Independent test**: default config emits one schema-conformant payload per stage change;
signal disabled emits none; Intelligence Library opt-in stays off unless explicitly set.

- T026 Extend `status/emit-status.mjs` and the n8n workflow (one added webhook node) with
  the opt-in-gated outbound POST — test against a real sandbox endpoint, per constitution
  Article VIII (no mocks).
- T027 Write `docs/intelligence-library-opt-in.md` — the full Article V, channel 2
  disclosure.
- T028 Write `notion/project-tracker-template.md`.
- T029 Add VT-08 (status-signal-emission live check, runnable only once opted in) to
  `validation/validation-tasks.md`.

**Checkpoint**: US5 is independently testable; the Daily-Practice-side consumer remains
explicitly out of scope (see `docs/self-serve-learnings.md`).

---

## Phase 8 — Polish & Cross-Cutting

- T030 Seed `CHANGELOG.md` at `0.1.0` (not `1.0.0` — no field-tested self-serve install
  exists yet, matching the coach-led kit's own discipline).
- T031 Write `docs/self-serve-learnings.md` — this repository's own learnings channel,
  parallel to (not merged with) `dailypractice-mono`'s `docs/gtm/implementation-learnings.md`.
- T032 Run `/speckit-analyze` to confirm `spec.md` → `plan.md` → `tasks.md` consistency.
- T033 Full non-technical dry run: someone who is not the founder, with no prior Orion
  exposure, clones the repo cold and reaches `validated` using only what's in the
  repository. Anywhere they get stuck is a defect in the repository, not in them — this is
  the real acceptance gate, not T032.

---

## Dependencies & Execution Order

Phase 1 → Phase 2 (blocking) → Phases 3, 4 in parallel (US1 and US2 don't share files) →
Phase 5 (needs US2's CRM choice resolved) → Phase 6 (can start alongside Phase 3 — the
status mechanism doesn't depend on KB content, only on the checklist keys existing) →
Phase 7 (needs Phase 6's `emit-status.mjs`) → Phase 8.

## Explicitly deferred (constitution Article X — not tasks in this file)

- IG/LinkedIn content-template layer — needs its own spec.
- Skool.com support/daily-tasks system — blocked on Daily Practice's own unresolved
  Daily-Kapa-rebuild scope decision.
- The Daily-Practice-side Trello consumer for the emitted status signal — needs a sandbox
  or a careful dry run against the live "Sales Harness — Client Ops" board.
