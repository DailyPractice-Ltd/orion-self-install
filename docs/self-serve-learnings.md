# Self-Serve Learnings

This repository's own learnings channel — parallel to, not merged with,
`dailypractice-mono`'s `docs/gtm/implementation-learnings.md`, which tracks the coach-led
kit this repository was adapted from. A pattern that clearly applies to both gets written
in both places, cross-referenced; most learnings here will be specific to the no-coach,
resumable, non-technical context that only this repository has to solve for.

Each real self-serve install (once one has happened) gets an entry here: what worked, what
a client got stuck on, which adapter needed a correction, which knowledge-base prompt
produced generic instead of specific answers. This is the input side of this repository's
own versioning discipline (`CHANGELOG.md`) — a learnings entry is what turns into a version
bump, the same relationship the coach-led kit has with its own learnings volumes.

---

## Vol. 0 — the founder's own walkthrough, 2026-07-26 (pre-client)

Not a client install (Vol. 1 still opens with the first real one), but the first time a
human walked the published journey end to end — the founder, deliberately playing a
never-met-us reader on the live GitHub page. Four defects found, all fixed the same day
(CHANGELOG 0.3.0):

1. **"Create a Claude Project" stopped the walkthrough cold.** The reader's actual
   reaction: *"What is a Claude project? Why Claude? What if I'm working on Codex?"* —
   the README's Step 2 led with one vendor's mechanism instead of the move itself.
   Fix: the step is now agent-agnostic — "open the folder with your AI if it can open
   folders; hand it AGENTS.md if it can't" — with per-tool details demoted to examples.
   The lesson generalises: **name the move, not the vendor** (constitution Article IX
   applies to prose, not just adapter files).
2. **The journey had no "give it a home" step.** The unzipped folder stayed in
   Downloads — the one place things get buried and deleted — and nothing said
   otherwise. Fix: new Step 2 (move to `Github → Projects`, or wherever the client
   keeps their work), which also gives every later instruction a stable path to point
   at.
3. **"Open a terminal in this folder" assumed the right-click trick.** The founder's
   own method is more universal and easier to say: open Terminal from search, type
   `cd `, **drag the folder onto the window**, Enter. Fix: that's now the documented
   method everywhere (README Step 3, wizard handoffs).
4. **Codex wasn't a first-class citizen.** The wizard didn't detect it and the README
   never named it. Fix: `codex` added to the surface vocabulary (contract first), the
   wizard's detection and handoff, and the README's tool lists.

Also captured: the real screenshots for the whole journey (docs/img/01–07, redacted
per the SHOTLIST rule before entering the public repo).

## Vol. 1 — (pending)

No self-serve *client* install has happened yet through this repository. This volume
opens the moment the first one does — mirroring exactly how the coach-led kit's own
Vol. 1 was mined from its first two real installs, not written speculatively in
advance.

## Anticipated risk, flagged before any install (not yet confirmed against a real one)

**n8n is the least "non-technical" part of this journey, even after the onboarding
rewrite.** Every client, regardless of which chat surface they use for the daily
conversation, still has to personally use n8n's own workflow editor: import two JSON
files, open individual nodes, and pick or create credentials per node. This is a genuine
property of the tool chosen (n8n), not something the wording in `connectors/` or `n8n/`
can fully soften away — it's been made as clear and well-scaffolded as documentation can
make it (a plain-language framing of what's happening, concrete "you'll know it worked
when" signals, no fabricated non-technical alternative), but it remains the one stretch of
the install where a client with zero tolerance for anything resembling "software settings"
is most likely to want to hand the keyboard to someone else, or lean hard on a
code-capable AI adapter to do it for them. Worth watching for in the first few real
installs — if this is where people actually get stuck, the fix is probably architectural
(a different automation layer, or a much thinner n8n-config generator), not more wording.

## Explicitly out of scope for this channel

- The IG/LinkedIn content-template layer and the Skool support system aren't built yet
  (constitution Article X) — learnings about them belong to their own future specs, not
  here.
- Anything about a specific client's business (their actual ICP, tone, or objections)
  belongs in *their* copy of this repository, not in a shared learnings doc — this channel
  is for patterns about the *install process*, never about any one client's content.
