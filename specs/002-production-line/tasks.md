# Tasks: The Production Line

**Input**: [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), [quickstart.md](quickstart.md), [spec.md](spec.md)

Building this repository, not a client's install. `[P]` = parallelizable (no file
overlap). As in feature 001: real code (two new scripts, one touched) gets its shape
specified first (Article VII — done, in `contracts/`) and a live check after (Article
VIII); everywhere else "test" means a live-check task, since most of this repository is
markdown. The scrub check (SC-004) gates every task that touches `library/`.

---

## Phase 1 — Design artifacts (complete, via /speckit-plan)

- [x] T001 research.md R1–R7; plan.md with all ten gates re-derived.
- [x] T002 data-model.md (status 1.1.0 regions, welcome pack, placeholder additions).
- [x] T003 contracts/: `status-additions.schema.json`, `package-shape.md`,
  `bridge-radio.md` — **before** any implementation (Article VII).
- [x] T004 scrub-check.md — the defined grep list (SC-004's artifact).
- [x] T005 Constitution amendment 1.1.0 (Article V channel 1 = the radio, per R4).
- [x] T006 CLAUDE.md speckit marker → this feature's plan (agent-context hook).

## Phase 2 — Foundational (blocks all user stories)

- [x] T007 Extend `status/status.schema-template.json` to schema 1.1.0: `machine_profile:
  null`, `sharing` radio fields (`radio_choice`, `bridge_url`, `harness_id`,
  `install_token` — all null), `packages: {}`. Per
  contracts/status-additions.schema.json.
- [x] T008 Extend `status/status-schema.md`: field rows for the three new regions +
  the radio-on definition, in the same table voice.

**Checkpoint**: a fresh status.json carries every 1.1.0 region; 1.0.0 files remain
readable (migration rule in data-model.md).

---

## Phase 3 — User Story 1: Press Start — the wizard (P1)

**Goal**: `node start.mjs` → machine understood, one human fork max, credentials never
seen, check-in choice made, handoff prompt printed, fully resumable.

**Independent test**: quickstart.md §2–§4 on a real machine.

- [x] T009 `start.mjs` — detection: OS/node/git + AI-surface probes per research R1;
  writes `machine_profile`; plain-words report; asks nothing detection answered.
- [x] T010 `start.mjs` — bookmark behaviour: create-from-template on first run; resumed
  run opens "welcome back — you're at …" from `ops_stage`/`checklist`/`machine_profile`;
  never restarts from zero; surface question only when ≥2 found and none chosen yet.
- [x] T011 `start.mjs` — the check-in step: pre-ticked plain-words choice, one-keystroke
  decline (FR-008); welcome-pack entry with masked token input (R2), last-4 echo only;
  no-pack path says what's missing and who to ask; first `install_checkpoint` signal on
  accept, stub-aware (silent no-op while `bridge_url` is null).
- [x] T012 `start.mjs` — handoff: copy-ready prompt tailored to `chosen_surface`
  (code-capable vs chat-with-upload vs website-chat), ending at the AGENTS.md sequence;
  same prompt re-printed on every re-run.
- [x] T013 Live checks: `node --check start.mjs`; quickstart §2 (fresh), §3 (resume), §4
  (decline) on this machine. SC-001 timing observed.

**Checkpoint**: US1 independently testable — the fast lane exists and the conversational
lane is untouched.

---

## Phase 4 — User Story 2: the README control panel (P1)

**Goal**: Press Start first, Library buttons below, trust content preserved.

**Independent test**: SC-002's one-screen read (observed in the dry run).

- [x] T014 `library/README.md` — what a package is, the four kinds in plain words, how
  installing works on any surface, the shelf-report rule (radio on), pointer to the
  package-shape contract for maintainers.
- [x] T015 Rework `README.md` as the control panel: Press Start block (the one command +
  what it will do + "if that didn't work" → the no-wizard path, which remains the full
  Step 1–3 route); the Library as linked buttons grouped Agents · Skills · Workflows ·
  Programs (honest mechanics: a button is a link — say so); keep the trust sections,
  resume promise, screenshots, support footer, and the "you'll know it worked when…"
  voice throughout.
- [x] T016 [P] `SHOTLIST.md`: add the Press Start terminal shot (05) to priority 2 so
  the README's new top block can gain an image later without a text change.

**Checkpoint**: US2 independently testable; every Library button lands on a page whose
first block is an install prompt (verified after Phase 5 fills the shelves).

---

## Phase 5 — User Story 3: the day-one packages, extracted (P2)

**Goal**: seven packages, all battle-tested-or-already-shipped, zero source identifiers.

**Independent test**: each PACKAGE.md's smoke test on live non-source data + scrub check.

- [x] T017 [P] `library/agents/call-planner/` — PACKAGE.md per the shape contract +
  `build-call-plan.mjs` (dependency-free re-expression per R5: markdown day-sheet + CSVs,
  same triage order, KPI arithmetic, hold-out rule, outcome vocabulary) +
  `call-data.template.json` (the schema with `{{PLACEHOLDER}}`/empty values only).
- [x] T018 [P] `library/agents/friday-report/PACKAGE.md` — methodology authored from the
  source pack's discipline: snapshot + window header, executive read (one-sentence
  verdict, the constraint named, one next action), scorecard table, supply-vs-activity,
  named-cases-with-evidence, metric definitions, source-and-verification notes, honest
  zeros; drafted for approval, never sent.
