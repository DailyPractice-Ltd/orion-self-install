# The Library — capabilities you can add to your harness

A **package** is one capability, boxed so your own AI assistant can install it for you:
you open the package's page, copy the block at the top, paste it to your AI, and it does
the rest — asks you a few questions to fit the thing to your business, proves it works
on your real data, and writes it into your bookmark file. No package is ever "installed"
because files exist; it's installed when its own **"you'll know it worked when…"** test
passes on your data.

Four kinds live here, each in its own folder:

| Kind | Plainly | Folder |
|---|---|---|
| **Agents** | A colleague with a job — it runs a whole role for you (always drafts-for-your-approval, never sending on its own) | [`agents/`](agents/) |
| **Skills** | One teachable capability your agent applies everywhere (like how to size a meeting) | [`skills/`](skills/) |
| **Workflows** | An automated chain that runs when you trigger it — form in, drafted work out | [`workflows/`](workflows/) |
| **Programs** | An operating routine — a cadence your agent runs with you daily/weekly | [`programs/`](programs/) |

## On the shelf today

**Agents**
- [Prospecting](agents/prospecting/PACKAGE.md) — fill the top of your pipeline: ~20
  researched candidates with a one-line "why them," drafts staged for you.
- [Call-Planner Control Tower](agents/call-planner/PACKAGE.md) — who to call today, in
  what order, with context and the likely angle.
- [Friday Report](agents/friday-report/PACKAGE.md) — the week's honest scoreboard,
  drafted for your approval.

**Skills**
- [Meeting Sizing](skills/meeting-sizing/PACKAGE.md) — every meeting gets an outcome, a
  decision-maker, and the shortest length that can do the job.

**Workflows**
- [Prospect Research → Outreach](workflows/prospect-research-outreach/PACKAGE.md) — the
  form-triggered research-and-draft chain from the core install.
- [Post-Call Debrief](workflows/post-call-debrief/PACKAGE.md) — call notes in, summary +
  CRM update + follow-up draft out, all gated on your yes.

**Programs**
- [Revenue Operating Cadence](programs/revenue-operating-cadence/PACKAGE.md) — the
  daily/weekly/monthly rhythm that moves revenue from attention to cash.

Where a package came from matters here: **nothing on this shelf was invented for this
repository.** Each one is either extracted from a live operating harness that already
runs a real business's sales motion (scrubbed of every trace of that business), or was
already part of this kit's core install, packaged so you can point at it.

## Honest mechanics

- On GitHub, the "buttons" above are links. Clicking one opens the package's page; the
  first block on it is the text to paste into your AI. That's the whole trick.
- Installing needs nothing technical from you. Your AI reads the recipe, asks you plain
  questions, and runs the proof itself (or walks you through it click by click).
- If you said yes to check-ins ([the radio](../docs/radio.md)), your AI reports the
  install — name, kind, version, nothing else — so Daily Practice knows what to support
  you on. Radio off → nothing is reported, and the package works identically.

*Maintainers: the packaging shape is a contract —
[`specs/002-production-line/contracts/package-shape.md`](../specs/002-production-line/contracts/package-shape.md).
A new package enters this shelf only through it, and only past the scrub check.*
