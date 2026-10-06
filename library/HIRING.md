# Hiring — how your team grows

An agent is a colleague who happens to be software. Not a prompt you remember to run:
an employee with a job and training, who does real work and reports it. Every agent
works when you ask. Give one a schedule and it also turns up on its own, whether or
not you opened anything.

The line worth learning once, because everything else hangs off it:

> **@ summons an agent — a who. / runs a skill — a what.**

`@prospecting` is how you talk to your prospecting person. `/meeting-sizing` is how you
run a procedure. Your roster lives at `.claude/agents/README.md`; type `@` in Claude Code
and your team appears.

**If any other file in this folder describes hiring differently, this file wins.**
The shape it produces is contracted in
`specs/002-production-line/contracts/agent-anatomy.md`.

**What "hired" means.** An agent is hired once it has done its job on real work and
reported it. It makes no difference whether you asked for that work or a schedule
started it. A schedule is optional, and it has a separate proof of its own:
"schedule proven" means the schedule has fired once on its own. An agent with no
schedule is **on call**: it works when you ask. (Before 1.1.0 an agent only counted
as hired after a scheduled run had fired on its own. That rule is gone.)

---

## The six parts of a hired agent

Four parts are required: the job, the training, the tools and the report. An agent
missing any one of those is not hired yet. It is a document. The skill and the
schedule are optional.

| Part | Where it lives | Plain words |
|---|---|---|
| **The job** | `.claude/agents/<name>.md` | What it does and never does, in your words |
| **The training** | `agent/knowledge-base/` | Your business, ICP, voice, numbers. Captured once, on Day 1. Shared by the whole team — nobody re-interviews you |
| **The skill** | `.claude/skills/<name>/` | A reusable judgment this role applies — a rubric, a checklist. Only when the role has one |
| **The tools** | the agent file's `tools:` line | Only what the role needs. The scoring agent reads your CRM; it never touches email |
| **The schedule (optional)** | a scheduled task on this machine | When it works without being asked: on a clock, or when another agent hands off. Work started this way is called a shift. An agent without a schedule is on call: it works when you ask |
| **The report** | the last step of every piece of work | One command when the work is finished, whether you asked for it or a schedule started it. It writes one line on this machine and, if your check-ins are on, sends one signal to Daily Practice: the kind of work, how many, and who did it. Never the content. How you know the work was done |

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

**Q1 — the role.** Open [`library/ROLES.md`](ROLES.md) silently first — the bank of
jobs teams typically hire for. Offer it in the client's language, minus any role
already on the roster, best fit for their pipeline first (knowledge base §4), up to
six out loud:

> "Teams typically hire for jobs like these — {each: the role title, then its
> 'what they do for you' in one clause}. Pick one, or describe the work in your own
> words, like you'd brief a temp on their first morning."

Two lanes out, both first-class:

- **Picked from the bank** → confirm the tailored job rather than re-interviewing:
  *"A {title} for {business} would {the role's job line, tailored to the knowledge
  base}. Sound right, or anything you'd change?"* The role's sources pre-fill Q2 and
  its typical schedule pre-fills Q4. Both are defaults to confirm, never assumed.
  The job sheet records `role: {bank slug}`. Then confirm the roster name the same
  way as the custom lane: *"On the roster they'd be `@{name}` — good?"* (default the
  role's own slug when it's free; a head-start package install keeps the package's
  slug). A role with a **Head start** line has a shelf package — offer that install
  before a bespoke build.
- **Described in their own words** → derive the role title and the kebab-case name
  from the answer; confirm inline rather than asking separately: *"Sounds like a
  {title}. On the roster they'd be `@{name}` — good?"* The job sheet records
  `role: custom`. If the description lands within a clause of a bank role, say so
  and offer its head start — but their words win.

Role agents get **job titles, not human names** — your assistant already has the
human name, and a roster of job titles reads like an org chart.

