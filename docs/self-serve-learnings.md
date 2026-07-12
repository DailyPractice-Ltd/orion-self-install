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

## Vol. 1 — (pending)

No self-serve install has happened yet through this repository. This volume opens the
moment the first one does — mirroring exactly how the coach-led kit's own Vol. 1 was
mined from its first two real installs, not written speculatively in advance.

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
