# Quickstart: proving the Production Line works

**Phase 1 output** | **Plan**: [plan.md](plan.md)

Live checks, not assumptions (Article VIII). Run from the repository root. Checks 1–6
are runnable today; check 7 is written but **deferred until the sister bridge feature is
live** — it must never be recorded as passed before then.

## 0 — Prerequisites

- Node.js present (`node --version`) — the wizard's whole premise.
- A copy of this repository whose `status/status.json` you're allowed to play with. To
  simulate a brand-new client: move `status/status.json` aside; the wizard/agent
  recreates it from the template.

## 1 — Syntax gate (every script, every change)

```bash
node --check start.mjs && node --check status/radio.mjs && node --check status/emit-status.mjs && node --check library/agents/call-planner/build-call-plan.mjs && echo ALL-PASS
```

**Pass**: `ALL-PASS` and nothing else.

## 2 — Wizard, fresh run (US1 / SC-001)

```bash
node start.mjs
```

**Pass when all of these are observed**:
- It reports the machine and found AI tools in plain words, asks nothing detection
  already answered, and asks the surface question **only if** two or more surfaces were
  found.
- The check-in choice appears pre-ticked, plainly worded, decline is one keystroke.
- With no welcome pack: it says what's missing, who to ask, radio stays off, and it
  continues — no dead end.
- It ends with a copy-ready handoff prompt tailored to the chosen surface.
- `status/status.json` now contains a `machine_profile` matching
  [contracts/status-additions.schema.json](contracts/status-additions.schema.json), and
  `sharing.radio_choice` is set.
- Total time comfortably under 10 minutes; zero credentials seen or echoed.

## 3 — Wizard, resumed run (Article II)

Run `node start.mjs` again after check 2 (and again later, mid-install).

**Pass**: it opens with "welcome back", states where things stand from the bookmark,
re-asks neither the surface question nor the check-in choice, refreshes detection
silently, and re-prints the handoff prompt.

## 4 — Decline path (US4 scenario 2 / FR-011)

On a fresh `status.json`, decline the check-in.

**Pass**: `sharing.status_signal_enabled` is `false`, `sharing.radio_choice` is
`"declined"`; `node status/radio.mjs check` and `node status/radio.mjs signal --type
install_checkpoint` both print a plain radio-off line, touch the network zero times, and
exit 0. Everything else about the install behaves identically.

## 5 — Scrub check (FR-006 / SC-004)

Run both commands in [scrub-check.md](scrub-check.md).

**Pass**: zero hits, both tiers.

## 6 — Package smoke tests (US3 / SC-003)

Each of the seven `library/**/PACKAGE.md` pages ends with its own smoke test on the
client's own live data. For release readiness (SC-003: before Kira's session), the three
**agent** packages must each pass on a real, non-source dataset — the founder's Daily
Practice accounts count.

**Pass**: each package's "you'll know it worked when…" line observed;
`packages.<slug>.smoke_test_passed` flipped to `true` in `status/status.json` only on
real passes.

## 7 — Radio round trip (SC-005) — ⏸ DEFERRED: bridge not built

When `002-intelligence-bridge` is live and a real welcome pack exists:

1. Fresh wizard run, accept the check-in, enter the pack → **pass**: wizard prints that
   the first signal landed (2xx), and the bridge's `intelligence_signals` shows one
   `install_checkpoint` row for this harness.
2. Post a nudge for this harness from the Daily Practice side → start a session →
   **pass**: the agent reads it out in plain words before other work; replying "yes,
   send: …" lands the reply attached to the nudge.
3. Install any package → **pass**: the shelf shows slug/kind/version for this harness.
4. Set `sharing.status_signal_enabled` to `false` → repeat all of the above → **pass**:
   zero requests leave the machine (verify by the bridge's logs showing nothing).

Until this section runs green, [contracts/bridge-radio.md](contracts/bridge-radio.md)
keeps its "not built" status line and SC-005 stays open.

## 8 — The standing gate (SC-002 / SC-006)

The README one-screen test and the full non-technical dry run follow
`NON-TECHNICAL-DRY-RUN.md` — a real person, not the founder, unassisted. Feature 001's
T033 discipline carries forward unchanged: observed, not assumed.
