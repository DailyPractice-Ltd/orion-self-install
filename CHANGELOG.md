# Orion self-install — Changelog

Semantic versioning: a real self-serve install's corrections/learnings → minor; a change
to the install sequence or repo structure → major; wording/clarity fixes → patch.

This changelog tracks **this repo's own** version history — independent of
`packages/harness/templates/install-kit/CHANGELOG.md` in `dailypractice-mono`, which tracks
the coach-led kit this repo was adapted from. Cross-reference, don't duplicate: a change
that applies to both gets made in both places, cited both ways.

---

## Unreleased — candidates

- No self-serve client has been through this repo yet. Everything here is a first-principles
  adaptation of the coach-led kit (v1.1.0) plus original design for resumability and
  non-technical delivery — it has not been field-tested. The first real self-serve install
  is this repo's own "Vol. 1," the same way Sugar Free Sundays and Solo Community were for
  the coach-led kit.
- Daily Practice's own preferred Spec Kit starter template has not yet been supplied; this
  repo currently vendors `dailypractice-mono`'s own `.specify/` setup as the seed (see
  `specs/001-self-install/plan.md` §1). Swap-in, not a blocker.
- Repo visibility/license (public+MIT vs. private+invite) is a recommended default, not yet
  confirmed by the founder — see the plan.
- The radio's live round trip (first signal, nudge, reply, shelf report against the real
  bridge) is deferred until `dailypractice-mono` feature `002-intelligence-bridge` is
  deployed — client side ships stubbed-off (`sharing.bridge_url: null`) and verified
  against a local mock only. See `specs/002-production-line/quickstart.md` §7.

## 0.2.0 — 2026-07-25

The Production Line (`specs/002-production-line/`): Press Start, the README control
panel, the Library with seven day-one packages, and the client side of the two-way
radio.

### Added

- `start.mjs` — the Press Start wizard: one dependency-free file that detects the
  machine (OS, Node, git, installed AI surfaces), writes `machine_profile` into the
  bookmark, asks at most one surface question, presents the pre-ticked check-in choice
  with one-keystroke decline, takes the welcome-pack key via masked input (never
  echoed), sends the first signal when configured, and hands off with a copy-ready
  prompt per surface. Fully resumable; safe defaults on non-interactive runs.
- `library/` — the Library: `library/<kind>/<slug>/PACKAGE.md` packaging shape
  (contract: `specs/002-production-line/contracts/package-shape.md`) with seven
  packages: agents `prospecting` (0.9.0), `call-planner` (1.0.0, with dependency-free
  `build-call-plan.mjs` + data template), `friday-report` (1.0.0); skill
  `meeting-sizing`; program `revenue-operating-cadence`; workflows
  `prospect-research-outreach` and `post-call-debrief` (packaging the existing n8n
  pair). The three agents are extracted from the founder's live operating harness —
  behaviour distilled, every source identifier scrubbed
  (`specs/002-production-line/scrub-check.md`, both tiers green).
- `status/radio.mjs` — the radio client: `check` (session-start mailbox), `reply`
  (client-yes only), `signal`, `report-install`; silent local no-op unless
  check-ins are on AND the welcome pack is configured; never retries, never blocks.
- `docs/radio.md` — the radio's full plain-words disclosure, including the
  website-chat parity lane.
- `README.md` reworked as the control panel: Press Start (one command + honest
  no-Node fallback into the conversational lane) on top, the Library as linked
  buttons below, all trust sections preserved.
- `AGENTS.md`: session-start mailbox check, conversational-path parity for the
  check-in choice (same words as the wizard), `machine_profile` respect, and the
  Library install rules (smoke-test-before-recorded, shelf report when radio on).

### Changed

- `status/status.json` schema 1.0.0 → 1.1.0: `machine_profile`, `packages` map, and
  `sharing.{radio_choice, bridge_url, harness_id, install_token}` — additive; 1.0.0
  files migrate in place on first touch
  (`specs/002-production-line/contracts/status-additions.schema.json`).
- `status/emit-status.mjs` routes the lifecycle signal through the authenticated
  bridge door when the welcome pack is configured; the feature-001 direct-webhook
  fallback is unchanged.
- Constitution 1.0.0 → 1.1.0 (MINOR): Article V channel 1 is now "the radio," its
  four message kinds enumerated in writing under the same single on-by-default,
  one-click-decline toggle. Channel 2 (Intelligence Library) untouched.

## 0.1.0 — 2026-07-12

Initial build. Adapted from `packages/harness/templates/install-kit` v1.1.0 in
`dailypractice-mono` for a self-serve, no-coach, AI-agent-guided context. Seeded at 0.1.0,
not 1.0.0 — the coach-led kit didn't call itself 1.0.0 until real installs' learnings were
mined into it either; this repo follows the same discipline.

### Added

- Vendored `.specify/` + `.claude/skills/speckit-*` from `dailypractice-mono`, unmodified —
  gives this repo working `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`,
  `/speckit-constitution` with zero extra tooling.
- This repo's own constitution (10 articles — 2 new: Non-Technical-First, Resumable by
  Default; the rest translated from `dailypractice-mono`'s 9).
- `AGENTS.md` — the tool-agnostic machine brief read first by any AI agent running the
  install; new pattern for Daily Practice, not used elsewhere yet.
- `agent/` — agent definition and knowledge-base capture adapted from the coach-led kit;
  a 4th adapter (`claude-code.md`) added alongside the existing Claude/ChatGPT/Copilot ones,
  for AI surfaces that can read/write files and run scripts directly.
- `crm/` — Attio and HubSpot templates adapted from the coach-led kit, plus a new
  `other-crm-manual-setup.md` for clients on a third CRM or none.
- `connectors/`, `n8n/`, `validation/` — adapted from the coach-led kit with non-technical
  rewrites and three new validation tasks (VT-00 environment sanity, VT-07 resume-after-
  interruption, VT-08 status-signal emission).
- `status/` — new. The resumability mechanism: a local status file plus an opt-in-gated
  status signal, so an install can pause and resume across sessions, days, or AI tools.
- `notion/project-tracker-template.md` — new client-owned PM tracker template.
- `docs/intelligence-library-opt-in.md` — new, explicit opt-in disclosure (constitution
  Article V), separate from the always-on status signal.
