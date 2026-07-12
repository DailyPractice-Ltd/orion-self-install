# Knowledge Base — structure & capture guide

**If you're the installing agent**: this is how you build the client's knowledge base —
directly, in conversation, with no one relaying questions for you. Seven sections, one
file each, numbered so every install has the same shape.

**The cardinal rule: capture it in the client's own vocabulary, live, as they answer you.**
You're writing while they talk (or type) — don't paraphrase into generic sales language.
If a section reads like a marketing template instead of the client's actual voice,
ask again until it doesn't.

One term below you may need to explain rather than just use: **ICP**, short for "ideal
customer profile" — just means the type of customer they're actually trying to reach. If
the client isn't from a sales background (a lot of founders aren't), say the full phrase
once rather than assuming the abbreviation is familiar.

| File | Section | Captures |
|---|---|---|
| `01-business-context.md` | Business context | What the business is, stage, model, channels |
| `02-icp-and-vocabulary.md` | ICP & vocabulary | Who they sell to, in their words + a glossary of their terms |
| `03-offer-and-value-prop.md` | Offer & value prop | What they sell, pricing, the transformation promised |
| `04-methodology-and-motion.md` | Methodology & motion | How a sale actually happens, stage by stage, + follow-up cadence |
| `05-tone-and-voice.md` | Tone & voice | How they sound — with 2–3 real writing samples pasted in |
| `06-objection-library.md` | Objection library | Objection → their best real response, verbatim where possible |
| `07-commitments.md` | Commitments | The quantified "comfort +5%" monthly numbers, agreed explicitly |

## How to run this conversation

1. **One section at a time, one question at a time.** Don't dump all seven files' worth of
   questions on the client in one message — that's a form, not a conversation. Ask, listen,
   write, move on.
2. **Their words verbatim.** Quote them. Don't professionalise, don't translate into
   sales-speak. The glossary in §2 is what makes the agent sound native to their world.
3. **Real samples beat descriptions.** For §5, ask them to paste 2–3 actual messages or
   posts they've written. For §6, ask for real objections they've actually handled well.
4. **Commitments are numbers, not intentions.** §7 entries look like
   `100 IG DMs / month`, never "do more outreach." Ask for the activity, the number, the
   period, and where they'll track it — and agree the number out loud before writing it
   down; it drives pacing later.
5. **Short is fine.** A thin, true section beats a padded one. If you don't have enough to
   go on, ask — don't invent detail to fill space (this is also a constitutional rule, not
   just good practice — see Article I / Article III in `.specify/memory/constitution.md`).
6. **Update `status/status.json`** after each file is complete — set the matching
   `checklist` key (`kb_business_context`, `kb_icp_vocabulary`, etc.) so a resumed session
   knows exactly where to pick back up.
7. **This can take more than one sitting.** If the client wants to stop after two sections,
   that's fine — the whole point of `status/status.json` is that you'll know exactly where
   you left off next time, even if "next time" is a different AI assistant entirely.

Each template file below contains the capture prompts (the questions to ask) as HTML
comments — use them as your own conversation starters, and delete them once the section's
real content replaces them.
