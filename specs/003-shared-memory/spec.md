# 003 — Shared memory (template 0.7.0)

**One shared memory per client organisation.** Every harness install — any person, any
machine — reads it before work and writes it after, with zero client setup. Habits live in
the agent definitions, not in anything the client operates. Plain-words contract:
`docs/memory.md` (which wins over any other file that describes memory differently,
including this one).

## Why

Every harness forgot between sessions unless someone improvised. The field improvised
three incompatible formats (WorkWeek Chief of Staff `preferences/`, Alni `context-library/`
+ per-agent `learning.md` with active/candidate/superseded states, Neo's managed-agents
experiments, whose conclusion was: steal the managed-memory *shape* — small files, one
fact per file, an index the agent reads, a scheduled sweep). This spec standardises that
shape into the template.

## Decisions (Oliver, 25 Sep 2026)

- **Hosting: pluggable backend; the long-term optimal backend is an open question.**
  Two interchangeable backends behind one folder layout: `folder` (a plain local folder —
  openable as an Obsidian vault, syncable by any client-side tool) and `git` (a private
  repository in the CLIENT's own account, cloned into each harness; agents pull/push
  silently and the client never touches git). **Daily Practice will not host client
  memory.** The pilot tests the git backend; the readout decides.
- **Write policy: all agents write freely; a nightly dream consolidates.** No write ACLs.
  Scopes are READ guidance only (the job-sheet `memory:` frontmatter keeps a talent agent
  out of the sales ICP). Fast accumulation is fine because cleanup is nightly.
- **Memory is radio-independent.** The shift-log asymmetry extends: the local memory
  write never skips; only the radio half does. Nothing in `memory/` ever rides the radio.

## Shape

```
memory/
  README.md          template-owned (the only file here an update touches)
  INDEX.md           the map; the dream agent maintains it
  shared/            team-wide truths, one small file per fact
    inbox.md         append-only proposals from any agent
  roles/<area>/      role memory (sales/, ops/, ...)
  agents/<name>/     log.md (shift summaries) + learning.md (Alni format:
                     ID · source · scope · rule · status active|candidate|superseded)
```

## Pieces (all in this template, version 0.7.0, schema 1.5.0)

- `status/status.json` gains `memory: { enabled, backend, remote, path }` — defaults
  enabled + `folder` + `memory/`, so a fresh install has working memory with no setup.
- `status/memory.mjs` — `init | sync | note | file | check`; radio.mjs posture (off or
  broken → one plain line, exit 0, work never blocked); credential tripwire on every
  write; paths locked inside the memory root; folder backend self-scaffolds on first
  touch, git backend clones on explicit `init`.
- `status/shapes.mjs` — `memoryBlock`, `memoryConfigured`, `memoryOn` (deliberately
  radio-independent), `MEMORY_BACKENDS`, `MEMORY_GIT_REMOTE_RE`.
- `agent/agent-definition.md` — "The notebook" section: sync + read INDEX and scopes
  before work; log line, fact files, inbox proposals, sync after. Never credentials;
  never narrated to the client.
- `library/HIRING.md` — job-sheet `memory:` read-scopes frontmatter; the report step
  writes the same shift line into the team memory before any radio.
- `library/agents/dream/PACKAGE.md` — the nightly consolidation agent (~02:00): merge
  duplicates, supersede rather than delete, promote inbox proposals, rewrite INDEX,
  credential grep, then report per HIRING.
- `AGENTS.md` — session-start memory sync alongside the roster/shift-log scan.
- `update/manifest.json` — the four new template-owned paths on the refresh list;
  `memory/` content (everything but README.md) in `never_touch`.

## Gate

A fresh install has working folder-backend memory with zero setup; "update my harness"
on a memory-bearing harness refreshes scaffold only and never touches content; a
radio-off run leaves memory fully working. Pilot (outside this repo): Daily Practice's
own harnesses on one private repo, then a corporate cohort; the readout answers the
backend question.
