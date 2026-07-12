# The real test — a protocol, not a suggestion

Everything else in this repository has now been read, audited, and fixed by an AI, three
times over, with increasing rigor each time — and each pass found genuine, previously
undetected gaps (a fabricated verification step, an undisclosed billing requirement, a
resumability path that silently broke for one class of user, three verified-wrong UI
instructions). That pattern is itself the reason this file exists: **there is no version
of "review it more carefully" that closes the actual gap.** The only thing that proves a
non-technical person can do this cold is a non-technical person doing it cold. This is
that protocol, so when it happens, it happens once, rigorously, and produces real answers
instead of a vague "seemed fine."

## Who runs it

**Best**: someone who genuinely fits the description this whole repository was written
for — a salesperson or founder, not technical, who has never seen this repo and has never
talked to you about it. A friend, a past client, someone in your network you trust to be
honest about where they got stuck rather than being polite about it. They should not be
warned in advance beyond "can you help me test something for about an hour — just follow
what's on the screen."

**If no one is available yet**: you, but under a specific discipline — see below. This is
a real second-best, not a substitute; log it as such.

## The one rule that makes this actually work

**Don't explain anything they haven't been shown yet.** The entire thing being tested is
whether the *written material* is sufficient on its own. The moment you (or anyone
watching) fills in a gap verbally that the repo should have filled in, the test stops
measuring what it's supposed to measure. If you catch yourself about to explain something,
stop, write down what you were about to say instead, and let them stay stuck for a beat
longer — that stuck moment is the actual data point.

**If you're running this yourself** (the "no one else available" case): the discipline is
the same, aimed inward. Do only what the text in front of you says, in the order it's
presented. Any time you think "I'll just do X because I already know how" — stop, and
write that down as a gap instead of silently routing around it. This will feel unnatural,
because you already know what this repository is for. That's exactly why it's a weaker
test than a genuine stranger, and why it should still happen even so — it will still
catch more than another read-through will.

## Setup

1. Give them **only** a way to get the files — the GitHub link once it exists, or the ZIP
   directly if it doesn't yet. Nothing else. No verbal preamble about what Orion is.
2. Have them share their screen, or sit where you can see it, or record it — whatever lets
   you observe without narrating.
3. Have a blank document open — this is where every friction point gets written down, in
   real time, not from memory afterward.

## What to write down, every single time it happens

- Any pause longer than a few seconds where they're clearly rereading something.
- Any moment they say (or you can tell they're thinking) "wait, what does this mean?"
- Any time they open a new browser tab to search for a term or a screen themselves,
  instead of the repo or their AI assistant answering it.
- Any time their AI assistant says something that sounds technical or jargon-heavy without
  immediately explaining it — that's a defect in the agent's behaviour, not just the docs.
- Any point they say, or clearly feel, "I'd just email for help here" — this is the exact
  failure condition this whole repository exists to prevent. Write down precisely what
  screen or instruction they were on.
- Whether the AI ever re-asked something they'd already answered (a resumability failure)
  — especially if they close the laptop and come back partway through, which you should
  deliberately have them do at least once.
- How long each stage actually took, and across how many separate sittings.

## What counts as a pass

- They reach `validated` status (see `validation/validation-tasks.md`) — a real prospect
  researched, a real credential connected, a real staged draft they could point at.
- They did this without you answering a single question about *how to do something* —
  answering a genuine business question (e.g. confirming a real price) doesn't count
  against this; explaining a click sequence does.
- Whatever friction got written down, however small, gets logged as a real entry in
  `docs/self-serve-learnings.md` Vol. 1 — this is what turns a single test into the same
  kind of empirically-grounded revision cycle the coach-led kit's own Vol. 1 was built
  from, rather than a one-off.

## What counts as a fail — and what to do about it

Any moment on the "write down" list above is friction, but not necessarily a fail on its
own. A fail is: they give up, they can't recover from an error without your direct
intervention, or they reach a wrong/broken state (e.g. a "validated" status that isn't
actually validated — the exact failure `docs/gtm/client-formalisation.md` already flagged
happening once in the coach-led version). Any fail gets logged with enough detail to
reproduce it, then fixed at the root — in the file that caused it, not patched over in
conversation.

## After the run

Bring the friction log back to whoever's maintaining this repository (or hand it to your
AI assistant with instructions to fix each item at its source). This is the version-bump
trigger named in `CHANGELOG.md`'s own discipline — a real dry run's findings are exactly
what turns this from 0.1.0 into a version that's actually been proven, not just carefully
reasoned about.
