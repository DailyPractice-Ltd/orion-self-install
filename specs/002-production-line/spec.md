# Feature Specification: The Production Line

**Feature Branch**: `002-production-line`

**Created**: 2026-07-25

**Status**: Updated for required-pairing candidate

**Input**: "The production line: setup wizard, README control panel, library packaging,
client-side bridge wiring." Builds on feature `001-self-install` (the foundation repo).
Sister feature on the Daily Practice side: `002-intelligence-bridge` in `dailypractice-mono`
(the doors this repo's radio will call). Source direction: Peter × Oliver product meeting,
23 Jul 2026 — first three installs reported "exciting, but overwhelming"; first formal
install (Kira) is next.

> **Voice rule for everything this feature ships**: written for a non-technical reader
> first. Lead with what a thing means, then how it works. Every step ends with
> "you'll know it worked when…". (Constitution Article I.)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Press Start: the setup wizard (Priority: P1)

A client downloads the folder, opens the README, and follows one instruction: **Press
Start**. A wizard wakes up and looks at their computer — what machine is this, which AI
tools already live here (Claude? ChatGPT? Copilot?), is anything missing? It writes what
it finds into the bookmark file, then walks the remaining checks one at a time. At every
password moment it stops, opens the right window, and says: *"Type your password here —
I'll wait."* The client types it themselves; the wizard verifies and moves on. At the end,
the wizard hands over a prompt for the recorded supported tool only after verified
pairing and setup report acknowledgment. The assistant then continues installation.

**Why this priority**: this is the single biggest remover of cognitive effort. Every
minute a non-technical client spends guessing is a minute closer to abandoning.

**Independent Test**: in an installed Codex or Claude Code folder, a tester obtains
a self-service code and reaches handoff only after accepted matching verification
and a setup report acknowledgment. Missing or failed steps preserve unfinished setup.

**Acceptance Scenarios**:

1. **Given** a Mac with Claude installed, **When** the client presses Start, **Then** the
   wizard reports the machine and the found AI tools in plain words, records them in the
   bookmark file, and continues — no question the machine could answer for itself is
   asked of the client.
2. **Given** a credential moment (e.g. a CRM key), **When** the wizard reaches it,
   **Then** it opens/points to the right place, waits for the client to type the value
   themselves, confirms it works, thanks them, and moves on. The wizard never asks the
   client to paste a password into the chat or the terminal transcript.
3. **Given** the wizard finishes its checks, **When** it hands off, **Then** the client
   has a copy-ready prompt that starts their AI on the install sequence, and the bookmark
   file shows where the wizard left things.
4. **Given** a plain website-only or paste-only chat, **When** setup is requested,
   **Then** route to an installed folder in Codex or Claude Code; this surface cannot
   run pairing or fresh connection checks and cannot hand off Orion work.
5. **Given** Node is missing, **When** the wizard cannot run, **Then** guide Node
   installation before setup; there is no script-free equivalent of the work guard.

---

### User Story 2 - The README as a control panel (Priority: P1)

The README stops being a linear document and becomes the client's control panel. At the
top: **Press Start** (one command, plus a plain fallback). Below it, built-in skills
link directly to their instructions. Daily Practice can offer extra skills over the radio.

**Why this priority**: the README is the product's face. "Which file do I open?" should
never be a question a client has to ask.

**Independent Test**: a first-time reader can answer, within one screen of the README:
what is this, what do I press first, and where do I get more capabilities later.

**Acceptance Scenarios**:

1. **Given** a fresh reader, **When** they open the README, **Then** Press Start is the
   first actionable element, and each built-in skill link opens its instructions.
2. **Given** a radio skill offer, **When** the client accepts it, **Then** Orion installs
   the skill and smoke-tests it on the client's own data.
3. **Given** the repo is public on GitHub, **When** screenshots exist per `SHOTLIST.md`,
   **Then** the README's four image placeholders are filled.

---

### User Story 3 - Day-one skills, extracted from the battle-tested harness (Priority: P2)

Orion ships three ready skills: **Prospecting** (fill the top
of your pipeline), **Call-Planner Control Tower** (who to call today, in what order, with
context and the likely objection), and **Friday Report** (the week's scoreboard, drafted
for your approval). None of these are invented — each is extracted from the live Workweek
harness that already runs on the founder's machine, distilled, scrubbed of every trace of
Workweek's data, and templatised so it can be trained onto any client's stack.

**Why this priority**: the operating standard is *nothing ships that hasn't been battle-
tested*. These three are the "gym protocol" answer to install overwhelm.

**Independent Test**: each built-in skill passes its smoke test on another business's live data.

**Acceptance Scenarios**:

1. **Given** the Prospecting skill configured with a client's own ICP, **When** the
   smoke test runs, **Then** the skill returns ~20 matching prospects with a one-line
   "why them" each — drafts and lists only, nothing sent.
2. **Given** the Call-Planner installed against the client's CRM, **When** the smoke test
   runs, **Then** today's prioritised call plan is produced from their live pipeline.
3. **Given** the Friday Report installed, **When** the smoke test runs, **Then** one real
   weekly report is produced as a draft for approval.
4. **Given** any extracted package, **When** it is reviewed before entering the public
   repo, **Then** the scrub check passes: zero Workweek identifiers (names, leads,
   prices, credentials, customer names) anywhere in the package.

---

### User Story 4 - The two-way radio (Priority: P2)

Pairing links this folder to a signed-in Daily Practice account and enables required
operational check-ins. The payload remains the existing labels-only disclosure.
Support messages remain separate; replies and contributions need per-item consent.

**Independent test**: self-service code issuance, transactional exchange, matching
read-only verification, stable setup report acknowledgment and handoff. Before
interactive/scheduled work, fresh accepted verification and pending-report delivery
establish the shared silent 48-hour connection allowance; unpaired work is blocked.

**Acceptance scenarios**:

1. Missing, invalid, expired or used code; failed exchange/check/report: setup stays
   unfinished with saved answers and no handoff. Resume by verifying saved exchange
   or obtaining a fresh code when no credential survived.
2. A failed pre-work check pauses tasks, messages, CRM writes and scheduled work
   after the connection allowance expires; diagnosis, inspection, updating and re-pairing remain available.
3. A report failure after allowed work keeps its labels and original event time in
   a durable local outbox. Verified recovery replays the original identities without
   duplicate counts before new work after the connection allowance expires.
4. A support nudge is delivered in plain words after allowance; send a reply only
   with the client's explicit yes. Verification never consumes support messages.

---

### Edge Cases

- Node absent: help install it, then resume saved setup in Codex or Claude Code.
- No code: obtain or renew it from signed-in `/home/pair`, without support or payment.
- Previously declined/unpaired existing folder: pair before any normal work;
  preserve historical decline until explicit pairing.
- Already paired enabled legacy folder: reuse accepted credentials without a new
  code. Establish connection time through verification and complete delivery.
- At exactly 48 elapsed hours, block new tasks; admitted tasks finish and report.
  Revocation invalidates the allowance; unsafe local state requires recovery.
- Wizard interruption: saved exchange/progress is resumed, never claimed complete
  until accepted verification and the stable setup report's acknowledgment.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single dependency-free start script (`start.mjs`, `node:` built-ins only)
  MUST detect: operating system, Node/git presence, and installed AI surfaces (Claude
  Desktop/Code, ChatGPT app, Copilot), and record a machine profile into
  `status/status.json` without asking the client anything the machine can answer.
- **FR-002**: At every credential moment the wizard MUST stop and have the client type
  the value themselves (into the destination tool or a masked prompt), verify it works,
  and continue. Credentials MUST never be requested in plain chat, echoed back, or stored
  anywhere except the tool that needs them.
- **FR-003**: The wizard MUST produce handoff only after accepted matching server verification and setup report acknowledgment. It MUST resume saved answers without repetition.
- **FR-004**: README MUST lead with executable install and Press Start, route unsupported surfaces to Codex or Claude Code, and link built-in skills and pairing/recovery guidance.
- **FR-005**: Built-in skills live at `skills/<slug>/SKILL.md` and ship through the
  deployment manifest. Optional skills come from the Daily Practice library over the radio.
- **FR-006**: The three day-one skills (Prospecting, Call-Planner Control Tower,
  Friday Report) MUST be extracted from the live Workweek harness — behavior distilled,
  placeholders per Article VI — and MUST pass the scrub check (zero Workweek identifiers)
  before entering the repo.
- **FR-007**: Operational package reports MUST persist allowlisted labels with original installation identity before network delivery; failed reports survive restart and replay idempotently.
- **FR-008**: The wizard MUST use the approved short explanation from 007, obtain a self-service single-use code, save the exchanged credential privately and verify matching server acceptance before setup completes. Pairing is account linkage, not payment.
- **FR-009**: Every task and scheduled run MUST attempt verification and pending-report delivery with the shared guard. Temporary failures permit silent work within the shared 48-hour allowance; credential refusal or expiry blocks new work. Support messages are checked separately; replies require explicit per-item consent.
- **FR-010**: Direct conversational installs in executable supported folders MUST run the same wizard/guard. Website-only and paste-only chat can provide recovery guidance but cannot finish installation or authorize work.
- **FR-011**: Sending follows the chosen risk level and CRM standing scope. Operational labels follow required pairing; words and artifacts to Daily Practice retain per-item consent.
### Key Entities

- **Machine profile** — what the wizard learned about this computer (OS, tools found,
  chosen AI surface); lives inside `status/status.json`.
- **Pairing code** — a signed-in account issues or renews a single-use 15-minute
  code; exchange derives folder identity and private credential. No hand-carried token.
- **Package** — one Library unit: `PACKAGE.md` (name/kind/version/requires) + install
  prompt + smoke test + changelog line.
- **Nudge** — one message from Daily Practice to this harness, or the reply back.
- **Signal** — one "I did real work" report (already defined in
  `contracts/status-signal.schema.json`; receiving side delivered by the sister mono
  feature).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a supported installed folder, only accepted verification and the
  setup report acknowledgment permit handoff. A one-time code is the only pairing
  value the human enters; install tokens never appear in output or logs.
- **SC-002**: A first-time reader locates "what do I press first" and "where do I add
  capabilities" within one screen of the README (observed in the dry run, not assumed).
- **SC-003**: All three day-one skills pass their smoke tests on live non-Workweek data
  before Kira's install session — nothing is demoed for the first time in front of a
  client.
- **SC-004**: Scrub check on every extracted package: a defined grep list of Workweek
  identifiers returns zero hits in the public repo.
- **SC-005**: With the radio on: first signal lands during the install session; a nudge
  posted before a session is presented at that session's start; the reply arrives back.
  With the radio disabled: no new work when the shared guard blocks; recovery remains available.
- **SC-006**: The standing acceptance gate holds: a real non-technical person reaches
  `validated` unassisted (`NON-TECHNICAL-DRY-RUN.md`, feature 001 T033).

## Assumptions

- The Daily Practice doors this feature calls (`/api/bridge/signals`, `/api/bridge/nudges`,
  `/api/bridge/assets`) are delivered by `dailypractice-mono` feature
  `002-intelligence-bridge` — built first; this repo's radio work lands behind it.
- Self-service `/home/pair`, `/pairing-code`, `/pair` and read-only `/verify` are
  implemented in the mono on `feature/required-pairing`; deployment, database runner
  and real-account verification are still pending, not inferred from route tests.
- The repo becomes public on GitHub (public + MIT, standing recommendation) before Kira's
  install; screenshots per `SHOTLIST.md` follow the push.
- The Workweek harness on the founder's machine is the extraction source of record; its
  catalogue (agent names, definition paths, wiring) is a build input produced separately.
- Kira's install prep runs off the 23 Jul quiz submission in Supabase unless a quiz under
  her own email supersedes it.
