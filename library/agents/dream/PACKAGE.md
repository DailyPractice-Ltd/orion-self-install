# Dream

Your team's memory gets tidied while you sleep. The dream reads what every agent
wrote during the day — logs, new facts, inbox proposals — merges duplicates, retires
contradicted facts in favour of the latest truth, promotes team-wide lessons into the
shared memory, and rewrites the index. You wake up to a notebook that reads like one
person kept it.

| Field | Value |
|---|---|
| **Name** | Dream |
| **Kind** | agent |
| **Version** | 1.0.0 |
| **Requires** | Memory set up (`node status/memory.mjs check` answers healthily — it does by default from template 0.7.0). Works on both backends; on the shared git setup it also syncs for the whole team. |

## Install prompt — copy this whole block and paste it to your AI

```text
Hire the Dream agent from my Orion folder.

1. Read library/agents/dream/PACKAGE.md and docs/memory.md (or ask me to paste
   them). This hire follows library/HIRING.md as usual, but the interview is
   pre-answered below — confirm with me instead of re-asking.
2. Job sheet answers: name `dream`; job = the nightly consolidation in the
   package's "The shift" section; tools = file read/write in memory/ plus
   running status/memory.mjs and status/radio.mjs — nothing else, no CRM, no
   email; schedule = daily at 02:00 my time; success line = "I'll know dream is
   doing the job when the morning INDEX.md reads clean and I stop seeing
   duplicate or contradicting notes." Its memory: frontmatter is [shared, roles,
   agents] — the dream is the one agent that reads everything, because tidying
   everything is the job.
3. Show me the job sheet, get my yes, then run the standard nine hire steps
   (roster, packages entry, wire the 02:00 shift, smoke test on tonight's real
   memory, report the install).
4. Report the install if my check-ins are on:
   node status/radio.mjs report-install --slug dream --kind agent --version 1.0.0
```

## The shift — what the dream does, in order, every night

1. **Sync first**: `node status/memory.mjs sync` (on the folder backend this is a
   quiet no-op).
2. **Read the day**: `shared/inbox.md`, every `agents/<name>/log.md` line since the
   last dream, every fact file created or changed since then.
3. **Consolidate** — the notebook rules:
   - Two files saying the same thing become one; the survivor keeps the clearest
     wording, and the duplicate is deleted.
   - A fact contradicted by a newer one is **superseded, never erased**: the lesson
     entry in the owning `learning.md` gets `status: superseded` and a pointer to
     its replacement. History stays honest.
   - An inbox proposal seen once stays in the inbox with a tally mark. Seen again —
     or plainly true from the day's evidence — it becomes a small fact file in
     `shared/` and leaves the inbox.
   - Curated lessons follow the learning format: an ID (`L001`, `L002`, ...), the
     source (which shift or proposal), the scope, the rule in one or two lines, and
     `status: active | candidate | superseded`.
   - Noise — one-off trivia no future shift will need — is pruned. When unsure,
     keep it as `candidate`; the next dream decides with more evidence.
4. **Rewrite `INDEX.md`**: the map of what the team now knows, newest lessons named,
   hypotheses listed separately from settled truths.
5. **The safety grep**: search the whole memory folder for credential shapes
   (tokens, keys, `password:`). Anything found is cut from the file, replaced with
   `[removed: credential — never store these]`, and named in the shift-log line.
6. **Sync again**, then **the report step, exactly as HIRING.md writes it**: one
   shift-log line (`auto:` when scheduled) with `count:` = items consolidated, then
   `node status/radio.mjs signal --type routine_completed --routine dream --count N`
   when check-ins are on. The count is the label; the contents stay local, always.

## What it must not do

- Never touch anything outside the `memory/` folder. The dream tidies the notebook;
  it has no opinions about the CRM, the calendar, or anyone's drafts.
- Never delete history: superseded means marked and pointed forward, not erased.
  (The one exception is step 5 — credentials are cut on sight.)
- Never message the client. Its whole voice is the shift-log line and the index.

## Smoke test

Run the shift body once, supervised, on the real memory folder: it must produce a
changed `INDEX.md`, a correct shift-log line whose count matches what it actually
merged or moved, and — if anything contradicted — a superseded entry pointing at its
replacement. Then flip `smoke_test_passed: true` and edit the wiring run's marker to
`auto-test:` per HIRING.md step 7.

## Changelog

- 1.0.0 — 2026-09-25 — First release, shipped with template 0.7.0 (the memory build).
