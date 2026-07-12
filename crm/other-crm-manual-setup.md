# Other CRM (or no CRM yet) — manual setup

For a client on a CRM without a template in this repository (Pipedrive, Close, Salesforce,
a spreadsheet, a notebook — genuinely anything), or no CRM at all yet. This is not a
lesser path — it just means replicating the same shape by hand instead of running a
script. Walk the client through this directly.

## The shape to replicate

Whatever tool the client ends up using, it needs to hold two things:

### 1. A pipeline

Six stages, in order: **Prospect → Lead → MQL → SQL → Deal → Customer**. If the client's
tool has a kanban/board view (most CRMs do, and a spreadsheet can fake one with a "Stage"
column), set these up as the stages/columns. Map them to the client's own language from
knowledge base §4 — the stage *names* here are internal reference points, not what the
client has to call them.

For each prospect/lead, track at minimum:
- Next action + due date
- Source (which channel this came from — Instagram, LinkedIn, referral, etc.)
- Last touch date
- Which monthly commitment (knowledge base §7) this activity counts toward, if any

### 2. An assessment-profile record

One record, however the tool allows (a note, a dedicated entry, a row in a spreadsheet)
holding: industry/vertical, product/service, ICP description, sales motion, AI tools in
use, CRM in use, team size, self-rated AI-sales maturity, agent name, and this template's
version (from `CHANGELOG.md`). This is what lets the agent (or a future version of this
repository) know the client's context without re-deriving it from scratch.

## No CRM at all — starting from nothing

A spreadsheet with one tab (Pipeline) and one row per prospect covers both requirements
above perfectly well as a starting point. Don't let "no CRM" become a blocker — the
knowledge-base and agent-assembly work (US1) matters more early on, and a spreadsheet is a
completely legitimate place to track pipeline while the client decides on a proper CRM
later.

## When to revisit

If, later, the client adopts Attio or HubSpot, come back to [`crm/README.md`](README.md)
and follow that CRM's own path — the scripted template will bring their new CRM to the
same shape this manual setup approximates by hand.

## Marking this done

Set `status/status.json`'s `crm_choice_made` and `crm_template_applied` to `true` once the
pipeline and assessment-profile record both exist, however simple. "Simple but real" beats
"elaborate but half-finished."
