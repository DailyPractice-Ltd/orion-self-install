# The Library — capabilities you can add to your harness

A **package** is one capability, boxed so your own AI assistant can install it for you:
you open the package's page, copy the block at the top, paste it to your AI, and it does
the rest — asks you a few questions to fit the thing to your business, proves it works
on your real data, and writes it into your bookmark file. No package is ever "installed"
because files exist; it's installed when its own **"you'll know it worked when…"** test
passes on your data.

Three kinds live here:

| Kind | What Orion does with it |
|---|---|
| Skills | Follows a reusable procedure |
| Workflows | Runs a multi-step way of handling a task |
| Programs | Follows a daily, weekly, or monthly operating rhythm |

## On the shelf today

**Skills**
- [Prospecting](../skills/prospecting/SKILL.md) — qualify prospects and draft first touches.
- [Call Planner](../skills/call-planner/SKILL.md) — rank today's calls and prepare angles.
- [Friday Report](../skills/friday-report/SKILL.md) — draft an evidence-backed weekly scorecard.
- [Memory Consolidation](../skills/memory-consolidation/SKILL.md) — consolidate the notebook and refresh its index.
- [Meeting Sizing](skills/meeting-sizing/PACKAGE.md) — give every meeting an outcome, a decision-maker, and a duration.

The installer puts Prospecting, Call Planner, Friday Report, and Memory Consolidation in the selected tool's skills directory.
Ask Orion for the capability by name. Use `teach Orion` to add a private procedure.

**Workflows**
- [Prospect Research → Outreach](workflows/prospect-research-outreach/PACKAGE.md) — the
  form-triggered research-and-draft chain from the core install.
- [Post-Call Debrief](workflows/post-call-debrief/PACKAGE.md) — call notes in, summary +
  CRM update + follow-up draft out. The CRM update is written and reported; the follow-up
  waits for your yes.

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
