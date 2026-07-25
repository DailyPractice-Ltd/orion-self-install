# Implementation Plan: The Production Line

**Branch**: `002-production-line` | **Date**: 2026-07-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-production-line/spec.md`

---

## Summary

Turn the foundation repo (feature 001) into a production line: a **Press Start wizard**
(`start.mjs`) that looks at the machine so the client never has to, a **README that works
like a control panel** (Press Start on top, the Library below), a **Library packaging
shape** (`library/<kind>/<slug>/PACKAGE.md`) filled day-one with battle-tested packages
extracted from the founder's live operating harness, and the **client side of the two-way
radio** — opt-in-gated signals out, a nudge mailbox in — built against the sister
`002-intelligence-bridge` contracts and stubbed until those doors exist. Design decisions
in [research.md](research.md) (R1–R7).

---

## Technical Context

**Language/Version**: Markdown (content), plain Node.js scripts with zero dependencies
(`node:` built-ins + global `fetch` only — no `package.json`, no `npm install` step
anywhere). Matches `status/emit-status.mjs` exactly.

**Primary Dependencies**: none beyond the client's own AI assistant. Node.js remains an
optional accelerator: Press Start needs it, but the conversational path reaches every
same outcome without it (FR-010).

**Storage**: `status/status.json`, extended in place (schema 1.0.0 → 1.1.0): a
`machine_profile` object, radio fields inside `sharing`, and a `packages` map. Shape
specified in [data-model.md](data-model.md) and
[contracts/status-additions.schema.json](contracts/status-additions.schema.json) before
any code writes it (Article VII).

**Testing**: live-check-based (Article VIII): `node --check` on every new script, a real
wizard run on a real machine reaching the handoff prompt, package smoke tests against
live non-source data, the scrub grep ([scrub-check.md](scrub-check.md)), and the standing
non-technical dry run (SC-006). Radio round-trip verification is deferred until the
bridge exists (R3) and is marked as such everywhere it appears.

**Target Platform**: the client's own machine (macOS and Windows first-class; Linux
degrades gracefully) plus whatever AI product they already use.

**Project Type**: standalone template repository — unchanged from feature 001.

**Performance Goals**: SC-001 — Press Start to handoff prompt in under 10 minutes with
zero commands beyond the start command; wizard probes must feel instant (no network calls
during detection).

**Constraints**:
- One dependency-free file for the wizard; no install step may precede Press Start.
- The wizard never sees, echoes, or stores a credential outside its documented home
  (R2); it stops at every credential moment and waits.
- Nothing outbound unless the radio is on **and** configured; declining changes nothing
  else (FR-008, FR-011).
- Zero source-harness identifiers in any client-facing file (FR-006, SC-004, enforced by
  [scrub-check.md](scrub-check.md)).
- New top-level directory `library/` is in-spec (FR-004/FR-005) — Article X satisfied by
  this spec.

**Scale/Scope**: single-operator, single-client-per-copy, many independent copies —
unchanged.

---

## Constitution Check (Phase -1 Gates)

*GATE: cleared before Phase 0 research; re-checked after Phase 1 design. See
`.specify/memory/constitution.md` (amended to 1.1.0 by this feature — see below).*

- [x] **Art. I — Non-Technical-First**: every wizard step speaks plainly before it acts;
  the README's Press Start carries an "if that didn't work" no-wizard route; every
  Library page leads with what the thing means, then the mechanics; the manual
  (conversational) path stays first-class (FR-010).
- [x] **Art. II — Resumable by Default**: everything the wizard learns or the client
  chooses lands in `status/status.json` (`machine_profile`, `sharing`, `packages`) and is
  read back on re-run ("welcome back — you're at step N"). No state lives only in a
  session.
- [x] **Art. III — Reputation Safety**: all three agent packages produce buyer-facing
  drafts, so each PACKAGE.md carries the refusal behaviour and its smoke test references
  the VT-05 boundary discipline. Nothing auto-sends, anywhere.
- [x] **Art. IV — Client-Owned, Transparent Data**: no new store; call plans, reports,
  and prospect lists live in the client's own copy and accounts. The only cross-boundary
  flows are the two Article V channels.
- [x] **Art. V — Explicit, Opt-In Data Sharing**: the radio is channel 1, amended in
  writing (1.1.0) to enumerate exactly what it carries (stage signals, work heartbeats,
  package-install reports, the two-way mailbox) under the same single on-by-default,
  one-click-decline toggle; channel 2 stays off-by-default and untouched (R4).
- [x] **Art. VI — Template Integrity**: every new placeholder is registered in
  [data-model.md](data-model.md)'s placeholder inventory with a named fill-owner.
- [x] **Art. VII — Spec-Before-Build**: [data-model.md](data-model.md),
  [contracts/status-additions.schema.json](contracts/status-additions.schema.json),
  [contracts/package-shape.md](contracts/package-shape.md), and
  [contracts/bridge-radio.md](contracts/bridge-radio.md) precede `start.mjs`,
  `status/radio.mjs`, and every PACKAGE.md.
- [x] **Art. VIII — Live-Verification Imperative**: the wizard verifies (a real run on a
  real machine), packages carry smoke tests on the client's own data, and
  [quickstart.md](quickstart.md) is the live-check protocol. The radio's live round-trip
  is the one check that cannot run yet — recorded as deferred, never as passed.
- [x] **Art. IX — Model-Adapter Portability**: the wizard changes no behaviour — it only
  detects surfaces and hands off; package install prompts are surface-neutral; the
  session-start mailbox check lands in `AGENTS.md` (behaviour), with only mechanics
  differing per surface.
- [x] **Art. X — Foundation Scope Discipline**: `library/` and the radio are scoped by
  this spec (FR-004..009). The two extra shelf-fillers (skill, program) are Library
  packaging under FR-005, extracted not invented (R6).

**Constitution amendment carried by this feature**: Article V channel 1 rewritten to name
the radio's contents; version 1.0.0 → 1.1.0 (MINOR — materially expanded gate). Proposed
in writing via this plan; approval is the founder's merge of this branch (Amendment
Process, constitution §Amendment).

**All ten gates pass. No Complexity Tracking entries required.**

---

## Project Structure

### Documentation (this feature)

```text
specs/002-production-line/
├── spec.md              # committed at 0a05ed1
├── plan.md              # this file
├── research.md          # Phase 0 — decisions R1–R7
├── data-model.md        # Phase 1 — status.json 1.1.0, welcome pack, package, nudge
├── quickstart.md        # Phase 1 — the live-check protocol for this feature
├── scrub-check.md       # SC-004 — the defined grep list + how to run it
└── contracts/
    ├── status-additions.schema.json   # machine_profile, sharing radio fields, packages
    ├── package-shape.md               # the PACKAGE.md contract (FR-005)
    └── bridge-radio.md                # client-side view of /api/bridge/* + stub posture
