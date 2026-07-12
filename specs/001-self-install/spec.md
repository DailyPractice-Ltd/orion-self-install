# Feature Specification: Orion Self-Install

**Feature Branch**: `001-self-install`

**Created**: 2026-07-12

**Status**: Draft

**Input**: A non-technical entrepreneur, salesperson, or go-to-market person clones or
downloads this repository and, guided entirely by whatever AI assistant they already use —
with no Daily Practice coach present — reaches a running, validated Orion install on their
own machine and accounts.

---

## User Scenarios & Testing *(mandatory)*

<!--
  Stories are ordered by priority. Each story is independently testable — completing
  just one delivers a demonstrable slice of value.
-->

### User Story 1 — Meet Your Agent (Priority: P1)

A client opens this repository with their own AI assistant (Claude, ChatGPT, Copilot, or a
code-capable tool) and, through direct conversation with no coach relaying questions, has
their business context, ICP and vocabulary, offer, sales motion, tone, objection library,
and monthly commitments captured in their own words — and their personal Orion agent is
assembled and named.

**Why this priority**: Nothing else in this repository has a subject to act on without
this. It is also the story that proves the core mechanic — an AI agent running the capture
conversation directly — actually works with no human intermediary.

**Independent Test**: A person with no prior exposure to Orion can open this repository
with a supported AI assistant and, through conversation alone, produce a complete
knowledge base and an agent identity that reads back to them, in their own words, as
recognisably theirs.

**Acceptance Scenarios**:

1. **Given** a fresh clone of this repository, **When** the client opens it with a
   supported AI assistant and says they're ready to start, **Then** the assistant reads
   `AGENTS.md` and `status/status.json`, recognises this as a new install, and begins the
   knowledge-base conversation — never dumping every question at once.
2. **Given** an in-progress knowledge-base capture, **When** the client answers in their
   own vocabulary (not generic sales language), **Then** that vocabulary is what gets
   written into `agent/knowledge-base/02-icp-and-vocabulary.md`, not a paraphrase.
3. **Given** a completed knowledge-base capture, **When** the client asks their new agent
   to draft something, **Then** the draft sounds like their business, not like a generic
   sales tool — the same "read it aloud, does it sound like you" bar the coach-led kit
   uses.

---

### User Story 2 — Wire Your CRM (Priority: P2)

The client's CRM situation (HubSpot, Attio, another CRM, or none yet) is captured, and
their CRM is brought to the pipeline shape Orion expects — including, for a client who has
never generated an API key before, a walkthrough of exactly what to click.

**Why this priority**: The agent from US1 needs somewhere to read and write pipeline state.
This is also where "non-technical" is tested hardest — API keys and admin settings are the
furthest thing from a sales conversation.

**Independent Test**: A client with zero prior CRM-admin experience can reach a working
pipeline (scripted or manually configured) without contacting anyone outside this
repository for help, and can articulate why each field/stage exists.

**Acceptance Scenarios**:

1. **Given** a client with an existing Attio or HubSpot account, **When** they confirm
   which CRM they use, **Then** they're routed to the matching template in `crm/` and
   walked through generating an API key from nothing, one click at a time.
2. **Given** a client with a different CRM or no CRM at all, **When** their situation is
   captured, **Then** they're routed to `crm/other-crm-manual-setup.md` and CRM setup does
   not block progress on the knowledge base or agent assembly from US1.
3. **Given** a CRM template applied, **When** the client (or their code-capable agent)
   checks the result, **Then** the pipeline stages and assessment-profile fields match the
   template exactly — no partial application silently accepted as done.

---

### User Story 3 — Connect and Validate Live (Priority: P3)

Gmail and Calendar authenticate with the same live-test, no-silent-advance discipline as
CRM, the n8n starter workflows are imported, and a validation pass proves the whole system
works against the client's own real accounts — not sandbox data — before it's called done.