**Q2 — sources and tools.**
> "Where should `@{name}` look, and what may it touch? From your setup I can see:
> {their CRM, email drafts, calendar, this folder's files}. Which of these — and
> anything else you already have? Nothing that would need buying."

**Q3 — guardrails beyond the defaults.**
> "House rules already apply to everyone I'd hire for you: drafts only, nothing sends
> without your yes, no invented facts, never past your pacing limits. Anything this one
> specifically must never do, on top? 'No' is a fine answer."

**Q4: when it works.**
> "When should `@{name}` work? Three ways. On call: they work when you ask, and only
> then. On the clock: say, weekday mornings at 7. Or when something happens: say,
> right after {upstream agent} finishes, or after a call. If it's on the clock: which
> days, what time, your time."

(On call is a full answer, not a lesser one: the agent is hired the same way, and
there is simply no schedule to wire. Schedule times use this machine's clock and
assume it is the client's time. That is true for a laptop; say so out loud if the
machine lives anywhere else. "After a call" and other real-world events need a
carrier: they wire as a handoff from whichever agent or procedure notices the event,
usually the post-call debrief. If no agent notices it yet, say so honestly and offer
the clock, or on call, instead.)

**Q5 — the success line.**
> "Last one. Finish this sentence: 'I'll know `@{name}` is doing the job when ______.'
> We test that line in a minute, on their first run, on real work, while we both
> watch. When it passes, they're hired."

**Skip rule**: anything the client's opening message already answered is read back for
confirmation, never re-asked. Never asked, ever: ICP, tone, offer, objections,
commitments (knowledge base); their name or business name (status.json); machine facts
(machine profile); timezone (schedule times are "your time" by construction).

Then the **job sheet readback**: the whole agent file in plain words (the job, the
must-nots, when it works, the report line and its tag, "reads and stages only until
you take it live"), and then the exact purpose sentence, word for word: *"One
sentence describes what this agent is for: '{purpose: ≤140 chars, about the agent,
never a person, company, or number}'. If your check-ins are on, that exact sentence
goes to Daily Practice."* End with *"Say yes and I'll hire them."* That yes gates all
file creation and is the yes that covers sending that sentence (constitution Article
V, Tier 3). The sentence is
composed and approved whether or not check-ins are on — it lives in the agent file's
`purpose:` line, so a later session (step 8, a promotion, check-ins switched on)
sends the approved words, never a reconstruction. Machine-changing steps after
it (the scheduled task especially) still get their own explicit yes.

### The job sheet — the agent file template

The one copy of this template in the repo. `.claude/agents/{name}.md`:

```markdown
---
name: {name}
description: Use when {delegation trigger from Q1/Q5}. {One-sentence job}. Lists and drafts only.
tools: {comma-separated allowlist from Q2, least privilege}
skills: [{role skill, if extracted — else omit this key}]
role: {bank slug from library/ROLES.md, or custom}
purpose: "{the approved one-sentence purpose from the readback — the exact words the shelf report sends}"
status: probation
go_live: false
schedule: "{on-call | weekdays 07:00 local | after: {upstream-agent}}"
schedule_proven: {false, when there is a schedule. On call: omit this key}
memory: [shared, roles/{role-area}, agents/{name}]
version: 0.1.0
---

# {Title}

## The job
{Q1, in the client's own words, specific enough to check.}
Today's output lands at `{path — e.g. morning-list.md}`, in this folder, where
{client} reads it.

## What you must not do
- Never send anything. Drafts only. Sending is always a separate yes.
- Never write to {CRM} while `go_live` is false; after it flips, only the writes
  listed under GO-LIVE below — everything else still stages.
- Never exceed the commitments and pacing limits in knowledge base §7.
- {Q3 extras, verbatim.}

## Training
Your knowledge of {business} lives in `agent/knowledge-base/`: ICP §2, tone §5,
objections §6, commitments §7. Read what the job needs before every piece of work,
and never re-ask {client} for what it holds. Your team's living memory is the
`memory/` folder (`docs/memory.md`). Before work: `node status/memory.mjs sync`,
then read `memory/INDEX.md` and the areas in your `memory:` line above, and only
those. Other roles' areas are not your reading. New durable facts you learn go back
in (a small file in your area; team-wide truths proposed in `shared/inbox.md`).
Never credentials.

## The schedule
{Q4. On call: "No schedule. I work when {client} asks." Clock: days + time. Handoff:
"I run when {upstream} finishes. See the last line of
`.claude/agents/{upstream}.md`."} If a scheduled run is missed, run at the next
opening; never double up.

## The report: the last step of every piece of work, no exceptions
One command, whether {client} asked for the work or your schedule started it:

`node status/done.mjs --agent {name} --tag {tag} --count N --line "{one short line: what you did, or why N is low}"`

Add `--shift` when your schedule or a handoff started the run, and only then. Never
add it to a run a person asked for or watched: `--shift` is what writes the `auto:`
marker, and that marker is how your schedule is proven. {If the role has a skill:
"Add `--skill {skill}` when you used it."}

The tag says what kind of work this job is. It comes from the menu in
`docs/radio.md`, and it was chosen at hire: `{tag}`.

What the command does, in order:
1. It writes your line on this machine. This half never skips, whatever the radio
   or the memory is doing. With `--shift` the line goes to `status/shift-log.md` as
   `{date} | {name} | count: N | auto: {your line}`. Without it, the line goes to
   `status/work-log.md` as `{date} | {name} | count: N | {tag} | {your line}`. The
   same dated line also goes to the team memory, in `agents/{name}/log.md`, when
   memory is on. One short line: at most 120 characters, and never a key, a token
   or a password. The command refuses a line that looks like one.
2. If check-ins are on, it sends one signal: the tag, the count, the time, and your
   name. Your line is never sent. (The radio is your harness's check-in line to
   Daily Practice: `docs/radio.md`.) Radio off: nothing is sent, and nothing is said
   about it. If the signal does not land, the command adds one more line under
   yours by itself: "(radio unreachable)" when the radio did not answer, or
   "(radio refused 401)" and the like when it answered and did not accept the
   report. The work still counts locally, and that line is what makes the silence
   diagnosable later.

Count only what is real. A shift that fails, or finds nothing to do, still reports:
count 0, and the line says why. A silent failure is worse than a reported one. A
task {client} asked for that did not get finished reports nothing: it is not
finished work, and they are there to see it. Never a person's name, email, or
company in the line.

## Probation and GO-LIVE
Probation is short. It lasts only until your first run passes {client}'s success
line, on real work, in the hire session itself. It does not wait for your schedule
to fire. GO-LIVE is separate, and it is the safety rule.
While `go_live: false`: read and stage only — no external writes of any kind. When
{client} flips it (tell your assistant "take {name} live" — the edit is the record),
additionally allowed, unattended: {the enumerated standing writes from the job sheet}.
When it flips, refresh the frontmatter `description` if it still says drafts-only.
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
   `schedule:` is `on-call` when Q4 chose no schedule, and `schedule_proven: false`
   is written only when there is one. The report's `{tag}` is one tag from the menu
   in `docs/radio.md`: the kind of work this job is.
3. **Extract the role skill, if warranted.** The test: *does this job contain a
   reusable judgment — a rubric the client or another agent would want applied
   identically outside this role's schedule?* Yes → write
   `.claude/skills/{skill}/SKILL.md` (one screen max, the rubric in the client's own
   words) and list it in the agent's `skills:`. The rubric lives in the skill file
   only — never duplicated into the agent file. Pure orchestration ("gather, draft,
   report") never earns a skill. If `library/skills/` already has the equivalent,
   install that package instead.
4. **Append the roster row** to `.claude/agents/README.md`:
   `@{name} | {role title} | {one-line job} | {schedule} | Probation | /{skill or —}`.
   The schedule cell reads `on call` for an on-call agent. For an agent with a
   schedule it reads the schedule and how far its proof has got, starting at e.g.
   `weekdays 07:00 (not yet wired)`. The roster's legend explains each state ("The
   roster", below).
   (On a folder installed before 0.8.0 the roster header has no Role column — add the
   column to the header and a `—` to any existing rows first, so the table stays
   aligned. On a folder installed before 1.1.0 the fourth column still carries its
   old heading and the legend states the old rule: see "The roster", below.)
5. **Record it** in `status/status.json`:
   `packages.{name} = { kind: "agent", role: "{bank slug or custom}",
   purpose: "{the approved sentence}", version: "0.1.0", installed_at: now,
   smoke_test_passed: false }`. While steps 2–8 are in flight, keep a top-level
   `notes` string in status.json — "hire in progress: {name}, next step N" — and
   clear it at step 9.
6. **Wire the schedule, only if Q4 chose one.** An on-call agent has nothing to wire:
   go straight to step 7. Otherwise show the client the exact task first. A scheduled
   task is a machine change and gets its own yes. The wake-up has to start the agent
   software this client actually runs. That is the software you are running in right
   now, whatever was recorded on day one. The ladder:
   - **A — a scheduled task inside the client's own agent software, on THIS machine.**
     Claude Code has scheduled tasks (proven on install #3). The Codex app has
     automations (proven on the WorkWeek installs). Software with neither goes to B.
     The task's prompt, exactly:
     `Open {absolute folder path} and run the {name} shift: first open the
     agent/adapters file for the software you are running in, so you know how to
     reach the radio here; then read .claude/agents/{name}.md, do the job section,
     then the report section with --shift. Stage everything; ask no questions.`
     (The prompt deliberately contains no quote characters.)
     Cloud routines: refuse in one sentence — they run on a fresh copy fetched from
     the internet and cannot see this folder or the radio.
   - **B — the computer's own scheduler**, when the software has no scheduled tasks
     of its own or A fails. Never write this entry by hand. One command builds it:
     `node status/schedule.mjs wire --agent {name} --surface {claude-code | codex} --at {HH:MM} --days {mon,tue,wed,thu,fri}`
     (leave `--days` out for every day). It writes a small wake-up file for this
     agent under `status/shifts/`, and on a Mac the launchd entry beside it. It
     changes nothing outside this folder and switches nothing on. It prints the one
     command that switches the schedule on, and the one that switches it off. Show
     the client the first, and run it on their yes.
     What the wake-up does: goes to this folder and starts the client's software with
     the same prompt as rung A. On Claude Code it allows exactly the tools on the
     agent's job sheet (its `tools:` line) and refuses anything else without asking,
     because nobody is there to ask. On Codex it runs in the workspace sandbox with
     the network allowed, because the report has to reach the radio. The commands
     themselves live in one place, `unattendedRunner` in `status/shapes.mjs`.
     If the command says it cannot (software that cannot be started with nobody
     watching, a command that is not installed, a job sheet with no `tools:` line),
     do not improvise a task: that is a scheduler failure, below. A schedule finer
     than a time of day (every 30 minutes, say) is beyond this rung: use A.
     Where this stands: proven on a Mac with Claude Code. On Codex the wake-up starts
     correctly, sandbox and network included. Windows entries are built by the same
     command and have not yet been run on a client machine. Step 7's wake-up check
     is the proof for this machine, whichever it is.
   - **C — handoff-triggered** (Q4 said "when something happens"): no timer of its
     own. Append one line to the *upstream* agent's file — "When your shift ends, run
     the {name} shift the same way" — plus a changelog line there. That edit is a
     small promotion of the upstream agent and is named as such. A handoff hire
     **inherits the upstream's wake-up**, so C is only complete when the upstream
     itself is wired by A or B — a chain of handoffs must end at a clock.

   If A and B both fail, the schedule stops honestly and the hire does not: carry on
   to step 7 (Part D, "Scheduler failure").
7. **First run now, on real work, in this session.** Two checks. The first one makes
   the hire. The second applies only when there is a schedule.
   *The job*: run the job section immediately, supervised, while you both watch.
   This is a first run, not a shift: a person started it. Then run its report
   section, without `--shift`. Pass = the client's Q5 line is true on real data, and
   the report ran. On a pass, in this order: flip `smoke_test_passed: true`, set
   `status: hired` in the agent file, and change the roster row from `Probation` to
   `Hired`.
   *The wake-up (only when there is a schedule)*: trigger it once **through the
   wake-up itself**: the scheduled task's run-now (or `launchctl kickstart`), or for
   a handoff hire, the upstream's shift, watching the chain fire. Confirm a new line
   lands in `status/shift-log.md`. Then, immediately: **edit the marker from `auto:`
   to `auto-test:` on every line that run wrote**. For a handoff hire that is two
   lines or more: the upstream agent's own line as well as the new agent's, because
   kicking the upstream by hand wrote a fresh `auto:` line for it too. The scheduler
   wrote them, but a person kicked the scheduler, so none of them may count as proof
   that a schedule fires on its own. The wake-up is the layer nobody tests. Test it, not just the job. On a pass, the
   roster's schedule cell moves from "(not yet wired)" to "(not yet proven)".
   **If the job check fails, stop here.** The hire parks honestly: the `packages`
   entry stays `smoke_test_passed: false`, the agent stays `status: probation`, the
   status note says why, step 8 does not happen, and Part D's resume matrix picks it
   up next session. A parked hire is honest. A shelf report of an agent that has not
   done its job is not.
   **If only the wake-up check fails, the hire stands.** The agent is `Hired` and
   works when asked. Its schedule cell stays "(not yet wired)", the status note says
   why, and Part D's "Scheduler failure" lane picks it up next session.
8. **Report the hire. Only when step 7's job check passed.** It does not wait for the
   schedule. The supervised first run already sent its own finished-task signal
   (step 7's report step), and a wiring run's shift-log line says `auto-test:`. Now
   the shelf, which is Daily Practice's record of what this machine runs:
   `node status/radio.mjs report-install --slug {name} --kind agent --version 0.1.0
   --role {the agent file's role line} --purpose "{the agent file's purpose line,
   verbatim — the words the client approved in the readback, never a
   reconstruction}"`.
   The role and purpose are how the bank in `library/ROLES.md` becomes
   evidence-based over time: labels, never content.
   Radio off: both skip, and say so **once, here only**: "Your check-ins are off, so
   Daily Practice won't see {name}'s reports. You will: in `status/work-log.md` for
   work you ask for, and in `status/shift-log.md` for scheduled work."
9. **Close.** Teach the line: "`@{name}` summons them; `/{skill}` runs the judgment
   anywhere." Also, on the first hire only: delete the roster's "No one hired yet"
   line. Then say plainly where things stand. On call: "{name} is hired, and on
   call. Ask whenever you need them." With a schedule: "{name} is hired. Their
   schedule shows as not yet proven until it fires once with nobody asking. I'll
   check next time we talk." The schedule cell stays "(not yet proven)" until a later
   session finds an `auto:` line in `status/shift-log.md`. That session changes the
   cell to "(proven)" and sets `schedule_proven: true` in the agent file.

`status/shift-log.md` is the local twin of the radio for scheduled work: one
append-only line per shift. It answers "did it run?" when the radio is off, and it is
where a schedule is proven. Work a person asked for leaves its line in
`status/work-log.md` instead, in the same one-line shape. Both lines are also
written to the memory log (`memory/agents/{name}/log.md`) when memory is on.

### The roster

`.claude/agents/README.md` is the view the client reads. Its columns are
`Agent | Role | Job | Schedule | Status | Skill`, and its legend reads, word for word:

> **Status legend.** `Probation`: the hire is still in flight. Its first run has not
> passed yet. `Hired`: it has done its job once on real work and reported it,
> whether you asked or its schedule started it. A hired agent still reads and stages
> only, until you take it live.
>
> **Schedule legend.** `on call`: no schedule. It works when you ask. Otherwise the
> cell shows the schedule, then how far its proof has got. `(not yet wired)`: a
> schedule was chosen, but nothing wakes the agent yet. It works when you ask.
> `(not yet proven)`: the wake-up is wired, and has not fired on its own yet.
> `(proven)`: it has fired at least once with nobody asking (an `auto:` line in
> `status/shift-log.md`; `auto-test:` lines are the hire session's own wiring test and
> never count).

An update never touches the roster, so a folder installed before 1.1.0 still shows
the old one: a fourth column that is not yet headed `Schedule`, and a legend that
makes `Hired` wait for a schedule to fire. When you meet that, follow AGENTS.md
("Older folders: the rule changed in 1.1.0"): one sentence to the client, and on
their okay rename the fourth column to `Schedule`, replace the legend with the one
above, and bring each row up to date. A row moves to `Hired` when that agent has done
real work. Its schedule cell becomes `on call`, or its schedule with the right proof
beside it.

### The only test that matters

Three questions. The third applies only when there is a schedule.

1. **Did it do the job on real work?** The client's success line is true, on their
   own data.
2. **Did it report?** The last step of the work ran `node status/done.mjs`: a line on
   this machine always, a signal when check-ins are on.
3. **If it has a schedule: is the wake-up wired, and has it fired once on its own?**
   Its own clock (A or B), or a handoff chain that ends at one, and then an `auto:`
   line in the shift log. Until both are true the schedule is shown as not yet
   wired, or not yet proven. The agent is hired either way.

Install #3 enriched 236 contacts across six days and the coach console showed
nothing. The work was real and invisible, because the agent doing it had no
instruction to report. Later a harness that worked in sessions every day sent
nothing for weeks, because only approvals and scheduled runs could report. So: never
hire an agent without its report step, and never make a schedule the price of being
counted.

---

## Part B — Promoting

Trigger: "promote {name}", "{name} should also do Y".

A promotion **edits the agent's own file**: add the duty to *The job*; extend `tools:`
only if the new duty needs it — least privilege, never "while we're in here"; sharpen
`description` if the summons changes; bump the minor version; append a changelog line
(`- 0.2.0 — {date} — Also {Y} (promoted).`); mirror the version into
`packages.{name}.version`; smoke-test **the new duty only**; re-report the shelf with
the agent file's own `role:` and `purpose:` lines (updating the purpose sentence —
and re-reading it back for a yes — only if the job materially changed; the file's
line is always what is sent).

