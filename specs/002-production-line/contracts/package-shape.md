# Contract: the package shape (FR-005)

Every Library entry is one directory — `library/<kind>/<slug>/` — whose front door is a
`PACKAGE.md` following this exact shape. A package page that deviates from it is a
defect, not a variation. `<kind>` is one of `agents`, `skills`, `workflows`, `programs`;
`<slug>` is lowercase-kebab and stable forever (it keys `status.json`'s `packages` map
and the Daily Practice shelf).

## Required structure of `PACKAGE.md`, in order

1. **Title + meaning line** — `# <Name>` followed by one plain sentence saying what this
   is for a reader who has never heard of it (Article I: what it means before how it
   works).

2. **The fact block** — a short table, immediately after the meaning line:

   | Field | Rule |
   |---|---|
   | `Name` | Human name |
   | `Kind` | `agent` / `skill` / `workflow` / `program` |
   | `Version` | semver; starts `1.0.0` when the underlying behaviour is battle-tested (extracted from a live harness), `0.x` otherwise |
   | `Requires` | plain-words prerequisites (e.g. "a completed knowledge base", "your CRM connected", "another package by slug") — "nothing" is a valid value |

3. **The install prompt** — the **first block after the facts**, in one fenced code
   block, ready to copy-paste into any AI assistant. It must: name the exact files the
   AI should read (or ask the client to paste, on a no-file-access surface); instruct
   the AI to fill every `{{PLACEHOLDER}}` in conversation before showing rendered
   output; instruct it to run the smoke test; and instruct it to record the install in
   `status/status.json`'s `packages` map and — only if the radio is on — report it via
   `node status/radio.mjs report-install`. The prompt must work on both code-capable and
   paste-only surfaces (FR-010).

4. **What it does / What it doesn't do** — honest scope, including anything the source
   harness achieved with paid external services that this package does not include.

5. **Training it onto your business** — which placeholders get filled and what the AI
   will ask; one question at a time discipline applies.

6. **Smoke test — "prove it works"** — one task on the **client's own live data**
   (Article VIII), with an explicit **"You'll know it worked when…"** line, and the
   instruction to flip `packages.<slug>.smoke_test_passed` to `true` only on a real
   pass.

7. **Safety rails** — for any package that can produce buyer-facing content: the
   refusal behaviour (Article III) restated in one sentence, and the reminder that
   nothing sends without an explicit yes (drafts only).

8. **Changelog** — `## Changelog` with one line per version, newest first:
   `- <version> — <date> — <one plain sentence>`.

## Scrub rule (FR-006 / SC-004)

No package file may contain any source-harness identifier — company names, people's
names, leads, prices, phone numbers, CRM URLs, sender addresses. The defined check is
[../scrub-check.md](../scrub-check.md); it must pass before a package enters the repo.

## Placeholder rule (Article VI)

Every `{{PLACEHOLDER}}` a package introduces is agent-filled during the install
conversation unless its adjacent note says otherwise, and is registered in
[../data-model.md](../data-model.md)'s inventory table.
