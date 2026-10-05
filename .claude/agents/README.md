# Your team

> **@ summons an agent — a who. / runs a skill — a what.**

Type `@` in Claude Code and your team appears. Each agent is one file in this folder:
its job, its limits, its schedule, its report step. You are the manager — you can read
any job description, ask for a promotion, or fire someone by deleting their file.

**No one hired yet.** Say **"I want to hire an agent"** and the interview starts —
you'll be offered the roles teams typically hire ([the bank](../../library/ROLES.md)),
or just describe the work in your own words; five questions, then your first team
member is working the same session.

## The team

| Agent | Role | Job | Schedule | Status | Skill |
|---|---|---|---|---|---|

## What the team knows

| Skill | The judgment it applies | Used by |
|---|---|---|

**Status legend.** `Probation`: the hire is still in flight. Its first run has not
passed yet. `Hired`: it has done its job once on real work and reported it,
whether you asked or its schedule started it. A hired agent still reads and stages
only, until you take it live.

**Schedule legend.** `on call`: no schedule. It works when you ask. Otherwise the
cell shows the schedule, then how far its proof has got. `(not yet wired)`: a
schedule was chosen, but nothing wakes the agent yet. It works when you ask.
`(not yet proven)`: the wake-up is wired, and has not fired on its own yet.
`(proven)`: it has fired at least once with nobody asking (an `auto:` line in
`status/shift-log.md`; `auto-test:` lines are the hire session's own wiring test and
never count).

How hiring works, in full: [`library/HIRING.md`](../../library/HIRING.md).
