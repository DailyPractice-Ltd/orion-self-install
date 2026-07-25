# Meeting Sizing

A small, permanent upgrade to how your agent handles meetings: every meeting gets an
intended outcome, a decision-maker, and the shortest length that can actually do the
job — and anything that's just information-sharing becomes a written note instead.

| Field | Value |
|---|---|
| **Name** | Meeting Sizing |
| **Kind** | skill |
| **Version** | 1.0.0 |
| **Requires** | Nothing. Works from the first conversation; gets more useful once your calendar is connected. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Meeting Sizing skill from my Orion folder.

1. Read library/skills/meeting-sizing/PACKAGE.md (or ask me to paste it) and
   adopt its sizing table and booking checklist as your standing rule whenever
   you propose, draft, or schedule anything meeting-shaped for me.
2. From now on, when a meeting request comes up, tell me: the outcome it should
   produce, who the decision-maker is, the size you recommend from the table,
   and — if it's information-sharing only — the async alternative first.
3. Run the smoke test at the bottom of the package page, and only when it
   passes, record the install in status/status.json under
   packages.meeting-sizing (kind "skill", version "1.0.0",
   smoke_test_passed true).
4. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug meeting-sizing --kind skill --version 1.0.0
```

## The rule your agent adopts

**Principles** — a meeting exists to decide, solve, align, or build; information travels
better in writing. Protect focused work; batch small approvals; never default to
30 minutes just because calendars suggest it.

**The sizing table**:

| Situation | Default | Use when |
|---|---:|---|
| Decision / unblock | 10 min | One clear question, prepared context, the decision-maker present |
| Triage / quick alignment | 15 min | A few updates or one narrow handoff |
| Working session | 25 min | Active problem-solving, review, or preparation |
| Complex decision | 45 min | Multiple trade-offs, real risk, several accountable people |
| Workshop | 50 min | Group design or planning that needs room for contribution |

Change a default only when the agenda justifies it — and say why.

**The booking checklist** — before proposing any time: the outcome, the attendees who
can actually decide, the minimum useful duration, the pre-read, the timezone, and the
explicit next action. If a required person can't attend, propose an async decision note
or a shorter preliminary call instead.

## What it doesn't do

It never books, moves, or declines anything itself — calendar changes remain
yours-on-yes, like everything in this kit.

## Smoke test — prove it works

Pick one real meeting you're about to set up and ask your AI to propose it.

**You'll know it worked when**: the proposal names the outcome and decision-maker,
picks a length from the table (with a reason if it deviates), and — if your meeting was
really an update — has the honesty to suggest a written note instead. Then flip
`packages.meeting-sizing.smoke_test_passed` to `true`.

## Changelog

- 1.0.0 — 2026-07-25 — Extracted verbatim-in-spirit from a live operating harness's
  scheduling policy (sizing table, booking checklist, async-first principle); already
  generic at the source, so the scrub was a formality.
