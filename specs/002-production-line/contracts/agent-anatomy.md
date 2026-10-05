# Contract — agent anatomy (the shape of a hired agent)

**Scope**: the artefacts `library/HIRING.md` produces. Article X: agent setup is inside
the install journey (the gate's own enumeration), so this is a contract under
002-production-line, not a new spec. Article VII: this shape exists before anything is
built against it. If HIRING.md and this contract disagree, this contract wins and the
disagreement is a defect.

**Source**: install #3 (first live agent team, 4–5 Aug 2026), where every part of this
shape was exercised on a real client machine before being written down here.

## The six parts

A hired agent has up to six parts. Four are required: the job, the training, the
tools and the report. Missing any one of those → not hired (the roster may not say
`Hired`, the shelf may not be told). The skill and the schedule are optional.

1. **Job** — `.claude/agents/<name>.md`, shape below.
2. **Training** — the shared `agent/knowledge-base/`; agents never re-interview the
   client for its contents.
3. **Skill** — zero or one role skill at `.claude/skills/<name>/SKILL.md`; only when
   the role carries a reusable judgment. One screen max.
4. **Tools** — the frontmatter allowlist; least privilege per role.
5. **Schedule (optional, at most one)**: a scheduled task **on the client's machine**
   (native task, or OS scheduler fallback), or a handoff trigger appended to the
   upstream agent's file. Work a schedule starts is a **shift**. An agent with no
   schedule is **on call**: it works when asked.
   Cloud routines are out: they run on a fresh fetch and cannot see the folder or the
   radio settings.
6. **Report**: the mandatory last step of every piece of work, whether a person
   asked for it or the schedule started it. One command, `node status/done.mjs`: a
   line on the client's machine, written whether the radio is on or off, plus one
   radio signal when check-ins are on.

**Hired** means the agent has done its job once on real work and reported it. It does
not depend on a schedule. **Schedule proven** is a separate fact, and only agents
with a schedule have it: the schedule has fired once on its own.

## The agent file

Path `.claude/agents/<name>.md`. Frontmatter keys, all lowercase:

| Key | Values | Read by |
|---|---|---|
| `name` | the kebab slug | Claude Code (makes `@name` work) |
| `description` | delegation trigger, one–two sentences | Claude Code |
| `tools` | comma-separated allowlist | Claude Code |
| `skills` | list of role-skill names; omit if none | Claude Code |
| `role` | a `library/ROLES.md` slug \| `custom` | humans + shelf reports |
| `purpose` | the client-approved one-sentence purpose (≤140 chars), verbatim | humans + shelf reports (the exact words sent) |
| `status` | `probation` \| `hired` | humans + this workflow |
| `go_live` | `false` \| `true` | humans + this workflow |
| `schedule` | `"on-call"` \| `"weekdays HH:MM local"` \| `"after: <upstream>"` | humans + this workflow |
| `schedule_proven` | `false` \| `true`. Only when there is a schedule; an on-call agent omits the key | humans + this workflow |
| `memory` | notebook areas the agent reads/writes (feature 003, `docs/memory.md`) | status/memory.mjs + humans |
| `version` | semver, starts `0.1.0` | humans + shelf reports |

The honesty split is deliberate and stated in HIRING.md: the first four keys are
runtime-live on Claude Code; the rest are workflow-live. Neither set is decorative.

Body sections, in order: `The job` · `What you must not do` · `Training` ·
`The schedule` · `The report` · `Probation and GO-LIVE` · `Changelog`.

## Probation and GO-LIVE

- `status: probation` only while the hire is in flight. It becomes `hired` in the
  hire session itself, when the supervised first run passes the client's success
  line on real work and its report step has run. No pass, no flip: it is never
  flipped optimistically. Hired does not wait for a schedule.
- `schedule_proven: false` until the schedule has fired **once, unattended**,
  evidenced by an `auto:` line in `status/shift-log.md` that no session was open
  for. Flipping it to `true` is done by a later session that finds that evidence. A
  schedule that is not wired, or not proven, is shown as exactly that on the roster
  and never as proven. It does not hold the agent back from `hired`.
- `go_live: false` → the agent reads and stages only, asked or scheduled. `true` →
  additionally the
  **enumerated** standing writes named in the agent file's GO-LIVE section, nothing
  else. The flip is a file edit made at the client's spoken instruction; the edit is
  the record.
- Outbound sends are per-item client yes forever. GO-LIVE cannot grant sending;
  Article III is not softened by this contract.

## The report

One command is the whole report step, for every piece of work:

```
node status/done.mjs --agent {name} --tag {tag} --count {N} [--skill {slug}] [--shift] --line "{≤120 chars, no person/company names}"
```

`--shift` is added when the schedule (a clock or a handoff) started the run, and only
then. `{tag}` is one tag from the public menu (`WORK_TAGS` in `status/shapes.mjs`;
`docs/radio.md`), chosen at hire for the kind of work the job is.

The local half comes first, and it never depends on the radio. Every line is
written to the agent's memory log, `memory/agents/{name}/log.md`, when memory is on.
A shift's line is also appended to `status/shift-log.md`, which is append-only, one
line per shift:

```
{YYYY-MM-DD HH:MM} | {name} | count: {N} | auto: {≤120 chars, no person/company names}
```

`done.mjs` writes the `auto:` marker itself. It cannot know whether a person kicked
the scheduler, so the hire session's wiring test (which hand-triggers the scheduler
once) immediately renames its own line's marker to
`auto-test:` (HIRING.md step 7). `schedule_proven` flips to `true` only on an `auto:`
line, never `auto-test:`. A supervised first run leaves no shift-log line at all: it
is not a shift. The line's text is **local only**: the radio carries labels and a
count, never the line (constitution Article V), and `done.mjs` has no flag that
could send it.