Guardrails only ever grow in a promotion. Removing one requires the client saying so
explicitly, and gets its own changelog line. If the new duty adds standing writes,
`go_live` resets to `false`. New powers start staged again, until the client takes
them live.

**Giving an on-call agent a schedule is a promotion too.** Set its `schedule:` line,
add `schedule_proven: false`, wire it by step 6, run step 7's wake-up check, and
show the roster's schedule cell as "(not yet proven)". The agent stays `Hired`
throughout: it already did its job on real work. Taking a schedule away is the
reverse: remove the scheduled task, set `schedule: on-call`, drop the
`schedule_proven:` line, and the roster cell reads `on call`.

**When a promotion should be a new hire instead** — would you give this to the same
employee, or is it a second job? Two of three means a second job:

- it wants a **different schedule**;
- it needs **different sources or tools**;
- you'd want its results **counted separately**.

Hard rule regardless: **one agent, at most one schedule.** An agent never gets a second clock;
two clocks is two agents (who may share a skill — that is what skills are for).

---

## Part C — Teaching a skill instead

Sometimes what the client wants is not a colleague but a judgment: "I want it to size
meetings the way I do." That is a skill. It is invoked, not scheduled: no schedule,
no report step of its own, no probation, because a skill stages nothing by itself.
When a task uses the skill, that task's report names it (`--skill {name}`).

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
  shelf package — same job, on the same kinds of sources, producing the same kind of
  output — offer the package first: battle-tested beats bespoke. When in doubt, read
  the package's one-line meaning to the client and let them choose. A bespoke variant
  takes a different name, so one slug never means two things.