**Why this priority**: An agent with a knowledge base and a CRM template still isn't a
running harness until it can actually read and write the client's real tools, and until
that's been proven, not assumed.

**Independent Test**: A client can authenticate all three connectors, import both starter
workflows, and run the validation tasks against their own real prospects/calls, ending in
either a fully validated system or a clearly identified, specific failure — never an
ambiguous "probably fine."

**Acceptance Scenarios**:

1. **Given** a connector authentication attempt, **When** any live test fails (expired
   token, wrong scope, revoked access), **Then** the install status does not advance past
   `connected`, and the client is told exactly which connector failed and how to retry —
   mirroring the coach-led kit's credential-failure gate.
2. **Given** all three connectors passing their live tests, **When** the n8n workflows are
   imported, **Then** a first run of each produces a staged draft (never a sent message or
   a live CRM write) for the client's own review.
3. **Given** a full validation pass, **When** every VT task in `validation/validation-tasks.md`
   passes against the client's real data, **Then** the install status reaches `validated`.

---

### User Story 4 — Stop and Come Back (Priority: P2)

A client who closes their laptop mid-install — at any stage, for any length of time,
possibly opening a different AI assistant next time — resumes exactly where they left off,
with nothing re-asked and nothing lost.

**Why this priority**: This is the single structural difference between this repository
and the coach-led kit it's adapted from, which explicitly assumes one sitting. Getting
this wrong doesn't just degrade the experience — it means a client abandons partway and
never returns, which is a total loss for a self-serve motion with no coach to chase them.

**Independent Test**: An install can be interrupted after any completed unit of work (one
knowledge-base section, one connector, one validation task) and resumed — in a new
session, on a different day, with a different AI assistant — with the resuming assistant
correctly identifying every already-completed step from `status/status.json` alone.

**Acceptance Scenarios**:

1. **Given** an install paused after knowledge-base capture but before CRM setup, **When**
   the client returns in a new session, **Then** the assistant greets them by name/business
   from `status/status.json` and proceeds straight to CRM setup — no re-asking about their
   ICP, tone, or offer.
2. **Given** an install started on one AI assistant, **When** the client continues on a
   different supported assistant, **Then** the new assistant reads the same
   `status/status.json` and the same knowledge-base files, and continues seamlessly.
3. **Given** an install that has been abandoned for weeks, **When** the client returns,
   **Then** resumption works identically to a one-day gap — there is no time-based decay
   or expiry on local state (unlike the pre-auth quiz state in the coach-led product, which
   expires after 7 days — that constraint does not apply here since there is no shared
   database row to expire).

---

### User Story 5 — Let Daily Practice Know You're Progressing (Priority: P4)

As the client advances through the install, a local record of their stage exists, and —
only if they've left the default-on, fully-disclosed status signal enabled — that stage is
communicated outward, without the client ever holding a credential that could write to
Daily Practice's own systems.

**Why this priority**: Lowest priority because nothing in US1–US4 depends on it, and it is
the one story whose consumer (a Daily-Practice-side board update) is explicitly out of
scope for this repository's own build — this story only covers what the client's own copy
of the repository does, not what happens after.

**Independent Test**: With the status signal left at its default (on), completing a stage
produces a well-formed outbound payload matching the schema; with it switched off, no
outbound call is made at all, verified by absence of any network attempt.

**Acceptance Scenarios**:

1. **Given** the default configuration, **When** the client's install status changes,
   **Then** a payload conforming to `contracts/status-signal.schema.json` is emitted via
   the client's own n8n workflow (or `status/emit-status.mjs` for a code-capable agent).
2. **Given** the status signal switched off in `status/status.json`, **When** the install
   status changes, **Then** no outbound network call is attempted — only the local file is
   updated.
3. **Given** the separate Intelligence Library opt-in (default off), **When** it has not
   been explicitly enabled, **Then** no usage/outcome data beyond the bare lifecycle signal
   is ever transmitted.

