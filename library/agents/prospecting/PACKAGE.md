# Prospecting

Fill the top of your pipeline with prospects who actually match your ideal customer —
about twenty at a time, each with a one-line "why them" you'd stand behind — and stage
the first drafts. Lists and drafts only; nothing is ever sent by itself.

| Field | Value |
|---|---|
| **Name** | Prospecting |
| **Kind** | agent |
| **Version** | 0.9.0 — moves to 1.0.0 after its first client install passes live (see changelog) |
| **Requires** | A completed knowledge base — especially your ICP (`agent/knowledge-base/02-icp-and-vocabulary.md`); your CRM ({{CRM_NAME}}); optionally the [Prospect Research → Outreach workflow](../../workflows/prospect-research-outreach/PACKAGE.md) for the automated drafting lane. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Prospecting agent from my Orion folder.

1. Read library/agents/prospecting/PACKAGE.md — it is the whole recipe, including
   what this package honestly does NOT do. (If you can't read files, ask me to
   paste it.)
2. Confirm my ICP from my knowledge base (§2) in one short readback — sharpen it
   with me if it's vague, one question at a time. Ask me which sources I already
   have for finding companies like that (my CRM's dormant leads, lists I own,
   directories and registries I already use, my own network) — you work from MY
   sources, and say so if a source would need to be bought.
3. Build my first batch: ~20 companies/people matching the ICP, each with a
   one-line "why them" tied to something checkable (size, trigger event, sector,
   vocabulary match) — never a guessed fact stated as truth.
4. For the ones I pick, stage first-touch drafts (via the wf-01 workflow if it's
   installed, otherwise as drafts in our chat for me to copy). Send nothing.
5. Count only evidence: a prospect isn't "contacted" until a real touch is logged
   in my CRM, and isn't "interested" until a two-way exchange happened. Feed
   these numbers to my Friday Report if that package is installed.
6. Run the smoke test at the bottom of the package page, and only when it
   passes, record the install in status/status.json under packages.prospecting
   (kind "agent", version "0.9.0", smoke_test_passed true).
7. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug prospecting --kind agent --version 0.9.0
```

## What it does

- **ICP-first candidate research** from sources you already have — your CRM's dormant
  and never-worked records, lists you own, public directories and registries for your
  market, your own network. Each candidate gets a **"why them"** line tied to evidence,
  and anything that merely *might* match is said that way.
- **Disqualification with a reason** — a company that doesn't fit your ICP is marked
  so, with the reason written down, so nobody researches it twice. Saying no to a bad
  fit is output, not failure.
- **Evidence-first counting** — the vocabulary this agent keeps (and your Friday Report
  reads): a *touch* is a logged outbound contact; a *live conversation* is two-way; a
  *meeting* is on the calendar. Nothing is counted from memory or optimism.
- **Drafts, staged** — first-touch messages in your voice (from your tone and objection
  files), through the approval-gated workflow or plain chat drafts. The act of sending
  remains yours.

## What it doesn't do — read this part

At the operation this package was extracted from, the raw *volume* — hundreds of
fresh contacts with verified phone numbers and emails — was bought: external data
services and a contracted outbound calling team supplied it. **That supply engine is
not in this box, and this package won't pretend otherwise.** What's in this box is the
part that made the volume worth anything: the ICP discipline, the "why them" standard,
the honest counting, and the drafting. If you want bought volume on top, that's a
vendor decision to make deliberately — your agent can help you evaluate one, and the
[Revenue Operating Cadence](../../programs/revenue-operating-cadence/PACKAGE.md)
program is where a channel like that gets managed and measured.

Also: it never scrapes where scraping is prohibited, never invents contact details,
and never sends anything.

## Training it onto your business

The sharper your ICP file, the better the batch — expect your AI to push back once if
your ICP says "anyone who pays." Your corrections to the first batch's "why them"
lines are the training; keep them.

## Smoke test — prove it works

With your knowledge base complete, ask your AI: **"Build my first prospecting batch."**

**You'll know it worked when**: you're looking at ~20 real candidates from your own
market, each with a one-line "why them" you could say out loud to that prospect, at
least a couple honestly disqualified with reasons — and drafts exist only for the ones
you picked, sent nowhere. Then flip `packages.prospecting.smoke_test_passed` to `true`.

## Safety rails

Outreach drafts follow your tone file and the kit's standing line: nothing
reputationally damaging gets drafted, full stop — your agent refuses in one sentence
and offers the closest honest message instead (the same boundary
`validation/validation-tasks.md` VT-05 tests).

## Changelog

- 0.9.0 — 2026-07-25 — Methodology extracted from a live prospecting operation
  (ICP-first research, "why them" standard, disqualify-with-reason,
  evidence-first counting) and merged with this kit's existing research-and-draft
  workflow. Versioned 0.9.0, not 1.0.0: the source operation's paid supply engine is
  deliberately excluded, so the packaged assembly is new — it earns 1.0.0 when the
  first client install passes its smoke test on live data.
