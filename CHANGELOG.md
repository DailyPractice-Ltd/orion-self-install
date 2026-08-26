# Orion self-install — Changelog

Semantic versioning: a real self-serve install's corrections/learnings → minor; a change
to the install sequence or repo structure → major; wording/clarity fixes → patch.

This changelog tracks **this repo's own** version history — independent of
`packages/harness/templates/install-kit/CHANGELOG.md` in `dailypractice-mono`, which tracks
the coach-led kit this repo was adapted from. Cross-reference, don't duplicate: a change
that applies to both gets made in both places, cited both ways.

---

## Unreleased — candidates

- No self-serve *client* has been through this repo yet (the founder's own 26 Jul
  walkthrough is logged as Vol. 0, not Vol. 1). The first real self-serve install is
  this repo's "Vol. 1," the same way Sugar Free Sundays and Solo Community were for the
  coach-led kit — and SC-006 stands: a real non-technical person, not the founder,
  through `NON-TECHNICAL-DRY-RUN.md`, now covering Press Start + one Library install.
- Daily Practice's own preferred Spec Kit starter template has not yet been supplied; this
  repo currently vendors `dailypractice-mono`'s own `.specify/` setup as the seed (see
  `specs/001-self-install/plan.md` §1). Swap-in, not a blocker.
- ~~Repo visibility/license~~ — resolved 2026-07-26: **public + MIT**, live at
  https://github.com/DailyPractice-Ltd/orion-self-install (Template Repository).

## 0.5.7 — 2026-08-26

**"Update my harness" is now the whole interface.** The lesson keeps repeating:
anything a coach hand-authors per client — hiring prompts, update file lists — is a
product gap. This closes the update one.

- **`update/manifest.json`** — the generated allowlist of Daily Practice's files. An
  update refreshes exactly these paths from main and may not write anything else. The
  client's knowledge base, hired agents, taught skills, status, shift log, and every
  file they created survive **by construction**, not by care.
- **`docs/updating.md`** — the procedure: manifest always fetched from main (so new
  files are never missed), version compare that refuses to roll back, a full backup to
  `.update-backup/` before any replace (undo is "restore my harness from the backup"),
  `node --check` on every fetched script so a truncated download fails loudly, the
  personalisation tripwire, the radio proof, and the plain-words report.
- **`/update-harness`** thin skill + the AGENTS.md trigger, same pattern as hiring.
  The same three words work from any baseline — a 0.3.0 install and yesterday's run
  the identical procedure and both land on main.

## 0.5.6 — 2026-08-26

**The radio's third state, and Codex becomes a real citizen.** (0.5.4/0.5.5 are landing
separately from a concurrent working session — version numbers reserved by their drafted
entries.)

A live cohort running Codex + ChatGPT Work went radio-silent between sessions and the
diagnosis found three compounding causes: Codex's safety sandbox blocks network by
default, so `radio.mjs` calls died with "didn't answer"; `codex` was a first-class
wizard surface with **zero** presence in any instruction file (no adapter, no AGENTS.md
mention, while `claude-code.md` claimed signal exclusivity); and the state "radio on,
scripts available, call failed" had no doctrine anywhere — every rule was a binary of
on/off × scripts/no-scripts, so failures fell through to silence with exit 0.

- **`agent/adapters/codex.md`** (new): the sandbox fix (`network_access = true` under
  `[sandbox_workspace_write]` in `~/.codex/config.toml`, proven live with one `check`),
  the approval-retry fallback, and Codex quirks. `claude-code.md`'s exclusivity line now
  names both code-capable adapters; AGENTS.md rules 4 and 6 list `codex.md`.
- **The third state enters doctrine**: rule 2 gains the fourth case ("didn't answer" →
  one plain sentence to the client, once per session, with the fix pointer — never
  silence, never retry loops); rule 7 mirrors it for signals; HIRING.md's shifts append
  "(radio unreachable)" to their shift-log line so quiet weeks are diagnosable.
- **`docs/radio.md` gains "If the radio can't get through"**: the five stdout lines and
  their meanings, the Codex sandbox fix, and the corporate-network lane (browser test,
  then the one-line IT allowlist ask) learned on a locked-down client machine.
- **`chatgpt.md` finally says the word "radio"**: it does not run there, by design; what
  that means for visibility; never simulate a check. A signals-only GPT Action is noted
  as a considered future design, not improvised.

## 0.5.3 — 2026-08-14

**The post-merge review's findings, fixed.** An adversarial review of 0.5.0/0.5.1
found three semantic breaks behind the clean surface; all closed here.