---

### Edge Cases

- **Client has no CRM at all.** Routed to the CRM-deferred path (`crm/other-crm-manual-setup.md`);
  knowledge-base and agent-assembly work is never blocked on CRM being resolved first.
- **Client's AI assistant isn't in the supported set** (not Claude, ChatGPT, Copilot, or a
  code-capable tool with an equivalent adapter). The repository must fail safe: `AGENTS.md`
  and `README.md` state the supported set up front, so this is discovered before time is
  invested, not mid-install.
- **Client's AI surface has no code-execution or file-write capability** (a plain web chat,
  not Claude Code/Copilot agent mode/Cursor). Every scripted step (`crm/*/apply-*.mjs`,
  `status/emit-status.mjs`) has a documented manual-equivalent path; the manual path is
  never a second-class citizen (Article I).
- **Client has no Node.js installed.** The manual path is the default baseline for
  everyone regardless of Node availability; the scripted path is an accelerator only when
  a code-capable agent and Node are already present.
- **Client has no git or GitHub account.** The ZIP-download path in `README.md` requires
  neither.
- **Client loses their local working copy entirely** (not just pauses — the folder is
  gone). This is an honest, disclosed limitation: because there is deliberately no
  Daily-Practice-hosted state (Article IV), losing the local folder means restarting from
  scratch. Not silently broken — stated plainly in `README.md` and `AGENTS.md`.
- **Client switches AI assistant mid-install.** Not a special case requiring extra work:
  knowledge-base files are plain markdown and `status/status.json` is plain JSON, readable
  by any adapter — this is inherently supported by the existing design (US4).
- **More than one person acts as "the client"** (e.g. a founder plus an assistant).
  Explicitly out of scope for this version — single-operator is the v1 assumption, named
  here so it isn't silently mishandled; a documented limitation, not a bug.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository's only hard prerequisite is an AI assistant the client
  already uses; `README.md` and `AGENTS.md` state this before anything else.
- **FR-002**: `AGENTS.md` MUST brief any AI agent reading it — regardless of underlying
  product — on Orion's identity, the agent's present job as installer, and where to check
  current progress, without a human coach mediating.
- **FR-003**: Before asking the client anything, the installing agent MUST read
  `status/status.json` so a resumed session never re-asks a completed step.
- **FR-004**: CRM choice (Attio / HubSpot / another CRM / none) MUST route to one of three
  documented paths, and CRM setup MUST NOT block progress on knowledge-base capture or
  agent assembly.
- **FR-005**: Connector authentication (CRM / Gmail / Calendar) MUST reuse the live-test,
  no-silent-advance-on-failure discipline of `connectors/connector-checklist.md`.
- **FR-006**: For any technical action requiring credentials the client has likely never
  created before, the repository MUST document the exact clicks, assuming zero prior
  exposure.
- **FR-007**: Knowledge-base capture MUST be a direct, conversational interview run by the
  installing agent itself, in the client's own vocabulary, with no relay through a third
  party.
- **FR-008**: Every install stage MUST be interruptible and resumable across sessions,
  days, machines, and AI assistants without data loss or repeated work.
- **FR-009**: Nothing sends or writes externally without explicit, in-session client
  approval — no exceptions, and no session in which an action executes without that
  session's own approval.
- **FR-010**: The installed Orion agent MUST refuse to generate content a reasonable
  person would consider reputationally harmful to the client if received by a prospect,
  and MUST explain what it won't do, briefly, without lecturing.
- **FR-011**: A validation pass equivalent to `validation/validation-tasks.md`'s VT tasks
  MUST run against the client's own live CRM, Gmail, Calendar, and prospects before the
  install is considered `validated`.
- **FR-012**: On reaching each stage, the repository MUST be able to produce a local status
  record, and MAY emit a minimal subset of it outward only if the status-sharing flag
  (default on, fully disclosed) is set.