- [x] T019 [P] `library/agents/prospecting/PACKAGE.md` — evidence discipline distilled
  (what counts as a touch/conversation/meeting), ~20-candidates-with-why smoke test,
  merged with existing `n8n/wf-01` + VT-01; explicit "what this doesn't do" honesty
  about externally-purchased supply (R7).
- [x] T020 [P] `library/skills/meeting-sizing/PACKAGE.md` — the sizing table + booking
  checklist, templatised.
- [x] T021 [P] `library/programs/revenue-operating-cadence/PACKAGE.md` — lifecycle
  controls, project controls, daily/weekly/monthly cadence, scorecard; tool names
  generalised to placeholders.
- [x] T022 [P] `library/workflows/prospect-research-outreach/PACKAGE.md` and
  `library/workflows/post-call-debrief/PACKAGE.md` — package pages wrapping the existing
  n8n JSONs (no behaviour change; install prompt routes through `n8n/README.md`; smoke
  tests reference VT-01/VT-04).
- [x] T023 `AGENTS.md` — Library wiring: how an install prompt session runs, `packages`
  map write-after-smoke-pass, shelf report when radio on, "don't re-detect what
  `machine_profile` already says."
- [x] T024 Scrub check (quickstart §5) — both tiers zero, fix anything it catches.

