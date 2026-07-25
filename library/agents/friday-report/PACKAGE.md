# Friday Report

Your week's scoreboard, written the hard-honest way: every number backed by evidence
your CRM and calendar can actually show, zeros stated plainly, and exactly one next
action — drafted for your approval, never sent on its own.

| Field | Value |
|---|---|
| **Name** | Friday Report |
| **Kind** | agent |
| **Version** | 1.0.0 |
| **Requires** | A completed knowledge base, your CRM connected or exportable ({{CRM_NAME}}), and a week of real activity to report on. Nothing else — the report is words, not software. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Friday Report from my Orion folder.

1. Read library/agents/friday-report/PACKAGE.md — it is the whole recipe, including
   the report's exact section order and its honesty rules. (If you can't read
   files, ask me to paste it.)
2. Fit it to me, one question at a time: which day I want it ({{REPORT_DAY}},
   default Friday), my timezone, my CRM's stage names, and which channels or
   segments my pipeline splits into (even if the answer is "just one").
3. From then on, on that day, draft my weekly report from my real CRM, calendar
   and email evidence — following every rule on the package page, especially:
   evidence or it didn't happen, zeros said plainly, carry-overs never counted as
   this week's wins, and ONE next action.
4. Show it to me as a draft for approval. Never send or publish it anywhere
   yourself.
5. Run the smoke test at the bottom of the package page, and only when it passes,
   record the install in status/status.json under packages.friday-report
   (kind "agent", version "1.0.0", smoke_test_passed true).
6. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug friday-report --kind agent --version 1.0.0
```

## What it does — the report, section by section

This structure is extracted from a live weekly reporting pack that runs a real sales
operation. Keep the order; every section earns its place:

1. **Snapshot header** — the exact snapshot time and the reporting window
   ("Monday 00:00 to Friday 16:00, {{TIMEZONE}}"). A report that doesn't say when it
   looked can't be trusted about what it saw.
2. **Executive read** — one **bold sentence** verdict a busy owner can act on; then the
   constraint, named honestly ("the problem is conversion, not volume"); one conversion
   insight; and **one next action** — a specific account-level move with an explicit
   finish line ("each of these ends the week with either a booked meeting or a written
   reason in the CRM").
3. **Scorecard table** — metrics as rows, your channels/segments as columns. Small,
   comparable, no decoration.
4. **Supply versus activity, per channel** — what inventory existed, what was new this
   week, what was actually worked (touches, calls, live conversations), what converted.
   The distinction that keeps everyone honest: *activity on old inventory is not new
   supply, and new supply worked by nobody is not progress.*
5. **Named cases with evidence** — the handful of accounts that mattered this week:
   what the evidence shows, and — just as loudly — what did *not* happen ("high
   engagement, but no meeting was booked").
6. **Metric definitions** — one line each, operational: what counts as a touch, a live
   conversation, a meeting; what's excluded (internal notes, unverifiable activity,
   administration).
7. **Source and verification notes** — where each number was read, at what time, and
   what was left out for lacking evidence.

**The honesty rules** (non-negotiable, they're the whole point):
- A zero is written as a zero, in the executive read if it belongs there.
- A win from a previous week is context, never this week's result.
- A CRM stage on its own is not movement — movement needs a same-week note, meeting, or
  timestamp behind it.
- Activity nobody can verify in a system is excluded, and the exclusion is noted.

## What it doesn't do

- It doesn't send, publish, or distribute anything — you get a draft, every time.
- It doesn't fix the week; it tells the truth about it. (Pair with the
  [Revenue Operating Cadence](../../programs/revenue-operating-cadence/PACKAGE.md)
  program for the fixing part.)

## Training it onto your business

Beyond the setup questions in the install prompt, the report gets sharper as your AI
learns which accounts you consider named-case-worthy and how you phrase a verdict.
Correct the first two drafts ruthlessly; that's training, not failure.

## Smoke test — prove it works

At the end of a real working week, ask your AI: **"Draft my weekly report."**

**You'll know it worked when**: one draft report exists covering the real window, every
number in it can answer "where's that from?", at least one honest zero or
did-not-happen appears if the week had one, and it ends with exactly one next action —
waiting for your approval, sent nowhere. Then flip
`packages.friday-report.smoke_test_passed` to `true`.

## Safety rails

The report names real prospects and colleagues: it states evidence, never blame, and
your agent refuses wording that would shame a person rather than describe a number —
in one sentence, offering the factual version instead.

## Changelog

- 1.0.0 — 2026-07-25 — Methodology extracted from a live weekly reporting pack
  (snapshot discipline, executive read, supply-vs-activity accounting, named cases,
  metric definitions, verification notes, honest-zero rules); all source business data
  scrubbed; format re-expressed as plain markdown any AI surface can produce.
