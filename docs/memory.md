# Memory — what your harness remembers, and everything that promise means

Your harness keeps a notebook. Every agent on your team reads it before work and
writes to it after work, so what one of them learns on Monday, all of them know on
Tuesday — across sessions, and (on the shared setup) across every machine and every
person at your company running a harness.

**If any other file in this folder describes memory differently, this file wins.**

## Where it lives — a clear answer

Memory is the `memory/` folder: plain markdown files, on your machine, yours. Two
setups, chosen in `status/status.json` under `memory.backend`:

- **`folder`** (the default — zero setup): `memory/` is just a folder in your harness.
  It works from the first minute. You can open it in Obsidian (any folder is a vault)
  and, if you want it on two of your machines, sync it with anything you already use —
  iCloud, Drive, Obsidian Sync. Your tool, your account, your data.
- **`git`** (the shared-team setup): `memory/` is a clone of a **private repository
  your company owns**, in your own GitHub organisation. Every harness install at your
  company — any person, any machine — clones the same repo, and the agents quietly
  pull before work and push after. Nobody at your company has to know or touch git;
  that is the agents' job.

**Daily Practice does not host your memory, and will not.** The content never rides
the radio (the radio carries labels, counts, and times — never content; `docs/radio.md`).
Which of the two setups is the long-term right answer is an honest open question the
current pilots exist to settle; both use the same folder shape, so switching later
loses nothing.

## The shape — small files, one fact per file

```
memory/
  README.md          what this folder is (this file's short twin)
  INDEX.md           the map — what this team knows; the dream agent maintains it
  shared/            team-wide truths, one small file per fact
    inbox.md         append-only proposals: any agent may suggest a shared truth here
  roles/<area>/      memory by role area — sales/, ops/, recruitment/, ...
  agents/<name>/     each agent's own corner:
    log.md             its shift summaries (the report step writes here)
    learning.md        curated lessons — ID, source, rule, status: active | candidate | superseded
```

## Who reads what — scopes are about relevance, not permission

Each hired agent's job sheet names its reading list in the `memory:` frontmatter —
typically `shared/`, its own role area, and its own `agents/<name>/` corner. That is
why a talent scout doesn't wade through the sales ICP: not forbidden, just not its
reading. **Writing is free for everyone**: your own corner directly, team-wide truths
proposed via `shared/inbox.md`. Noise is not a problem, because of what happens at
night.

## The dream — nightly consolidation

A hired agent called the dream runs while you sleep (the package at
`library/agents/dream/PACKAGE.md`). It syncs, reads the inbox, the logs, and the new
fact files, then tidies: merges duplicates, replaces contradicted facts with the
latest truth (marking the old one superseded, never deleting history), folds accepted
inbox proposals into `shared/`, prunes noise, rewrites `INDEX.md`, and checks that
nothing credential-shaped slipped in. It reports like any other shift: one shift-log
line, one `routine_completed` ping with a count. You wake up to a cleaner notebook.

## The habits (already installed — you set up nothing)

- **Before work**: sync, read `INDEX.md` and the job's scopes.
- **After work**: one summary line to the agent's own log, any durable new fact as one
  small file, shared truths proposed to the inbox — then sync.
- **The report step**: the same one-line shift summary is written into memory before
  it is radioed. Local first, always; radio second, only when on.
- Memory never blocks work: missing, misconfigured, or unsyncable memory means one
  plain line and the work carries on. Memory is also completely independent of the
  radio — check-ins off, memory still on.

## What never goes into memory

- **Credentials, tokens, API keys — never, anywhere.** `memory.mjs` refuses the
  obvious shapes and the dream double-checks nightly. A secret belongs in the tool
  that owns it.
- **Raw personal data stays out of `shared/`.** Prospect and staff specifics live in
  role areas or agent corners where the role that needs them reads them; `shared/` is
  for truths about your business, not people files.

## Updates cannot touch your memories

The scaffold (this doc, `memory/README.md`, `status/memory.mjs`, the dream package)
is Daily Practice's and refreshes with "update my harness". **Everything you and your
agents wrote — `INDEX.md`, `shared/`, `roles/`, `agents/` — is yours and is listed in
the update contract's never-touch list.** An update can improve the notebook's
binding, never read or rewrite its pages.

## The commands (for the agents; you never need these)

```
node status/memory.mjs init    # create the structure, or clone the team repo
node status/memory.mjs sync    # git backend: pull, commit, push — quietly
node status/memory.mjs note --to agents/<name>/log.md --line "..."
node status/memory.mjs file --path roles/sales/<fact>.md --content "..."
node status/memory.mjs check   # one honest line about memory's health
```
