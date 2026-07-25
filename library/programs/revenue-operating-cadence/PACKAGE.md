# Revenue Operating Cadence

The operating rhythm that moves revenue from attention to cash without dropping it
anywhere along the way: a lifecycle with a named control at every stage, a rule that
every project has an owner and a next action, and a daily / weekly / monthly beat your
agent runs with you.

| Field | Value |
|---|---|
| **Name** | Revenue Operating Cadence |
| **Kind** | program |
| **Version** | 1.0.0 |
| **Requires** | Your CRM ({{CRM_NAME}}). Your invoicing/accounting tool ({{ACCOUNTING_TOOL}}) makes the collections beat real — without one connected, that beat runs from your answers instead. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Revenue Operating Cadence program from my Orion folder.

1. Read library/programs/revenue-operating-cadence/PACKAGE.md — it is the whole
   recipe. (If you can't read files, ask me to paste it.)
2. Fit it to me, one question at a time: who owns what ({{TEAM_MEMBERS}} — solo
   is a fine answer: you own everything, and the program matters more, not
   less), my CRM's stage names, my invoicing tool, my timezone, and when I want
   the daily check (default: first thing each working morning).
3. From then on, run the beat with me: the daily five-minute review, the weekly
   inspection, the monthly reconciliation — each producing decisions and dated
   next actions, never a status report for its own sake.
4. Hold me to the project rules below — kindly, but every time.
5. Run the smoke test at the bottom of the package page, and only when it
   passes, record the install in status/status.json under
   packages.revenue-operating-cadence (kind "program", version "1.0.0",
   smoke_test_passed true).
6. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug revenue-operating-cadence --kind program --version 1.0.0
```

## The operating chain

Market insight → demand → qualified opportunity → signed agreement → successful
delivery → invoice → **collected cash** → renewal or expansion. Activity anywhere on
the chain is only worth what it moves toward collected cash — that's the mandate, and
it's also the kindness: it stops busywork from feeling like progress.

**Minimum control per stage** (your agent keeps these current in {{CRM_NAME}}):

| Stage | The control that must exist |
|---|---|
| Acquisition | Every opportunity: stage, value, owner, close date, next action date |
| Marketing | Every campaign: owner, audience, hypothesis, cost, response, pipeline contribution |
| Delivery / success | Every customer: success plan, health signal, risk, next milestone, renewal date |
| Invoicing & collections | Every invoice: date, due date, amount, status, last contact, promised payment date, dispute flag, next action |
| Administration | Every commitment: named owner, source of truth, due date, completion evidence |

One rule from the source operation worth keeping verbatim in spirit: **one-off
setup/launch fees and recurring subscription revenue live on separate lines and are
never blended** — a credit against one must not quietly shrink the other.

## The project rules

Every active project states: (1) the outcome and its measurable definition of done,
(2) one directly responsible person, (3) the due date, (4) the next physical action and
its owner, (5) the blocker if stalled, with an escalation date, (6) where the evidence
of completion will live. And the three honesty rules: *a project without a next action
is paused; a project without an owner is not a project; a status update without a
decision, handoff, or next action is waste.*

## The beat

- **Daily (5 minutes)**: urgent revenue risks, overdue next actions, customer risks,
  invoices due or overdue, decisions waiting on you. Output: today's short list.
- **Weekly**: pipeline movement, campaign learning, customer health, renewals,
  collections aging, blockers, handoffs. Output: decisions and dated next actions —
  pairs perfectly with the [Friday Report](../../agents/friday-report/PACKAGE.md).
- **Monthly**: forecast reconciled to collected cash, leakage found, low-value work
  stopped, the few improvements that matter chosen.

**On chasing money** (the part most people avoid): be firm and humane. State the
invoice and due date as an observation, explain the need, ask for payment or an exact
commitment date, and make the next step explicit if it's missed. Vague periods like
"next week" are not commitments. Persistence lives in the cadence, not aggression in
the language — and a payment is only *collected* when your accounting tool confirms
it, never when someone says it was made.

## What it doesn't do

It never sends a collections message, changes an invoice, or touches your CRM without
your yes — the program proposes, you approve. Escalations beyond polite persistence
(fees, holds, legal) are decisions this program surfaces to you, never takes.

## Smoke test — prove it works

Tomorrow morning, ask your AI: **"Run today's revenue check."**

**You'll know it worked when**: five minutes later you have today's short list —
real overdue actions, real invoices with real dates, at most a handful of decisions —
and each item ends in an owner and a date, not a shrug. Then flip
`packages.revenue-operating-cadence.smoke_test_passed` to `true`.

## Safety rails

Collections wording follows the observation → need → request → next-step standard
above; your agent refuses to draft anything that shames, threatens, or manufactures
urgency, in one sentence, offering the firm-and-humane version instead.

## Changelog

- 1.0.0 — 2026-07-25 — Extracted from a live operating harness's revenue-operations
  and collections playbooks: lifecycle controls, project rules, daily/weekly/monthly
  cadence, collections communication standard, and the confirmed-cash rule; tool names
  and team structure templatised; all source business data scrubbed.