**Checkpoint**: US3 independently testable; SC-003 runnable (live smoke tests are the
release gate before Kira's session); SC-004 green.

---

## Phase 6 — User Story 4: the radio, client side (P2)

**Goal**: opt-in-gated signals out, mailbox in, decline changes nothing; all of it a
silent no-op until the bridge exists.

**Independent test**: quickstart §4 today; §7 deferred until the bridge is live.

- [x] T025 `status/radio.mjs` — dependency-free bridge client per
  contracts/bridge-radio.md: `check`, `reply --nudge <id>`, `signal --type <t>`,
  `report-install --slug --kind --version`; radio-on gate exactly as contracted; plain
  radio-off/one-line-failure output; never retries, never blocks local work.
- [x] T026 `status/emit-status.mjs` — route the lifecycle emission through the bridge
  door when configured (Bearer + `{bridge_url}/signals`), legacy
  `status_signal_endpoint` fallback preserved (sister FR-B03 mirrored).
- [x] T027 `AGENTS.md` — session-start mailbox check (radio on + code-capable: run
  `node status/radio.mjs check`, present nudges plainly, reply only on the client's
  yes); conversational-path parity for the check-in choice in the same plain words
  (FR-010); honest note on paste-only surfaces (no command runner → Daily Practice
  reaches you by email instead).
- [x] T028 `docs/radio.md` — the plain-words disclosure page: what the radio is, the
  four things it carries, the exact wizard wording, how to decline/switch off later,
  what changes when you do (nothing else), and the chat-only parity path.
- [x] T029 Live checks: `node --check status/radio.mjs status/emit-status.mjs`;
  quickstart §4 (radio-off = zero network, exit 0). Mark §7 DEFERRED in the SC table.

**Checkpoint**: US4 client side complete; SC-005 explicitly open, awaiting the bridge.

---

## Phase 7 — Polish & release readiness

- [x] T030 `CHANGELOG.md` — 0.2.0 entry (wizard, control panel, Library + seven
  packages, radio client, constitution 1.1.0), template_version bump in the status
  template.
- [x] T031 Full quickstart pass (§1–§6) recorded; SC-001..006 status table appended to
  this file's Completion notes.
- [ ] T032 ⏸ DEFERRED (bridge): quickstart §7 radio round trip → close SC-005; update
  contracts/bridge-radio.md status line.
- [ ] T033 ⏸ STANDING (SC-006): non-technical dry run re-run per
  `NON-TECHNICAL-DRY-RUN.md` covering Press Start + one Library install (a real person,
  not the founder).

---

## Dependencies & execution order

Phase 2 → Phase 3 and Phase 6 (both write/read the 1.1.0 regions) → Phase 5 (packages
reference `radio.mjs report-install` and the `packages` map) → Phase 4's T015 last-ish
(README links to pages that must exist) — in practice: 2 → 3 → 6 → 5 → 4 → 7, with
Phase 5's package tasks parallel among themselves and T016 parallel to everything.

## Explicitly deferred (not tasks in this file)

- The bridge itself and welcome-pack minting — sister feature `002-intelligence-bridge`.
- Publishing the repo to GitHub + screenshots per `SHOTLIST.md` — the founder's own
  step, deliberately (SC-006 note in spec Assumptions).
- Windows live run of the wizard (code is written for it; the founder's fleet is
  mac-only today) — first Windows client install doubles as the check, per the
  live-verification discipline.

---

## Completion notes — 2026-07-25 build

Quickstart §1–§5 executed on the founder's Mac (macOS, Node v22.15.0); §6 written and
waiting on live client-data sessions; §7 deferred with the bridge. Success-criteria
scoreboard at commit time:

| SC | Status | Evidence |
|---|---|---|
| SC-001 (Press Start → handoff, <10 min, zero credentials seen) | ✅ observed | Fresh, resumed, declined, and pack-entry runs on this Mac; wizard detected macOS + 4 AI surfaces, asked exactly one surface question, reached handoff in under a minute; masked key never echoed (last-4 only) |
| SC-002 (one-screen README orientation) | ◐ built, awaiting dry-run observation | Press Start is the first actionable element; Library buttons land on install-prompt-first pages; to be *observed* per NON-TECHNICAL-DRY-RUN.md (T033) |
| SC-003 (three agent smoke tests on live non-source data before Kira) | ◐ runnable, not yet run | Each PACKAGE.md ends with its live smoke test; call-planner generator verified against synthetic data; live passes are the pre-Kira release gate |
| SC-004 (scrub grep zero) | ✅ green | Both tiers zero hits (`scrub-check.md`), run at commit |
| SC-005 (radio round trip live; zero outbound when off) | ⏸ deferred — bridge unbuilt | All four doors verified against a local mock (payloads per contract); radio-off/unconfigured paths verified zero-network; live round trip = quickstart §7 when `002-intelligence-bridge` deploys |
| SC-006 (non-technical dry run to `validated`) | ⏸ standing gate | Protocol unchanged; next run should cover Press Start + one Library install |
