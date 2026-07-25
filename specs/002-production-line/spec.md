# Feature Specification: The Production Line

**Feature Branch**: `002-production-line`

**Created**: 2026-07-25

**Status**: Draft

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
the wizard hands over a pre-written prompt that drops the client into a working session
with their own AI — which takes the install from there.

**Why this priority**: this is the single biggest remover of cognitive effort. Every
minute a non-technical client spends guessing is a minute closer to abandoning.

**Independent Test**: on a machine with an AI assistant installed, a tester runs the
start command and reaches the handoff prompt without typing any other command, and
without the wizard ever seeing a password.

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
4. **Given** a client on a plain website chat (no file access, can't run anything),
   **When** they can't use the wizard, **Then** the existing conversational path still
   carries them through — the wizard is a fast lane, never a toll gate.
5. **Given** the start command fails because the machine can't run it (e.g. Node is not
   installed), **When** the client returns to the README, **Then** an "if that didn't
   work" line routes them to a no-wizard path with the same outcome.

---

### User Story 2 - The README as a control panel (Priority: P1)

The README stops being a linear document and becomes the client's control panel. At the
top: **Press Start** (one command, plus a plain fallback). Below it: **the Library** —
rows of buttons: *Agents · Skills · Workflows · Programs*. Each button opens a package
page whose first block is the exact text to paste into your AI — the AI then installs
that thing for you. (Honest mechanics: on GitHub a "button" is a link. We say so.)

**Why this priority**: the README is the product's face. "Which file do I open?" should
never be a question a client has to ask.

**Independent Test**: a first-time reader can answer, within one screen of the README:
what is this, what do I press first, and where do I get more capabilities later.

**Acceptance Scenarios**:

1. **Given** a fresh reader, **When** they open the README, **Then** Press Start is the
   first actionable element, and every Library button leads to a page whose first block
   is a copy-paste install prompt.
2. **Given** any Library page, **When** the client follows it, **Then** it ends with
   "you'll know it worked when…" and the smoke test to prove it.
3. **Given** the repo is public on GitHub, **When** screenshots exist per `SHOTLIST.md`,
   **Then** the README's four image placeholders are filled.

---

### User Story 3 - Day-one agents, extracted from the battle-tested harness (Priority: P2)

The client's Library offers three ready agents on day one: **Prospecting** (fill the top
of your pipeline), **Call-Planner Control Tower** (who to call today, in what order, with
context and the likely objection), and **Friday Report** (the week's scoreboard, drafted
for your approval). None of these are invented — each is extracted from the live Workweek
harness that already runs on the founder's machine, distilled, scrubbed of every trace of
Workweek's data, and templatised so it can be trained onto any client's stack.

**Why this priority**: the operating standard is *nothing ships that hasn't been battle-
tested*. These three are the "gym protocol" answer to install overwhelm.

**Independent Test**: each package installs from its Library page onto a machine that is
not Workweek's, and passes its smoke test against that machine's live data.

**Acceptance Scenarios**:

1. **Given** the Prospecting package installed with a client's own ICP, **When** the
   smoke test runs, **Then** it returns ~20 matching prospects with a one-line
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

If the client says yes during the wizard (the box is pre-ticked, plainly worded, one
click to decline), their harness checks in with Daily Practice: "I'm alive, I just did
real work, here's what I have installed." And the radio works both ways — at the start of
each session, the client's agent checks the mailbox. Example: Daily Practice posts
*"Your follow-up agent hasn't run in 6 days — want us to look?"*; the agent reads it out;
the client answers; the reply lands back with Daily Practice.

**Why this priority**: this is how installs stop being launch-and-hope. Signals are also
literally how a running harness gets counted toward the North Star.

**Independent Test**: with a welcome pack (key + address) configured, a signal sent from
the client machine lands with Daily Practice; a nudge posted by Daily Practice is read
out at the next session start; the reply arrives back.

**Acceptance Scenarios**:

1. **Given** the wizard's check-in step, **When** the client accepts the default,
   **Then** the pack's address and key are written into the bookmark file's sharing
   settings and the first signal is sent during the install session itself.
2. **Given** the client declines, **When** the install continues, **Then** everything
   else works identically and nothing outbound is ever sent (current behavior preserved).
3. **Given** a nudge waiting, **When** the client starts any session, **Then** the agent
   presents it in plain words and offers to send a reply; no reply is sent without the
   client's yes.
4. **Given** a package installs, **When** the radio is on, **Then** the install is
   reported ("Prospecting v1.x on this machine") so Daily Practice's shelf stays accurate.

---

### Edge Cases

- Node absent → Press Start fails gracefully; README's "if that didn't work" routes to
  the conversational path (US1 scenario 5). The wizard must never be the only door.
- No welcome pack (bought but pack not yet issued) → radio stays silently off; install
  proceeds; wizard says what's missing and who to ask.
