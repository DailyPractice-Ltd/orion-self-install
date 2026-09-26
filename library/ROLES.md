# The role bank — who teams hire

Read this silently when the client wants to hire (HIRING.md Q1 sends you here). It is
a menu of the jobs sales teams typically hire an agent for, written to be said out
loud to someone who is not technical and does not want to be. Present it like roles
on a team, never like software.

**Menu rules**
- Offer the roles **not already on the roster**, best fit for their pipeline first
  (knowledge base §4 tells you where their motion is thin). Say up to six; the full
  list is here if they ask.
- Each role is one breath: the title, then "what they do for you".
- Always end the menu with: **"or describe the work in your own words, like you'd
  brief a temp on their first morning."** A described role is `role: custom` — every
  bit as first-class as a bank role.
- A role with a **Head start** line has a shelf package — offer that install before a
  bespoke build (naming rules reserve library slugs for library installs).
- The bank informs the interview; it never replaces it. A picked role pre-fills the
  job draft, Q2's sources and Q4's shift **as defaults to confirm**, tailored to the
  knowledge base — never assumed silently.

Each role carries its own **Status** line — `hypothesis` (seeded from real installs
and industry convention) until real hires report against it over the radio, when a
curator promotes that one line to `evidence_based`. This file grows the same way the Library does: what teams actually hire comes
back (as role slugs and counts, never content) and reshapes the menu.

| Slug | Role | What they do for you |
|---|---|---|
| `sdr` | SDR (lead warmer) | Works the leads already in your CRM: warms them up, keeps every conversation moving, books the meeting |
| `bdr` | BDR (prospector) | Finds new leads outside your CRM, researches and enriches them, brings them into the pipeline |
| `deals` | Deals agent | Keeps deal records right so you never touch CRM admin; drafts your proposals and contracts |
| `pipeline-review` | Pipeline Review agent | Watches movement stage by stage and flags any lead falling through the gaps |
| `reporting` | Reporting agent | The week's honest scoreboard against your commitments, drafted for your approval |
| `content` | Content agent | Drafts posts and outreach content in your voice, staged for your yes |
| `research` | Research agent | Preps you before calls, debriefs after, keeps the CRM current with what was learned |
| `head-of-sales` | Head of Sales (orchestrator) | Plans each day, delegates to the rest of the team, paces your commitments |

---

## `sdr` — SDR (lead warmer)

- **The job**: take the leads already sitting in the CRM and move them — warm-up
  touches in your voice, timely follow-ups, meetings booked with context, each lead
  nudged toward sales-qualified. (Industry convention: an SDR works existing
  interest; finding brand-new leads is the BDR below.)
- **Looks at / touches**: your CRM, email drafts, your calendar.
- **Typical shift**: weekday mornings, before you start selling.
- **Success line to offer**: "meetings appear on my calendar with context, and no
  lead sits untouched longer than {n} days."
- **Head start**: the `prospect-research-outreach` workflow covers the per-prospect
  drafting half; this role adds the warming cadence around it.
- **Status**: hypothesis

## `bdr` — BDR (prospector)

- **The job**: go out and find new leads that match the ICP, research and enrich
  them, and bring them into the pipeline with a one-line "why them". (Industry
  convention: the BDR is the outbound hunter.)
- **Looks at / touches**: the open web, your CRM (adding, never sending).
- **Typical shift**: weekday early morning, so the list is ready when you are.
- **Success line to offer**: "every morning there are fresh, researched candidates
  in the pipeline that actually look like our customer."
- **Head start**: `library/agents/prospecting` (v0.9.0).
- **Status**: hypothesis

## `deals` — Deals agent

- **The job**: the deal-desk work — keep CRM records, stages and next actions
  correct without you touching them; draft proposals and contracts for your yes.
- **Looks at / touches**: your CRM, your proposal/contract templates.
- **Typical shift**: after calls, or a daily afternoon pass.
- **Success line to offer**: "I stop doing CRM admin, and a proposal draft is
  waiting the same day a call warrants one."
- **Head start**: —
- **Status**: hypothesis

## `pipeline-review` — Pipeline Review agent

- **The job**: watch lead and deal movement across stages; flag what has gone
  stale, what skipped a step, what is about to fall through the gaps — with a
  suggested next touch for each.
- **Looks at / touches**: your CRM (read only).
- **Typical shift**: one weekly sweep, or daily for a busy pipeline.
- **Success line to offer**: "nothing dies quietly — anything stalled gets named,
  with a suggested next move."
- **Head start**: —
- **Status**: hypothesis

## `reporting` — Reporting agent

- **The job**: the week's honest scoreboard — activity and movement against your
  §7 commitments, no vanity numbers, drafted for your approval.
- **Looks at / touches**: your CRM, `status/shift-log.md`, knowledge base §7.
- **Typical shift**: Friday, before you close the week.
- **Success line to offer**: "Friday tells me the truth about the week in one page."
- **Head start**: `library/agents/friday-report` (v1.0.0).
- **Status**: hypothesis

## `content` — Content agent

- **The job**: draft posts and outreach content in your voice from your knowledge
  base, staged for your yes — never posted, never sent, on its own.
- **Looks at / touches**: knowledge base §2/§5, a drafts folder in this repo.
- **Typical shift**: two or three mornings a week.
- **Success line to offer**: "there is always a draft that sounds like me waiting
  when I have ten minutes to post."
- **Head start**: —
- **Status**: hypothesis

## `research` — Research agent

- **The job**: before a call, a one-page brief on who you are meeting and the
  likely angle; after it, the debrief captured and the CRM kept current.
- **Looks at / touches**: your calendar, your CRM, call notes you hand it.
- **Typical shift**: wrapped around your calendar — before and after meetings.
- **Success line to offer**: "I never walk into a call cold, and nothing said on a
  call gets lost."
- **Head start**: `library/agents/call-planner` (v1.0.0) for the daily call plan;
  the `post-call-debrief` workflow for the after-call half.
- **Status**: hypothesis

## `head-of-sales` — Head of Sales (orchestrator)

- **The job**: plan each day, delegate to the rest of the team, and pace you
  against your commitments — the Daily Drive, run by a colleague. Best hired once
  at least two other agents exist; a head of one is just overhead.
- **Looks at / touches**: the roster, `status/shift-log.md`, your CRM, knowledge
  base §7.
- **Typical shift**: daily, first thing.
- **Success line to offer**: "I open the day to a plan that already accounts for
  what the team did overnight."
- **Head start**: —
- **Status**: hypothesis

---

**Provenance** (why these eight): Oliver's own hire-agent test menu (SDR, BDR,
prospector, deals, pipe review — 25 Sep 2026); install #3's eight real hires
(prospecting · scoring · outreach · scheduling · proposal · content · reporting ·
business-development — scheduling folded into `sdr`, scoring into
`pipeline-review`); the client-facing agent-team scaffold (Head of Sales / BDR /
SDR / Research); industry convention for SDR-vs-BDR direction of motion. The
"generalist who does many things" is deliberately not a bank role — that is what
`role: custom` and the interview are for.