- **The note comes off the wire.** Every disclosure layer promised "never content"
  while the shift report carried up to 200 chars of free text. Decision: the radio
  carries the label, the count, and the time; the one-line story lives locally in
  `status/shift-log.md`. `radio.mjs` no longer sends `--note` (it says so and sends
  without it), and HIRING.md's report step matches. The constitution's Article V is
  now true to the byte.
- **The probation gate means something again.** The hire session's wiring test
  hand-kicks the scheduler, whose prompt writes `auto:` — manufacturing the exact
  evidence probation is defined by. The wiring test now renames its own line to
  `auto-test:`, which never counts (HIRING.md step 7, the anatomy contract, the
  roster legend).
- **`routine_completed` requires its label and count client-side** — a bare shift
  report re-creates the same-second collision the type shipped to fix. `--count`
  accepts plain digits only (no `0x12`, no `1e3`, no empty value silently becoming a
  false "failed run").
- `radio.mjs`'s stale header (six types, "type + timestamp only") rewritten; its
  runtime strings say "radio", never "Mailbox". The scheduler task prompt is now
  quote-free so the schtasks/launchd fallback lines embed it verbatim safely.
  bridge-radio.md's replay key, type count, and unattended qualifier reconciled;
  the constitution's live Article V text says "radio inbox". `create-skill`'s
  trigger routes schedule-shaped requests to the hire path.

## 0.5.2 — 2026-08-14

**Fixed a self-contradiction: "no coach" vs. "your coach will read you a code."**
`README.md`'s opening line promised no coach or consultant is involved; six lines
later in the actual flow, the wizard's opening promises, its pairing step, and
`docs/radio.md`'s own explainer all presumed a coach exists and is on a call with the
reader. A genuinely solo reader — the one this whole repo is written for — would hit
"your coach" with no coach and no call, right at the moment they're most likely to
doubt themselves.