```

### Source tree (repository root — new and changed only)

```text
orion-self-install/
├── start.mjs                     # NEW — the Press Start wizard (one file, no deps)
├── README.md                     # REWORKED — control panel: Press Start + the Library
├── AGENTS.md                     # EXTENDED — mailbox check, library installs, wizard awareness
├── library/                      # NEW — the Library (FR-004/005)
│   ├── README.md                 # what a package is, how installing works
│   ├── agents/
│   │   ├── prospecting/PACKAGE.md
│   │   ├── call-planner/{PACKAGE.md, build-call-plan.mjs, call-data.template.json}
│   │   └── friday-report/PACKAGE.md
│   ├── skills/meeting-sizing/PACKAGE.md
│   ├── workflows/
│   │   ├── prospect-research-outreach/PACKAGE.md   # wraps existing n8n/wf-01
│   │   └── post-call-debrief/PACKAGE.md            # wraps existing n8n/wf-02
│   └── programs/revenue-operating-cadence/PACKAGE.md
├── status/
│   ├── radio.mjs                 # NEW — bridge client: check / reply / signal / report-install
│   ├── emit-status.mjs           # TOUCHED — prefers bridge transport when configured
│   ├── status.schema-template.json  # EXTENDED — 1.1.0 fields, all null/empty defaults
│   └── status-schema.md          # EXTENDED — new field rows
├── docs/radio.md                 # NEW — plain-words radio disclosure + chat-path parity
└── .specify/memory/constitution.md  # AMENDED — Article V channel 1, v1.1.0
```

**Structure Decision**: one new top-level directory (`library/`), named and scoped by this
spec; everything else extends files feature 001 already owns. The wizard lives at the
repo root because "the first thing you press" should be the first thing you see.

---

## The production-line mechanic, end to end

1. **Press Start** — the client runs `node start.mjs` (README's first actionable element).
   The wizard probes the machine (R1), writes `machine_profile` into `status/status.json`,
   asks the one fork only a human can pick (two AI tools found → "which runs your
   harness?"), walks the remaining checks one at a time, and stops at every credential
   moment for the client to type it themselves (R2).
2. **The check-in choice** — pre-ticked, plainly worded, one keystroke to decline. Accept
   with a welcome pack → endpoint + key land in `sharing`, first signal sent during the
   session (stub-aware until the bridge exists — R3). Decline → everything else identical,
   nothing outbound ever.
3. **Handoff** — the wizard prints the copy-ready prompt that drops the client into the
   `AGENTS.md` install sequence on their chosen surface, and says exactly where the
   bookmark stands. Re-running the wizard later reads the bookmark and resumes; it never
   restarts from zero.
4. **The Library** — any time after install, the client opens a package page from the
   README, pastes the install prompt into their AI, and the AI installs it: files read,
   placeholders filled in conversation, smoke test run on the client's own data,
   `packages` map updated, and — radio on — the install reported to the shelf.
5. **The radio, both ways** — at session start the agent checks the mailbox
   (`status/radio.mjs check`), reads any nudge out in plain words, and sends a reply only
   on the client's yes. Real work emits heartbeats; package installs emit shelf reports.
   Radio off → all of it silently skipped, forever, until the client says otherwise.

---

## Complexity Tracking

> No violations to justify. One new top-level directory, in-spec; zero new dependencies;
> two scripts and a body of markdown.
