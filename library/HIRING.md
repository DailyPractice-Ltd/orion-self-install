# Hiring — how your team grows

An agent is a colleague who happens to be software. Not a prompt you remember to run:
an employee with a job, training, and a shift — one that turns up whether or not you
opened anything.

The line worth learning once, because everything else hangs off it:

> **@ summons an agent — a who. / runs a skill — a what.**

`@prospecting` is how you talk to your prospecting person. `/meeting-sizing` is how you
run a procedure. Your roster lives at `.claude/agents/README.md`; type `@` in Claude Code
and your team appears.

**If any other file in this folder describes hiring differently, this file wins.**
The shape it produces is contracted in
`specs/002-production-line/contracts/agent-anatomy.md`.

---

## The six parts of a hired agent

An agent missing any one of these is not hired yet — it is a document.

| Part | Where it lives | Plain words |
|---|---|---|
| **The job** | `.claude/agents/<name>.md` | What it does and never does, in your words |
| **The training** | `agent/knowledge-base/` | Your business, ICP, voice, numbers. Captured once, on Day 1. Shared by the whole team — nobody re-interviews you |
| **The skill** | `.claude/skills/<name>/` | A reusable judgment this role applies — a rubric, a checklist. Only when the role has one |
| **The tools** | the agent file's `tools:` line | Only what the role needs. The scoring agent reads your CRM; it never touches email |
| **The shift** | a scheduled task on this machine | When it works, with nobody asking. **The part everyone skips, and the one that makes it an employee** |
| **The report** | the last step of every shift | One line locally, one signal to Daily Practice if your check-ins are on. How you know it ran |

---

## Part A — Hiring

### Before the interview (installer: do this silently)

Read `agent/knowledge-base/01–07`, `status/status.json` (agent name, packages,
machine profile), and the roster at `.claude/agents/README.md`. If the client's folder
has a team map file, read that too.

**Gate**: if the knowledge base is incomplete, hiring waits — a new hire trains on the
Day 1 knowledge base, so finish that first. And the standing rule of this whole folder
applies double here: **never ask the client anything the knowledge base already
answers.** An agent that re-interviews its owner is a failed install, not a feature.

Open with a readback, one message:

> "Before I ask anything — here's what I already know so you don't repeat yourself: you
> sell {offer, one clause} to {ICP, one clause}, and your team today is {roster, or
> 'just {agent name}'}. I won't ask about your ideal customer, your tone, or your
> numbers — that's in your knowledge base. Five questions, one at a time, then I'll show
> you the job sheet before anything is created."

### The interview — five questions, one at a time

**Q1 — the job.**
> "What should this new team member take off your plate? Tell me like you'd brief a temp
> on their first morning — what does a good day's work from them look like?"

Derive the role title and the kebab-case name from the answer; confirm inline rather
than asking separately: *"Sounds like a {title}. On the roster they'd be `@{name}` —
good?"* Role agents get **job titles, not human names** — your assistant already has the
human name, and a roster of job titles reads like an org chart.