- `README.md` (opening line), `start.mjs` (opening promises, the pairing-step intro,
  and three downstream messages in `pairingStep()`, plus its docstring), and
  `docs/radio.md` all reworded so the pairing code is conditional ("if Daily Practice
  has given you one") instead of assumed, and state plainly that going solo with no
  code is the default path, not a fallback. Verified no remaining unconditional
  "coach" references in any of the three client-facing files; `node --check start.mjs`
  passes.
- Re-checked `{{DAILY_PRACTICE_SUPPORT_CONTACT}}` against the goal text's "unfilled in
  three files" claim — already resolved 2026-07-12 per `data-model.md`'s own
  placeholder table (`support@dailypractice.world`, all three original files). No
  action needed; noting it here since that claim is now stale.

## 0.5.1 — 2026-08-14

**`routine_completed` goes live.** The shift report gets its own signal type, mirrored
from the bridge (mono PR #20, migration applied to production the same day).

- `radio.mjs` accepts `--type routine_completed`; HIRING.md's report step, AGENTS.md
  rule 7, the agent definition, `docs/radio.md`, and the bridge-radio contract all move
  from the interim two-type mapping to the real type. Signals sent under the interim
  mapping remain valid history.
- Server-side, the replay key now includes the routine label — same-second shifts from
  different agents are distinct rows, verified live with a two-agents-at-07:00 insert
  and a rejected exact duplicate.

## 0.5.0 — 2026-08-14

**The hiring layer.** Install #3 (4–5 Aug) invented the agent team live: a client drew
her sales org on paper and left with a first agent hired, scheduled, and reporting.
This release makes that repeatable without a coach writing prompts by hand.

- **`library/HIRING.md`** — the canonical workflow: the six-part anatomy (job,
  training, skill, tools, shift, report), a five-question interview that never re-asks
  the knowledge base, the job-sheet readback, a nine-step execution checklist, the
  shift-wiring ladder (native scheduled task → OS scheduler verbatim fallbacks →
  handoff trigger), promotion rules with the two-of-three second-job test, the
  create-skill delta, and honest lanes for chat-only surfaces, scheduler failures, and
  half-done hires. Absorbs and replaces `ROUTINE-TEMPLATE.md`.
- **`/hire-agent` and `/create-skill`** — thin skill wrappers so the workflow triggers
  mid-conversation on Claude Code; `AGENTS.md` carries the same trigger for every
  other surface. The teach line ships with it: **@ summons an agent — a who. / runs a
  skill — a what.**
- **`.claude/agents/README.md`** — the roster, seeded empty.
- **Radio**: `signal` gains `--routine`, `--count`, `--note`, so a shift can say
  "prospecting, 18" instead of only "something ran" (carried from the 4 Aug branch).
  `AGENTS.md` rule 7 now carries the standing-yes clause — the approved job sheet is
  the written yes for a shift's staging work and its report. Rule 2 says "radio",
  never "mailbox" (install #3: the agent searched Outlook).
- **Constitution 1.2.0** — Article V 1(b) discloses the routine label and count.
  `docs/radio.md` gains the "a shift ran" row in lockstep.
- **Contract**: `specs/002-production-line/contracts/agent-anatomy.md` — the shape of
  a hired agent, probation → GO-LIVE semantics, naming rules, bookkeeping precedence.
- **Connectors**: the checklist now branches Google/Microsoft at the top (install #3
  ran Outlook + Microsoft 365 end to end against a Google-only checklist).

## 0.4.0 — 2026-07-28

The first real client install (Kira Hartig, Astute Tech — this repo's Vol. 1) exposed
two faults on the same afternoon. 0.3.2 patched the symptom; this release removes the
cause.

**What went wrong.** The coach ran `install-prep`, which minted an install token, and
then carried that secret by hand to the client — through a Teams chat and a session
transcript. It had to be rotated. That is not a mistake anyone made; it is what the
design required, and any channel a secret crosses is a place it lives forever. Separately,
the client's agent drove the wizard by piping answers; the AI-surface question is
conditional, so every answer shifted by one and a stray `y` landed in the radio address.

### Changed

- **A pairing code replaces the four-value welcome pack.** The coach reads out one
  twelve-letter code (`BCDF-GHJK-LMNP`); the wizard exchanges it at the new
  `POST /api/bridge/pair` door, and **the install token is minted inside that exchange**.
  No token exists until the client's own machine asks for one. `install-prep` no longer
  prints — or can mint — a secret at all.
  - The alphabet is RFC 8628's 20 consonants: no vowels (a code can never spell a word),
    no digits (`0`-vs-`O` and `1`-vs-`I` cannot arise, because neither half of either
    pair is in the alphabet). 51.9 bits, single use, 15-minute life.
- **The wizard asks one question where it used to ask five.** "Do you have it handy?
  [y/N]" is gone — it was the slot that swallowed the stray `y`, and "type your code or
  press Enter" says the same thing without the ambiguity.
- **`askMasked` removed.** A code read aloud on a call must be visible while you type it;
  masking made typo recovery impossible for a non-technical client, and a pairing code is
  not a password.

### Added

- **Keyed answers, so a scripted caller can never misalign again.** `code=…`,
  `checkins=…`, `surface=…` in any order; a line addressed to one question is never
  consumed by another, even when lines arrive faster than questions are asked. Plus
  `--code`/`ORION_PAIRING_CODE` (the documented path for an AI agent — no piping at all),
  `--checkins`, and a report naming any answer line that went unused. Today's bug would
  have shouted instead of failing silently.
- **`--repair-radio`** — clears the radio settings and pairs again. Required after a
  rotation: a revoked key is still perfectly well-formed, so nothing else would reopen
  the pairing step.
- **401 self-heal** — an already-paired install asks the radio once, quietly, whether its
  key still works. Only a definite 401 acts (offline or any other answer stays silent),
  turning every future rotation into a re-pair rather than a support ticket.
- **`status/shapes.mjs`** — one definition of what the radio settings must look like,
  now shared by `start.mjs`, `status/radio.mjs` and `status/emit-status.mjs`. 0.3.2 only
  hardened the wizard; the radio itself still trusted mere presence, so a poisoned
  `status.json` would pass its gate and fail every call. A sibling `.mjs` import needs no
  package.json and no install — the zero-dependency promise is untouched.
- `sharing.paired_at` (schema 1.3.0), and timeouts on all five outbound `fetch` calls —
  there were none, so a black-holed connection could hang the wizard in front of a client.

### Fixed

- `status.schema-template.json` stamped `template_version: "0.3.1"` while the repo was at
  0.3.2. That value goes into every client's bookmark **and every signal payload**, so it
  was quietly mislabelling fleet telemetry. Now 0.4.0.
- The quickstart syntax gate now covers `status/shapes.mjs`.

## 0.3.2 — 2026-07-28

Found during the **first real client install** (Kira Hartig, Astute Tech — this repo's
Vol. 1 in progress). The client worked entirely inside a code-capable agent with no
terminal, so the agent drove `start.mjs` by piping answers to it — a supported path
(the `pendingLines` queue exists for exactly that), but one with a sharp edge.

### Fixed

- **A misaligned piped run could poison the radio permanently, and silently.** The
  AI-surface question in Step 1 only appears when a machine has more than one AI tool
  installed, so a caller that guesses wrong shifts every later answer up by one — a `y`
  intended for "keep check-ins on?" lands in the radio-address box. Nothing caught it:
  the old guard only tested that the values were non-empty, and `"y"` is non-empty, so
  `radioConfigured()` reported the radio as configured forever while every signal failed
  against an address of `y`. Under the North Star that's the worst class of bug — a
  harness that is genuinely running but can never be counted.
  - The three welcome-pack values are now shape-checked at capture (`RADIO_URL_RE`,
    `HARNESS_ID_RE`, `INSTALL_TOKEN_RE`). A value that doesn't match is never saved;
    the wizard names each wrong field in plain words and leaves the radio unset, which
    the existing `radio_choice === 'accepted' && !radioConfigured()` branch re-opens on
    the next run.
  - `radioConfigured()` now tests shape rather than mere presence, so a `status.json`
    already poisoned by an earlier misaligned run **self-heals**: the next
    `node start.mjs` re-offers the welcome-pack step instead of trusting the garbage.

## 0.3.1 — 2026-07-27

Backported three correctness fixes from the coach-led kit's own line
(`packages/harness/templates/install-kit`, now kit 1.3.0) — this repo forked from that
kit at an earlier point and never picked these up. Found while answering a cross-session
audit's question about A1/A2/A3 status; all three were already fixed upstream, just not
here.

### Fixed

- **A1 — n8n approval emails rendered "undefined"** (`n8n/wf-01-prospect-research-outreach.json`,
  `n8n/wf-02-post-call-debrief.json`): both approval nodes read `prospect_name` /
  `prospect_summary` / `contact` / `call_summary` / `proposed_stage` / `crm_update` off
  bare `$json`, but their immediate upstream is the Gmail draft-create node, whose output
  replaces `$json` with the created-draft resource — so the client's approval email showed
  "Approve: add undefined to your pipeline?" with an undefined summary. The client would
  have been approving blind, exactly the failure the staged-approval architecture exists
  to prevent. Fixed by reading `$('Split sections').first().json.<field>` instead, matching
  the CRM-write nodes two steps later (which already did this correctly).
- **A2 — HubSpot `isClosed` sent as a boolean, not a string** (`crm/hubspot/apply-hubspot-template.mjs`):
  HubSpot's Pipelines API expects deal-stage `metadata` values as strings; a JS boolean
  could 400 with "property values were not valid," which the surrounding `catch` then
  misclassified as a plan-tier limit — telling the client to rename their pipeline by hand
  when the real cause was a malformed payload. Fixed: `isClosed: String(Boolean(...))`.
- **A3 — pipeline-exists check was count-based, not name-based** (same file,
  `ensureDealPipeline`): the script treated "more than one pipeline already exists" as
  "ours is already there," so a portal with 2+ *unrelated* pipelines would silently skip
  creating the Orion one and report success. Fixed: match by the target pipeline's own
  label among existing pipelines, regardless of how many others exist.

## 0.3.0 — 2026-07-26

Two same-day passes: the radio reconciled against the deployed bridge (002a), and the
onboarding journey reworked from the founder's own live walkthrough
(`docs/self-serve-learnings.md` Vol. 0).

### Changed

- **Radio speaks the deployed bridge's actual protocol** (002a reconciliation, verified
  live): `occurred_at` replaces `sent_at` in every signal; the mailbox parses the
  `{ nudges: [...] }` envelope; replies send `{ body }`; the unauthenticated 001-era
  `status_signal_endpoint` webhook is removed outright (status schema 1.2.0 — the
  authenticated radio is the only outbound path); both n8n workflows' legacy webhook
  nodes replaced with bridge-shaped Radio signal nodes (disabled by default);
  `contracts/bridge-radio.md` rewritten to deployed truth, live round trip recorded.
- **README restructured around the walkthrough's four findings**: new Step 2 "Move it
  to its home" (`Github → Projects` convention); Step 3's terminal method is now
  open-from-search + `cd ` + drag-the-folder + Enter; Step 4 is agent-agnostic ("open
  the folder with your AI, or hand it AGENTS.md" — vendor specifics demoted to
  examples); new "Once installed, use Orion from any project" section. Press Start
  stays the first actionable element, reframed as three moves.
- Wizard handoffs aligned: Claude desktop app now routes via its **Code** tab
  (Project-upload kept as fallback); folder wording matches the new home convention.
- `SHOTLIST.md` rebuilt around the new journey; screenshots 01–05 + 07 landed in
  `docs/img/` (03/04/05/07 redaction-processed — no non-Orion business data survives);
  06a/06b (website lane) still pending.

### Added

- **Codex as a first-class surface**: contract vocabulary (`codex` slug), wizard
  detection (`codex` on PATH / `~/.codex`), plain-words description, and its own
  handoff. Answers the walkthrough's "what if I'm working on Codex?" directly.
- `docs/self-serve-learnings.md` Vol. 0 — the founder-walkthrough findings, logged.

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