- A file that already exists is never overwritten. Same role → offer promotion.
  Half-created → resume. Otherwise → propose another name and ask.

---

## Part D — Honest lanes

**A half-done hire** resumes from its artefacts, in creation order — whatever exists
last tells you the next step:

| Found | Missing | Resume at |
|---|---|---|
| agent file | skill named in its frontmatter | step 3 |
| agent file (+ skill) | roster row | step 4 |
| roster row | `packages` entry | step 5 |
| `packages` entry, smoke test false, a schedule chosen | scheduled task | step 6 |
| scheduled task exists, or the agent is on call | a first run that passed | step 7 |
| smoke passed | `status: hired`, the roster's `Hired`, the shelf report | the end of step 7, then step 8 |
| hired, a schedule chosen | a wired wake-up | step 6, then step 7's wake-up check |
| hired, wake-up wired | an `auto:` line in the shift log | the schedule check below |

Belt: the "hire in progress" note in status.json, and the session-start roster scan.
A row still at `Probation` gets one sentence at session start. So does a schedule
that is not yet wired or not yet proven. Never nagging.

**The schedule check** belongs to a later session, never to the hire itself. Look in
`status/shift-log.md` for an `auto:` line from that agent. `auto-test:` lines are the
hire session's own wiring test and never count. Found: set `schedule_proven: true` in
the agent file and change the roster's schedule cell to "(proven)". Not found: say
the one sentence and offer to look at the wake-up.