- **FR-013**: Intelligence-Library-style signal contribution MUST be a distinct, explicit,
  **default-off** opt-in, disclosed separately from FR-012's status signal.
- **FR-014**: The repository MUST support Claude, ChatGPT, Copilot, and code-capable AI
  surfaces via adapter files, and MUST fail safe — telling the client clearly, before they
  invest time — if their tool isn't in the supported set.
- **FR-015**: The repository MUST ship a client-owned Notion project-tracker template,
  seeded with the install checklist and the client's commitments scoreboard.
- **FR-016**: This repository's own `CHANGELOG.md` MUST record which template version a
  given client used, independent of `packages/harness/templates/install-kit/CHANGELOG.md`'s
  versioning in `dailypractice-mono`.

### Key Entities

- **Client** — the person self-installing Orion; single-operator in this version.
- **InstallStatus** — the `status/status.json` record: identity, current `harness_status`
  and `ops_stage`, a per-step checklist, stage history, and sharing toggles. The
  resumability record and the source for any emitted signal.
- **KnowledgeBaseSection** — one of the 7 numbered capture files defining the client's
  business, ICP, offer, motion, tone, objections, and commitments.
- **CRMChoice / CRMTemplate** — the client's CRM decision and, where applicable, the
  Attio/HubSpot template applied to bring their pipeline to the expected shape.
- **ConnectorCredential** — CRM/Gmail/Calendar authentication, held only in the client's
  own n8n instance, never in this repository or transmitted to Daily Practice.
- **ValidationTask** — one of the VT-00..VT-08 live checks gating `connected → validated`.
- **StatusSignal** — the minimal, always-disclosed payload optionally emitted on stage
  change (FR-012).
- **IntelligenceOptIn** — the separate, default-off, explicit opt-in for richer usage
  signal contribution (FR-013).
- **NotionTracker** — the client's own project-management page, seeded from
  `notion/project-tracker-template.md`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: A client with zero prior git/CRM/agent-configuration experience reaches
  active knowledge-base capture without contacting Daily Practice for help.
- **SC-02**: Zero connectors ever show `connected` while any credential test is red.
- **SC-03**: A client who closes their laptop mid-install and resumes — same day, days
  later, or on a different AI assistant — is correctly recognised at their true progress
  point, with zero already-completed steps re-asked.
- **SC-04**: Zero outreach, CRM-write, or external-communication actions execute without
  explicit in-session client approval.
- **SC-05**: A client reaching `validated` can, unassisted, drive one full staged task
  (prospect research or post-call debrief) end to end.
- **SC-06**: A client whose AI assistant isn't supported is told before, not during, the
  install.
- **SC-07**: With the status signal at its default, a stage change produces one
  schema-conformant payload; with it switched off, zero outbound network attempts occur.

---

## Assumptions

- **Single operator**: one person acting as "the client" per install; multi-operator
  support (e.g. a founder plus an assistant) is out of scope for this version.
- **No Daily-Practice-hosted state**: by design (Article IV) — a lost local folder means
  restarting, and that trade-off is accepted in exchange for never holding client data
  centrally without an explicit, disclosed channel.
- **Supported AI surfaces at launch**: Claude (chat and Claude Code), ChatGPT, Copilot.
  Any other tool a client already uses is the FR-014 fail-safe case, not silently
  unsupported.
- **CRM templates at launch**: Attio and HubSpot, matching the coach-led kit. A third CRM
  or no CRM routes to the manual-shape path, not a dead end.
- **Content-template layer (Instagram/LinkedIn) and the Skool support system are
  explicitly out of scope** for this spec — see `docs/self-serve-learnings.md` for why,
  and the constitution's Article X for the discipline that keeps them out until they have
  their own spec.
- **The Daily-Practice-side Trello consumer for the status signal is out of scope** for
  this repository — this spec covers only what the client's own copy emits.