**Q2 — sources and tools.**
> "Where should `@{name}` look, and what may it touch? From your setup I can see:
> {their CRM, email drafts, calendar, this folder's files}. Which of these — and
> anything else you already have? Nothing that would need buying."

**Q3 — guardrails beyond the defaults.**
> "House rules already apply to everyone I'd hire for you: drafts only, nothing sends
> without your yes, no invented facts, never past your pacing limits. Anything this one
> specifically must never do, on top? 'No' is a fine answer."

**Q4 — the shift.**
> "When should `@{name}` work — on the clock (say, weekday mornings at 7), or when
> something happens (say, right after {upstream agent} finishes, or after a call)? If
> it's on the clock: which days, what time, your time."

**Q5 — the success line.**
> "Last one. Finish this sentence: 'I'll know `@{name}` is doing the job when ______.'
> That line becomes their probation test — we'll check it on their first shift in a
> minute."

**Skip rule**: anything the client's opening message already answered is read back for
confirmation, never re-asked. Never asked, ever: ICP, tone, offer, objections,
commitments (knowledge base); their name or business name (status.json); machine facts
(machine profile); timezone (schedule times are "your time" by construction).

Then the **job sheet readback**: the whole agent file in plain words — job, must-nots,
schedule, the report line, "starts on probation: reads and stages only" — ending *"Say
yes and I'll hire them."* That yes gates all file creation. Machine-changing steps after
it (the scheduled task especially) still get their own explicit yes.

### The job sheet — the agent file template

The one copy of this template in the repo. `.claude/agents/{name}.md`:

```markdown
---
name: {name}
description: Use when {delegation trigger from Q1/Q5}. {One-sentence job}. Lists and drafts only.
tools: {comma-separated allowlist from Q2, least privilege}
skills: [{role skill, if extracted — else omit this key}]
status: probation
go_live: false
schedule: "{weekdays 07:00 local | after: {upstream-agent}}"
version: 0.1.0
---

# {Title}

## The job
{Q1, in the client's own words, specific enough to check.}

## What you must not do
- Never send anything. Drafts only. Sending is always a separate yes.
- Never write to {CRM} while `go_live` is false; after it flips, only the writes
  listed under GO-LIVE below — everything else still stages.
- Never exceed the pacing limits in knowledge base §7.
- {Q3 extras, verbatim.}

## Training
Your knowledge of {business} lives in `agent/knowledge-base/` — ICP §2, tone §5,
objections §6, commitments §7. Read what the job needs at the start of every shift;
never re-ask {client} for what it holds.

## The schedule
{Q4. Clock: days + time. Handoff: "runs when {upstream} finishes — see the last line
of `.claude/agents/{upstream}.md`."} If a run is missed, run at the next opening;
never double up.

## The report — last step of every shift, no exceptions
1. Append one line to `status/shift-log.md`:
   `{date} | {name} | count: N | {one short line — what you did, or why N is low}`
2. If check-ins are on and you can run scripts:
   `node status/radio.mjs signal --type {crm_updated if the shift performed approved
   CRM writes, else workflow_execution_completed} --routine {name} --count N --note
   "{same short line}"`
   Radio off → skip this step silently; step 1 never skips.
Count only what is real. Failed run → count 0 and say why — a silent failure is worse
than a reported one. Never a person's name, email, or company in the note.

## Probation and GO-LIVE
While `go_live: false`: read and stage only — no external writes of any kind. When
{client} flips it (tell your assistant "take {name} live" — the edit is the record),
additionally allowed, unattended: {the enumerated standing writes from the job sheet}.
Outbound messages are never automatic, live or not. That rule has no flip.

## Changelog
- 0.1.0 — {date} — Hired. {One line on the job.}
```

Honesty note: Claude Code natively reads `name`, `description`, and `tools` — that is
what makes `@{name}` work. The other keys are load-bearing for humans and this workflow,
not the runtime. Both facts are fine, and stated.

### Executing the hire — nine steps, in order

1. **Collision check** (naming rules below). Same role exists → this is a promotion,
   go to Part B. Half-created leftovers → resume matrix, Part D.
2. **Write `.claude/agents/{name}.md`** from the template, every placeholder filled
   from the interview and the knowledge base. `status: probation`, `go_live: false`.
3. **Extract the role skill, if warranted.** The test: *does this job contain a
   reusable judgment — a rubric the client or another agent would want applied
   identically outside this role's schedule?* Yes → write
   `.claude/skills/{skill}/SKILL.md` (one screen max, the rubric in the client's own
   words) and list it in the agent's `skills:`. The rubric lives in the skill file
   only — never duplicated into the agent file. Pure orchestration ("gather, draft,
   report") never earns a skill. If `library/skills/` already has the equivalent,
   install that package instead.
4. **Append the roster row** to `.claude/agents/README.md`:
   `@{name} | {one-line job} | {schedule} | Probation | /{skill or —}`.
5. **Record it** in `status/status.json`:
   `packages.{name} = { kind: "agent", version: "0.1.0", installed_at: now,
   smoke_test_passed: false }`. While steps 2–8 are in flight, keep a note line
   "hire in progress: {name}, next step N"; clear it at step 9.
6. **Wire the shift** — show the client the exact task first; a scheduled task is a
   machine change and gets its own yes. The ladder:
   - **A — native scheduled task on THIS machine** (proven on install #3). The task's
     prompt, exactly:
     `Open {absolute folder path} and run the {name} shift: read
     .claude/agents/{name}.md, do "The job", then "The report". Stage everything; ask
     no questions.`
     Cloud routines: refuse in one sentence — they run on a fresh copy fetched from
     the internet and cannot see this folder or the radio.
   - **B — OS scheduler**, when the surface has no native tasks or A fails. Windows:
     `schtasks /Create /TN "Orion {name} shift" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 07:00 /TR "cmd /c cd /d {folder} && claude -p \"{the same prompt}\""`
     macOS: write `~/Library/LaunchAgents/world.dailypractice.orion.{name}.plist`
     (ProgramArguments: `zsh -lc 'cd {folder} && claude -p "{the same prompt}"'`,
     StartCalendarInterval from Q4), then `launchctl load` it. The agent writes and
     loads it; the client types nothing. If the plain `claude` name fails in a
     scheduler, use its full path.
   - **C — handoff-triggered** (Q4 said "when something happens"): no timer. Append
     one line to the *upstream* agent's file — "When your shift ends, run the {name}
     shift the same way" — plus a changelog line there. That edit is a small
     promotion of the upstream agent and is named as such.
7. **Smoke test now — two layers, both on real data, in this session.**
   *Logic*: run the shift body immediately, supervised — their first shift, while you
   both watch. Pass = the client's Q5 line is true on real data. Flip
   `smoke_test_passed: true`.
   *Wiring*: trigger the scheduled task once **through the scheduler itself** (its
   run-now button, or `launchctl kickstart`) and confirm a new line lands in
   `status/shift-log.md`. The wake-up is the layer nobody has ever tested — test it,
   not just the logic.
8. **Report.** The supervised shift already sent its own signal (step 7's report
   step, `--note "first shift, supervised"`). Now the shelf:
   `node status/radio.mjs report-install --slug {name} --kind agent --version 0.1.0`.
   Radio off → both skip, and say so **once, here only**: "Your check-ins are off, so
   Daily Practice won't see {name}'s reports — you will, in `status/shift-log.md`."
9. **Close.** Teach the line: "`@{name}` summons them; `/{skill}` runs the judgment
   anywhere." Then say plainly: "{name} is on probation until their shift fires once
   with nobody asking — I'll check next time we talk." The roster stays `Probation`
   until a later session finds an unattended line in `status/shift-log.md`; then flip
   roster and frontmatter to `Hired`.

`status/shift-log.md` is the local twin of the radio: one append-only line per shift.
It answers "did it run?" when the radio is off, and the probation check reads it.

### The only test that matters

Four questions; the first three are how you get to the fourth.

1. Does the agent file name a schedule, in the client's own time?
2. Is something wired to wake it — ladder A or B, not C alone?
3. Does the last step of the shift report, locally always, radio when on?
4. **Has it fired once, on its own, with nobody asking?**

Install #3 enriched 236 contacts across six days and the coach console showed
nothing — the work was real and invisible, because the agent doing it had no
instruction to report and no schedule to report from. Do not hire another agent
without both.

---

## Part B — Promoting

Trigger: "promote {name}", "{name} should also do Y".

A promotion **edits the agent's own file**: add the duty to *The job*; extend `tools:`
only if the new duty needs it — least privilege, never "while we're in here"; sharpen
`description` if the summons changes; bump the minor version; append a changelog line
(`- 0.2.0 — {date} — Also {Y} (promoted).`); mirror the version into
`packages.{name}.version`; smoke-test **the new duty only**; re-report the shelf.

Guardrails only ever grow in a promotion. Removing one requires the client saying so
explicitly, and gets its own changelog line. If the new duty adds standing writes,
`go_live` resets to `false` — new powers earn their own probation.

**When a promotion should be a new hire instead** — would you give this to the same
employee, or is it a second job? Two of three means a second job:

- it wants a **different schedule**;
- it needs **different sources or tools**;
- you'd want its results **counted separately**.

Hard rule regardless: **one agent, one schedule.** An agent never gets a second clock;
two clocks is two agents (who may share a skill — that is what skills are for).

---

## Part C — Teaching a skill instead

Sometimes what the client wants is not a colleague but a judgment: "I want it to size
meetings the way I do." That is a skill — invoked, not scheduled. No shift, no report,
no probation, because a skill stages nothing by itself.

The interview is three questions:

1. > "What's the call you keep making that you want made the same way every time — and
   > when does it come up?"
   (→ the description, which is the `/` trigger)
2. > "Walk me through how you decide. What separates a good {thing} from a bad one —
   > rules of thumb, thresholds, what you'd tell a new hire?"
   (→ the rubric, captured in their words — knowledge-base discipline applies)
3. > "Give me one real example from this week. I'll run the new skill on it right now —
   > that's the test."

Execution: collision check → write `.claude/skills/{name}/SKILL.md` (frontmatter
`name` + `description`; body = the rubric; **one screen max**) → run it on the Q3
example; pass = the client says "yes, that's my call" → record in `packages` with
`kind: "skill"` → add a row to the skills table in `.claude/agents/README.md` →
`node status/radio.mjs report-install --slug {name} --kind skill --version 0.1.0`.

The size bar is a rule, not advice: a skill file longer than a screen is an agent
trying to happen. Offer the hire path.

---

## Naming and collisions

- Lowercase-kebab, starts with a letter, ≤ 30 characters — the same shape as library
  slugs, because the name keys the `packages` map and the Daily Practice shelf.
- Job titles for role agents, never human names.
- Reserved: `hire-agent`, `create-skill`, the client's own agent name, anything already
  under `.claude/agents/` or `.claude/skills/` (including `speckit-*`), anything in the
  `packages` map.
- **Library slugs are reserved for library installs.** If the requested role matches a
  shelf package, offer the package first — battle-tested beats bespoke. A bespoke
  variant takes a different name, so one slug never means two things.
- A file that already exists is never overwritten. Same role → offer promotion.
  Half-created → resume. Otherwise → propose another name and ask.

---

## Part D — Honest lanes

**A half-done hire** resumes from its artefacts, in creation order — whatever exists
last tells you the next step:

| Found | Missing | Resume at step |
|---|---|---|
| agent file | skill named in its frontmatter | 3 |
| agent file (+ skill) | roster row | 4 |
| roster row | `packages` entry | 5 |
| `packages` entry, smoke test false | scheduled task | 6 |
| task exists | shift-log line | 7 |
| smoke passed | shelf report | 8 |
| everything | an unattended fire | probation check |

Belt: the "hire in progress" note in status.json, and the session-start roster scan —
any row not `Hired` gets one sentence at session start, never nagging.

**A chat-only surface** (no files, no scheduler) gets the honest version: *"A hired
agent needs a machine that can run it on a clock. From here we can write the job sheet
together — you'll have it ready to hand to Claude Code on your computer, where the hire
takes five minutes. What I can't honestly give you from a chat is the shift: running it
by hand each morning is a habit, not an employee, and it dies the first busy week."*
Job sheet as pasteable text, route to the code surface their machine profile names, and
the hard rule: **a hire whose shift isn't wired is never recorded in `packages` and
never reported to the shelf.** No pretending.

**Scheduler failure** after A and B both fail (locked-down IT, permissions): honest
stop. Roster row reads `Hired — not yet scheduled (runs when you open a session, as a
stopgap)`, a note in status.json, re-offer next session. The visible status is what
keeps the stopgap from silently becoming the answer.

**Radio off**: the local shift-log line is unconditional — the client's "did it run?"
is always answerable. The signal skips silently at shift time (rule 7), and the one
disclosure happens at hire time, step 8. Disclosure at hire, silence on shifts.