**A chat-only surface** (no files, no scripts, no scheduler) gets the honest version:
*"A hired agent lives in your Orion folder: its job file, its record, its report. A
chat can't write any of those. From here we can write the job sheet together, and
you'll have it ready to hand to Claude Code on your computer, where the hire takes
five minutes. What I can't honestly give you from a chat is the hire itself, or a
schedule: a job re-explained by hand each morning is a habit, not an employee, and
it dies the first busy week."*
Job sheet as pasteable text, route to the code-capable surface the client says they
have (their machine profile records it, where you can read one), and the hard rule:
**a hire is recorded as passed (`smoke_test_passed: true`) and reported to the shelf
once its first real run passes, and not before. A schedule that is not wired, or not
proven, is shown as exactly that, never as proven.** No pretending.

**Scheduler failure** after A and B both fail (locked-down IT, permissions, or agent
software with no way to start it unattended): the
schedule stops honestly, and the hire does not. Carry on to step 7. Once the first
run passes, the agent is hired, and it works when the client asks. The roster says so
in plain sight: `Hired`, with the schedule cell `{when} (not yet wired)`. In words:
"Hired, schedule not yet wired (works when you ask)". Leave a note in status.json and
re-offer the wiring next session. The schedule is never shown as proven: proven means
it fired with nobody asking, and this one can't yet. The visible "not yet wired" is
what keeps working-when-asked from quietly becoming the whole answer for a client
who wanted a schedule.