Radio signal, when on, sent by `done.mjs` through `radio.mjs signal`:

- a shift → `routine_completed` ("routine" is only the wire name for a shift), with
  `routine: {name}`, `tag` and `count` (0 allowed: it ran and found nothing to do);
- any other run, including the supervised first run → `task_completed`, with
  `routine: {name}`, `tag` and `count` (at least 1);
- either one names a skill that did the work as `asset`, with `asset_kind: skill`,
  `outcome: run_completed`, and `surface: routine` for a shift or `agent` otherwise.

If the radio is on and does not answer, `done.mjs` appends "(radio unreachable)" to
the shift's line in the shift log.

`routine_completed` has been live server-side since 14 Aug 2026 (mono PR #20): the
replay key is
(harness, type, occurred_at, routine), so same-second shifts from different agents are
distinct rows. The interim two-type mapping (crm_updated / workflow_execution_completed)
is retired; signals sent under it remain valid history. An agent hired before 1.1.0
keeps its older report step (a hand-written shift-log line, then
`radio.mjs signal --type routine_completed --routine {name} --count {N}`). That stays
valid, and its signals simply carry no tag.

The standing yes: the client's approval of the job sheet at hire time **is** the
written yes covering the shift's enumerated staging work and its report. AGENTS.md
rule 7 carries the same clause; the two must never diverge.

## Naming

Kebab, `[a-z][a-z0-9-]*`, ≤30 chars — the library-slug shape, because the name keys
`packages.*` and the Daily Practice shelf. Job titles, not human names. Reserved:
`hire-agent`, `create-skill`, the client's `agent_name`, every existing entry under
`.claude/agents/`, `.claude/skills/`, and `packages`. Library slugs are reserved for
library installs — a matching shelf package is offered before any bespoke hire, and a
bespoke variant must take a different name.

## Bookkeeping (which copy wins)

`status/status.json` `packages.{name}` is **truth** (`kind: "agent" | "skill"`,
`role` and `purpose` for agents — a `library/ROLES.md` slug or `custom`, and the
client-approved sentence — semver
from `0.1.0`, `installed_at`, `smoke_test_passed`); the map's meaning widens from
"installed library packages" to "installed capabilities, library or bespoke". A
bespoke hire's entry is written **at hire** with `smoke_test_passed: false` and flips
`true` only on a genuine pass — the no-optimism rule governs the flip, not the write;
the early entry is what makes a half-done hire resumable. A failed smoke test parks
the hire: the entry stays, the shelf is not told. The
roster `.claude/agents/README.md` is the **view**. The agent file's own frontmatter is
the agent's **copy**. On disagreement: status.json wins, the resume matrix in
HIRING.md Part D is the reconciliation procedure.

## Changelog

- 1.0.0 — 2026-08-14 — First written, from install #3's live shape.
- 1.1.0, 2026-10-05: running means running. Hired no longer waits for an unattended
  fire: an agent is hired once it has done its job on real work and reported. The
  schedule became optional (an agent without one is on call), with its own proof,
  `schedule_proven`. The report step became one command, `status/done.mjs`, that
  reports every finished piece of work with a tag, asked or scheduled.
