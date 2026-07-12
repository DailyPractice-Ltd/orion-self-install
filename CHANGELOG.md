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