**Radio off**: the local line does not depend on the radio. `done.mjs` writes it
whether check-ins are on or off, so the client's "did it run?" stays answerable: from
`status/shift-log.md` for a shift, from `status/work-log.md` for work they asked for.
Nothing is sent, silently (AGENTS.md rule 7), and the one disclosure happens at hire
time, step 8. Disclosure at hire, silence after.

**Radio on but the signal did not land** (the "didn't answer" line, or an answer
that was not a yes): not the same as off, and never treated as it. `done.mjs` adds
one line under the work's own line, "(radio unreachable)" or "(radio refused ...)",
and carries on. It appends that line and never rewrites the log, so two agents
finishing in the same minute cannot lose each other's line. The client hears the session-start one-liner (AGENTS.md,
"Check the radio") once, at their next session, with the fix for
their surface (`docs/radio.md`, "If the radio can't get through"). A week of unreachable
markers is a wiring problem to fix, not a harness that stopped working.

**An agent hired before 1.1.0** still carries the old report section: it writes its
own shift-log line and sends its signal with `node status/radio.mjs signal`. That
keeps working, and it still counts as the agent's report. Its signals simply carry no
tag. To give them one, swap the agent file's report section for the one in the
template above. That is a small promotion: the client's okay, a version bump, and a
changelog line. Its roster row and `status:` line may also still say `Probation`
under the old rule. AGENTS.md ("Older folders: the rule changed in 1.1.0") is the
repair.
