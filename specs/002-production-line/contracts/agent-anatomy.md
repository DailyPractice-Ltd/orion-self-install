# Contract — agent anatomy (the shape of a hired agent)

**Scope**: the artefacts `library/HIRING.md` produces. Article X: agent setup is inside
the install journey (the gate's own enumeration), so this is a contract under
002-production-line, not a new spec. Article VII: this shape exists before anything is
built against it. If HIRING.md and this contract disagree, this contract wins and the
disagreement is a defect.

**Source**: install #3 (first live agent team, 4–5 Aug 2026), where every part of this
shape was exercised on a real client machine before being written down here.

## The six parts

A hired agent is exactly six things. Missing any one → not hired (the roster may not
say `Hired`, the shelf may not be told).

1. **Job** — `.claude/agents/<name>.md`, shape below.
2. **Training** — the shared `agent/knowledge-base/`; agents never re-interview the
   client for its contents.
3. **Skill** — zero or one role skill at `.claude/skills/<name>/SKILL.md`; only when
   the role carries a reusable judgment. One screen max.
4. **Tools** — the frontmatter allowlist; least privilege per role.
5. **Shift** — a scheduled task **on the client's machine** (native task, or OS
   scheduler fallback), or a handoff trigger appended to the upstream agent's file.
   Cloud routines are out: they run on a fresh fetch and cannot see the folder or the
   radio settings.
6. **Report** — the mandatory last shift step: one line appended to
   `status/shift-log.md` (unconditional), plus one radio signal when check-ins are on.

## The agent file

Path `.claude/agents/<name>.md`. Frontmatter keys, all lowercase:

| Key | Values | Read by |
|---|---|---|
| `name` | the kebab slug | Claude Code (makes `@name` work) |
| `description` | delegation trigger, one–two sentences | Claude Code |
| `tools` | comma-separated allowlist | Claude Code |
| `skills` | list of role-skill names; omit if none | Claude Code |
| `status` | `probation` \| `hired` | humans + this workflow |
| `go_live` | `false` \| `true` | humans + this workflow |
| `schedule` | `"weekdays HH:MM local"` \| `"after: <upstream>"` | humans + this workflow |
| `version` | semver, starts `0.1.0` | humans + shelf reports |

The honesty split is deliberate and stated in HIRING.md: the first four keys are
runtime-live; the last four are workflow-live. Neither set is decorative.

Body sections, in order: `The job` · `What you must not do` · `Training` ·
`The schedule` · `The report` · `Probation and GO-LIVE` · `Changelog`.

## Probation and GO-LIVE

- `status: probation` until the shift has fired **once, unattended**, evidenced by a
  `status/shift-log.md` line (or a bridge signal) no session was open for. Flipping to
  `hired` is done by a later session that finds that evidence; it is never flipped
  optimistically.
- `go_live: false` → the shift reads and stages only. `true` → additionally the
  **enumerated** standing writes named in the agent file's GO-LIVE section, nothing
  else. The flip is a file edit made at the client's spoken instruction; the edit is
  the record.
- Outbound sends are per-item client yes forever. GO-LIVE cannot grant sending;
  Article III is not softened by this contract.

## The report

`status/shift-log.md` — append-only, one line per shift:

```
{YYYY-MM-DD HH:MM} | {name} | count: {N} | {≤120 chars, no person/company names}
```

Radio signal, when on: `--type crm_updated` if the shift performed client-approved CRM
writes, else `--type workflow_execution_completed`; always `--routine {name}` and
`--count {N}`. **Earmark**: a dedicated `routine_completed` type is planned server-side;
when it exists, shift reports move to it and nothing else changes, because `--routine`
already names the sender. Until then coach-side per-type semantics are approximate for
stage-only shifts; this is a known, accepted imprecision — say so rather than paper
over it.

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

`status/status.json` `packages.{name}` is **truth** (`kind: "agent" | "skill"`, semver
from `0.1.0`, `installed_at`, `smoke_test_passed`); the map's meaning widens from
"installed library packages" to "installed capabilities, library or bespoke". The
roster `.claude/agents/README.md` is the **view**. The agent file's own frontmatter is
the agent's **copy**. On disagreement: status.json wins, the resume matrix in
HIRING.md Part D is the reconciliation procedure.

## Changelog

- 1.0.0 — 2026-08-11 — First written, from install #3's live shape.
