# Call-Planner Control Tower

Every morning, one honest answer to "who do I call today, in what order, and what do I
say?" — built from your own pipeline, with the people you *shouldn't* call yet held out
in plain sight instead of hidden.

| Field | Value |
|---|---|
| **Name** | Call-Planner Control Tower |
| **Kind** | agent |
| **Version** | 1.0.0 |
| **Requires** | A completed knowledge base (`agent/knowledge-base/`), your CRM connected or exportable ({{CRM_NAME}} — any CRM works), and — for the optional generator — Node.js. Without Node, your AI produces the same day sheet by hand. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Call-Planner Control Tower from my Orion folder.

1. Read library/agents/call-planner/PACKAGE.md — it is the whole recipe. (If you
   can't read files, ask me to paste it, then ask for the other files by name as
   you need them.)
2. Fit it to my business, one question at a time: my team members who make calls,
   my pipeline stage names as they appear in my CRM, and my timezone — then keep
   my answers with my agent's knowledge base and use them to fill every
   {{PLACEHOLDER}} before you show me anything rendered.
3. Set up my morning routine: each working day, build today's call-data from my
   live CRM (the data shape is in the package page), then produce my day sheet —
   run library/agents/call-planner/build-call-plan.mjs if you can run scripts,
   or write the day sheet yourself in the exact same format if you can't.
4. Run the smoke test at the bottom of the package page on my real pipeline, and
   only when it passes, record the install in status/status.json under
   packages.call-planner (kind "agent", version "1.0.0",
   smoke_test_passed true).
5. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug call-planner --kind agent --version 1.0.0
```

## What it does

- **Triage, the battle-tested way**: overdue callbacks outrank everything, then
  priority (P0 first), then owner — so a promise made to a prospect is never quietly
  broken by a shinier lead.
- **A day sheet with context**: each call carries the person, their role, the number to
  dial (and the fallback), the working **angle** — the one-line reason this call is
  worth their time — plus the last note and any agreed callback.
- **The honest hold-out**: contacts whose role, phone route, angle, or lifecycle isn't
  safe enough to present as call-ready go to a separate **Needs Enrichment** sheet with
  the reason and a safe next step. A thin call sheet you can trust beats a fat one you
  can't.
- **A scoreboard that counts itself**: dials, connects, connect rate, callbacks due —
  from the sheet, not from memory.

## What it doesn't do

- It never dials, sends, or writes to your CRM by itself. It plans; you call.
- It doesn't find *new* prospects — that's the [Prospecting](../prospecting/PACKAGE.md)
  agent's job. This one orders the calls your pipeline already deserves.

## The data contract (for your AI, and any tool you prefer)

One JSON file, `call-data.json`, that your AI rebuilds from your CRM each morning —
`call-data.template.json` is the empty starting point (its `{{TEAM_MEMBERS}}` and
`{{PIPELINE_STAGES}}` are filled by your AI during install, from your answers):

- `today[]` — call-ready entries: `priority`, `company`, `name`, `position`, `direct`,
  `fallback`, `angle`, `owner`, `stage`, `dialled`, `connected`, `outcome`,
  `callback_at`, `call_note`.
- `enrichment[]` — held-out entries: the same identity fields plus `reason` (why it's
  not call-ready) and `safe_next_step`.
- `history[]` — yesterday's attempts, moved here on each rebuild so the day sheet stays
  about today.
- `lists` — your vocabulary: `priorities`, `owners`, `stages`, `outcomes`. Keep entries
  to these values so the counting stays honest.

## Training it onto your business

Your AI will ask — one at a time — for: who makes calls ({{TEAM_MEMBERS}}), your CRM's
exact stage names ({{PIPELINE_STAGES}}), and your timezone ({{TIMEZONE}}). The angle
lines come from your own knowledge base (offer, ICP, objection library) — expect the
first few day sheets to include angle drafts for your reaction, and expect them to get
noticeably better after a week of your corrections.

## Smoke test — prove it works

With your real pipeline connected (or exported), ask your AI: **"Build today's call
plan."**

**You'll know it worked when**: a day sheet exists for today's date, listing your real
prospects in overdue-callbacks-first order, each with an angle you'd actually say out
loud — and at least the sheet's held-out section honestly explains anyone missing. Then
flip `packages.call-planner.smoke_test_passed` to `true`.

## Safety rails

This agent plans calls; it sends nothing and writes nothing external without your yes.
If an angle would need to shame, pressure, or mislead the person being called to work,
your agent refuses it in one sentence and offers the closest honest angle instead.

## Changelog

- 1.0.0 — 2026-07-25 — Extracted from a live operating harness's daily calling command
  center: triage order, hold-out rule, vocabulary, and scoreboard arithmetic preserved;
  re-expressed dependency-free (markdown + CSV instead of a spreadsheet runtime); all
  source business data scrubbed and templatised.
