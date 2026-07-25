# Orion Self-Install Constitution

**Version**: 1.1.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-25

**Sync Impact Report** (amendment 1.1.0, 2026-07-25):
- Version change: 1.0.0 → 1.1.0 (MINOR — Article V channel 1 materially expanded).
- Article V channel 1 redefined as **the radio**: same single toggle, still on by
  default with a plain-words, one-click decline, but its contents are now enumerated in
  full — (a) install-stage signals, (b) work heartbeats (signal type + timestamp only),
  (c) package-install reports (package name, kind, version), and (d) a two-way mailbox
  whose replies send only on the client's explicit yes. The never-list (no message
  content, no KB content, no prospect data) is unchanged. Channel 2 untouched.
- Rationale and alternatives: `specs/002-production-line/research.md` (R4); requirement
  source: `specs/002-production-line/spec.md` FR-007..FR-009. Old channel-1 emitters
  remain conformant (the new definition is a superset).
- Proposed in writing per the Amendment Process below; approval is Daily Practice (the
  founder) merging branch `002-production-line`.

**Sync Impact Report** (1.0.0 ratification):
- Version change: none → 1.0.0 (initial ratification for this repository)
- Derivation: translated from `dailypractice-mono`'s constitution v2.0.0, written for Daily
  Practice's own multi-tenant coaching platform. Every article below is one of: reused
  near-verbatim (III, IX), reframed for a single-user no-coach context (IV, V, VI, VII,
  VIII), or newly written because this repository is different in kind, not just scope
  (I, II, X — X replaces the parent's package-count rule with a scope-discipline rule).
- Templates requiring updates: `.specify/templates/plan-template.md`'s Constitution Check
  section should be re-derived from the Phase -1 Gates below before first use — ⚠ pending.

---

**Preamble**

This repository installs Orion — a personal, agentic sales harness — directly onto a
client's own machine and accounts, guided by whatever AI assistant they already use, with
**no Daily Practice coach present**. This constitution governs everything in this
repository to protect the things that matter when no human from Daily Practice is in the
room to catch a mistake live: that a non-technical person is never left stranded; that an
interrupted install is never a lost install; that nothing embarrasses the client in their
own market; that the client always knows what leaves their machine and why; and that this
repository stays exactly as large as its stated job, no larger.

---

**Article I — Non-Technical-First**

Every instruction in this repository assumes the reader has never opened a terminal,
generated an API key, used git, or configured a webhook. Any technical necessity is
explained in one plain sentence — what it's for, why it's needed — before the technical
step itself. Wherever a non-technical-friendly path exists alongside a faster technical
one (ZIP download vs. `git clone`; a manual CRM setup vs. a script), both are offered, and
the manual path is never presented as a lesser fallback — it is a first-class route.

**Gate**: no file in this repository may introduce a required step (an install, a command,
a concept) without a preceding plain-language sentence explaining why a non-technical
reader needs it. A step with no non-technical-friendly alternative requires a documented
reason in the same file.

---

**Article II — Resumable by Default**

No install may assume it happens in one sitting. Every stage must be safely interruptible
and resumable — across sessions, across days, across machines, and across a client
switching from one AI assistant to another mid-install — without data loss or repeated
work. The record of progress lives in a file inside the client's own copy of this
repository, never in a single chat session's transient memory, and never in a system only
Daily Practice can see.

**Gate**: any feature that captures client information or advances install state MUST
read and write `status/status.json` (or its documented successor) as the record of truth.
A step whose completion cannot be determined by reading that file back is not resumable,
and does not ship.

---

**Article III — Reputation Safety**

Orion MUST never help craft or send communications that a reasonable person would
consider reputationally damaging when received by a buyer or prospect. This is NOT a
prohibition on emotional engagement — triggering genuine emotion in buyers is central to
how Daily Practice teaches selling, and Orion is designed to help a client do exactly that
effectively.

The constitutional line is **irreparable reputational damage**: content that would cause
public or private backlash, shame or degrade the buyer, cross into harassment, or
permanently damage the client's standing in their market. Orion MUST refuse to generate
content that crosses this line regardless of instruction, and must say so plainly, in one
sentence, without lecturing.

This article is, if anything, more load-bearing here than in a coached install: with no
coach present to visually catch a bad draft before it goes out, the agent's own refusal is
the only safety net, not a backstop to a human's judgement.

**Gate**: no task capable of producing outreach or buyer-facing content ships without a
documented refusal behaviour and at least one test case exercising the boundary condition
(see `validation/validation-tasks.md` VT-05).

---

**Article IV — Client-Owned, Transparent Data**

The client owns their data. Their CRM, their email, their calendar, and their knowledge
base live in their own accounts and their own copy of this repository — never in a
Daily-Practice-hosted database. There is no multi-tenant platform for this repository to
leak data across, because there is no shared platform at all: the entire cross-boundary
surface between a client and Daily Practice is the two channels named in Article V, and
nothing else.

**Gate**: no feature in this repository may introduce a data flow to Daily Practice that
is not one of the two channels named in Article V, disclosed in the same terms.

---

**Article V — Explicit, Opt-In Data Sharing**

Two channels, and only two, carry information from a client's install back to Daily
Practice. Both are disclosed in plain language inside this repository — never bundled into
a EULA, never implied.

1. **Lifecycle status signal — the radio** — the operational check-in channel between a
   client's install and Daily Practice, so Daily Practice knows a self-serve client
   exists, can offer help if asked, and can count a running system as running. Everything
   it carries is enumerated here, and nothing else rides on it: (a) install-stage signals
   (client identity, current install stage, a timestamp); (b) work heartbeats — "a task
   of this type completed at this time," type and timestamp only; (c) package-install
   reports — the name, kind, and version of a Library package installed on this machine;
   and (d) a two-way mailbox: short plain-language messages from Daily Practice that the
   client's agent reads out, with a reply sent only on the client's explicit yes in that
   session. Never message content, KB content, or prospect data — in any of the four.
   **On by default**, presented plainly at install with a one-click decline, fully
   visible in this repository, and switchable off in `status/status.json` at any time;
   declining or switching off disables all four parts at once and changes nothing else.
2. **Intelligence Library signal** — richer usage/outcome data (signal types, counts,
   timestamps — never message content, KB contents, or prospect data), used to improve
   future versions of this repository. **Off by default.** Turning it on is a separate,
   explicit, named action, revocable at any time, disclosed in full in
   `docs/intelligence-library-opt-in.md`.

**Gate**: no data leaves the client's machine that is not named, in writing, in this
repository, with its own toggle defaulting to the more conservative state for anything
beyond the bare operational status signal in item 1.

---

**Article VI — Template Integrity & Placeholder Discipline**

This repository ships as one generic template, identical for every client. A placeholder
left unfilled must never be presented to a client as if it were real content — every file
containing a `{{PLACEHOLDER}}` either gets filled during the install conversation before
the client sees it rendered, or is clearly marked as maintainer-only setup (e.g.
`{{DAILY_PRACTICE_SUPPORT_CONTACT}}` in `README.md`, filled once before distribution, not
per-client).

**Gate**: any new file introducing a placeholder states, in a comment or adjacent note,
whether it is filled by the installing agent during conversation or by Daily Practice
before the template is distributed. A placeholder with neither is a defect.

---

**Article VII — Spec-Before-Build**

Every new capability in this repository — a script, a data file's shape, a status field —
is specified before it is built: its shape, in `specs/001-self-install/data-model.md` or a
`contracts/` file, precedes the code or content that produces or consumes it. This is
lighter-weight than a reviewed API contract on a multi-engineer platform — there is no
compiler and no per-instance human reviewer here — but the discipline of designing the
shape first, so producer and consumer agree, still holds.

**Gate**: `specs/001-self-install/contracts/` contains the schema for any new data file
before an implementation that writes or reads it exists.

---

**Article VIII — Live-Verification Imperative**

No install step is complete because a script ran without error. It is complete because a
live check against the client's real, connected account confirms it — the same discipline
`connectors/connector-checklist.md` and `validation/validation-tasks.md` already apply:
credentials are tested live, not assumed; validation tasks run against the client's real
CRM, email, and prospects, never against sandbox or fabricated data. This is not literal
software unit testing — most of this repository is markdown and two dependency-free
scripts — but the same spirit: trust what you can observe working, not what merely didn't
crash.

**Gate**: any connector or workflow step that can silently fail MUST have a documented live
test, and no status field may read as complete off the back of an untested assumption.

---

**Article IX — Model-Adapter Portability**

Orion runs on whichever AI assistant the client already uses. The thin per-model adapter
layer (`agent/adapters/{claude,chatgpt,copilot,claude-code}.md`) is the mechanism, and it
is a constitutional requirement, not a speculative abstraction — it is the central premise
this entire repository is built on. New adapters follow the same shape: mechanics only,
never behaviour; behaviour lives once, in `agent/agent-definition.md`.

**Gate**: a behavioural change belongs in `agent/agent-definition.md`. If it only appears
in one adapter file, that is a defect, not a feature.

---

**Article X — Foundation Scope Discipline**

This repository's job is the technical, no-coach, single-user install of Orion — nothing
more. Anything beyond that job (a content-template layer for outbound social posts, a
support/community system, a live write-path into Daily Practice's own internal Trello)
requires its own spec before it is added here. Adding scope without a spec is a
constitutional violation, not a judgement call.

**Gate**: a pull request adding a directory or capability outside the install journey
(agent setup, CRM/connector wiring, validation, status/resumability) MUST cite the spec
that scopes it, or MUST NOT merge.

---

**Amendment Process**

Amendments are proposed in writing: the principle being changed, the rationale, the
expected impact on any self-serve install already underway, and a migration note where one
is needed. Amendments to this repository's constitution are approved by Daily Practice
(the maintainer), not by any individual client — clients install from a version of this
repository; they do not renegotiate its principles.

**Versioning policy**: MAJOR for redefinition or removal of an article; MINOR for a new
article or materially expanded gate; PATCH for wording clarification.

---

**Phase -1 Gates**

Every implementation plan for this repository MUST clear all ten gates above before a
single new file ships:

- [ ] Article I — Non-Technical-First: every new required step has a preceding plain-
  language sentence, or a documented reason it can't.
- [ ] Article II — Resumable by Default: state changes are readable back from
  `status/status.json`.
- [ ] Article III — Reputation Safety: outreach-capable tasks have a documented refusal
  behaviour and boundary test.
- [ ] Article IV — Client-Owned, Transparent Data: no data flow to Daily Practice beyond
  the two named in Article V.
- [ ] Article V — Explicit, Opt-In Data Sharing: both channels remain separately disclosed
  and separately toggled.
- [ ] Article VI — Template Integrity: every placeholder's fill-owner (agent vs.
  maintainer) is documented.
- [ ] Article VII — Spec-Before-Build: a schema exists before its implementation.
- [ ] Article VIII — Live-Verification Imperative: a live test exists for anything that can
  silently fail.
- [ ] Article IX — Model-Adapter Portability: behaviour lives in `agent-definition.md`,
  not in an adapter.
- [ ] Article X — Foundation Scope Discipline: anything outside the install journey cites
  its own spec.