- Two AI tools on one machine (e.g. ChatGPT app + Claude) → wizard asks ONE question:
  "which do you want to run your harness?" — the only fork a human must pick.
- Windows vs Mac → detection copy stays plain ("This is a Windows machine"); paths and
  key names adjust silently.
- Wizard re-run after partial install → reads the bookmark, says "welcome back — you're
  at step N", never restarts from zero (Article II).
- Client on paste-only chat never sees the wizard's check-in choice → the conversational
  path presents the same choice in the same plain words.

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
- **FR-003**: The wizard MUST end by producing the handoff prompt that starts the
  client's AI on the `AGENTS.md` install sequence, and MUST be re-runnable — resume from
  the bookmark, never restart from zero.
- **FR-004**: The README MUST lead with Press Start (one command + ZIP/no-wizard
  fallback) and present the Library as linked "buttons" grouped Agents · Skills ·
  Workflows · Programs, each landing on a package page whose first block is the install
  prompt.
- **FR-005**: Every Library entry MUST follow one packaging shape:
  `library/<kind>/<slug>/PACKAGE.md` with name, kind, version, requires; an install
  prompt; a smoke test (a "prove it works" task on the client's own data); a changelog
  line.
- **FR-006**: The three day-one agent packages (Prospecting, Call-Planner Control Tower,
  Friday Report) MUST be extracted from the live Workweek harness — behavior distilled,
  placeholders per Article VI — and MUST pass the scrub check (zero Workweek identifiers)
  before entering the repo.
- **FR-007**: Package installs MUST report to Daily Practice's shelf endpoint when (and
  only when) the radio is on.
- **FR-008**: The wizard MUST present the check-in choice pre-ticked with the plain-words
  explanation and one-click decline; declining MUST leave every other function intact.
  Accepting MUST write endpoint + key from the welcome pack into `status.json` sharing
  settings and send the first signal during the install session.
- **FR-009**: At session start, the agent MUST check the nudge mailbox when the radio is
  on, present any nudge in plain words, and send a reply only on the client's yes.
- **FR-010**: The existing conversational (no-wizard) path MUST reach every outcome the
  wizard reaches, including the check-in choice — feature parity, slower lane.
- **FR-011**: Nothing external ever sends without the client's explicit yes — restated:
  constitution Articles III/V bind every new package and the radio.

### Key Entities

- **Machine profile** — what the wizard learned about this computer (OS, tools found,
  chosen AI surface); lives inside `status/status.json`.
- **Welcome pack** — what the client receives at sale: client id, harness id, the key
  (install token), the radio address (endpoint URL). Issued by Daily Practice; consumed
  by the wizard's check-in step.
- **Package** — one Library unit: `PACKAGE.md` (name/kind/version/requires) + install
  prompt + smoke test + changelog line.
- **Nudge** — one message from Daily Practice to this harness, or the reply back.
- **Signal** — one "I did real work" report (already defined in
  `contracts/status-signal.schema.json`; receiving side delivered by the sister mono
  feature).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a machine with an AI assistant installed, Press Start → handoff prompt
  in under 10 minutes, zero commands typed beyond the start command, zero credentials
  seen by the wizard.
- **SC-002**: A first-time reader locates "what do I press first" and "where do I add
  capabilities" within one screen of the README (observed in the dry run, not assumed).
- **SC-003**: All three day-one packages pass their smoke tests on live non-Workweek data
  before Kira's install session — nothing is demoed for the first time in front of a
  client.
- **SC-004**: Scrub check on every extracted package: a defined grep list of Workweek
  identifiers returns zero hits in the public repo.
- **SC-005**: With the radio on: first signal lands during the install session; a nudge
  posted before a session is presented at that session's start; the reply arrives back.
  With the radio off: zero outbound calls.
- **SC-006**: The standing acceptance gate holds: a real non-technical person reaches
  `validated` unassisted (`NON-TECHNICAL-DRY-RUN.md`, feature 001 T033).

## Assumptions

- The Daily Practice doors this feature calls (`/api/bridge/signals`, `/api/bridge/nudges`,
  `/api/bridge/assets`) are delivered by `dailypractice-mono` feature
  `002-intelligence-bridge` — built first; this repo's radio work lands behind it.
- Welcome packs (key + address) are minted manually by Daily Practice at sale for now; no
  self-service registration endpoint exists or is wanted yet.
- The repo becomes public on GitHub (public + MIT, standing recommendation) before Kira's
  install; screenshots per `SHOTLIST.md` follow the push.
- The Workweek harness on the founder's machine is the extraction source of record; its
  catalogue (agent names, definition paths, wiring) is a build input produced separately.
- Kira's install prep runs off the 23 Jul quiz submission in Supabase unless a quiz under
  her own email supersedes it.
