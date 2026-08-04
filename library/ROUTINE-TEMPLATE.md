# Routine template — how to hire an agent that actually turns up

Copy this shape for every agent in a client's team. It is the difference between a prompt
they have to remember to run and an employee that works whether or not they open anything.

**Three parts, none optional.** An agent missing any one of them is not hired yet:

1. **A job** — what it does, in the client's own words, specific enough to check.
2. **A schedule** — when it fires, without being asked. This is the part everyone skips.
3. **A report** — the last thing it does, every time. This is how the client knows it ran,
   which is the question they actually ask.

---

## The file

One agent, one file, in the client's own folder at `.claude/agents/<name>.md`.

```markdown
---
name: prospecting
description: Fills the top of the pipeline every weekday morning. Lists and drafts only.
---

# Prospecting

## The job

Every weekday morning, find ~20 companies matching my ICP that I am not already talking to,
and stage a first-touch draft for each one I pick.

Work only from my own sources — my CRM's dormant leads, lists I own, the directories and
registries I already pay for. If a source would need buying, say so and stop; never assume
budget I have not given you.

Each prospect needs a one-line "why them" tied to something checkable — size, a trigger
event, sector, a vocabulary match. Never state a guessed fact as if it were true.

## What you must not do

- Never send anything. Drafts only. Sending is always a separate yes from me.
- Never write to the CRM without showing me first.
- Never exceed my pacing limits, even if you have capacity left.

## The schedule

Weekdays at 07:00, my time. If a run is missed, do it at the next opening rather than
doubling up — I would rather have twenty good ones than forty rushed.

## The report

When the run finishes, always, whether it went well or not:

    node status/radio.mjs signal --type crm_updated \
      --routine prospecting --count <how many prospects you actually staged> \
      --note "<one short line: what you did, or why the number is low>"

Count only what is real. A prospect is staged when the draft exists, not when you intended
to write one. If the run failed, report it with `--count 0` and say why in the note —
a silent failure is worse than a reported one, and I would rather know.

Never put a person's name, an email address or a company name in the note. Numbers and
plain description only.

## Tell me

Leave your run summary where I will see it: how many, anything that surprised you, and
anything you want me to decide.
```

---

## Wiring the schedule

The file above says *when*. Something still has to wake the agent up. Ranked by how well
they survive a busy week:

**A. The OS scheduler (recommended).** Windows Task Scheduler or macOS `launchd` runs
Claude Code headless on a timer:

```bash
claude -p "Run the prospecting routine from .claude/agents/prospecting.md"
```

Survives reboots, needs no app open, does not depend on us. About ten minutes to set up per
client, once.

**B. Claude Code's own scheduled tasks.** Less setup where it is available. **Check it on
the client's actual machine before you promise it in a session** — do not demo this cold.

**C. On session start.** The agent runs the routine when the client opens it. This is a
habit, not a routine, and it dies the first busy morning. Fine as a catch-up in addition to
A or B; never the answer on its own.

---

## Why the report step is not optional

The client's real question, asked almost word for word on install #3:

> "you build it, but then how do you know it's going to run? Do you have to prompt it every
> day? Does it automatically know?"

The report *is* the answer. It is how they see their team working when they are not watching,
and it is the only reason a coach can tell a working harness from a silent one.

Install #3 enriched 236 contacts across six days and our system showed nothing at all, because
the agent doing the work had no instruction to report and no schedule to report from. Do not
hire another agent without both.

---

## Checking a routine is actually hired

Four questions. All four have to be yes.

1. Does the file name a schedule, in the client's own timezone?
2. Is something wired to wake it up — A or B above, not C alone?
3. Does the last step of the routine send a signal with a real `--count`?
4. **Has it fired once, on its own, with nobody asking?** Check the coach console:
   `Last active` should move without anyone touching the machine.

Question 4 is the only one that matters. The first three are how you get there.
