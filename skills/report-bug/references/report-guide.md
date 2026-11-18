# Destinations and report guide

## Henri's defaults

- Board: [Orion Build](https://trello.com/b/7mS1drXZ/orion-build).
- List: `Bugs`; resolve its current ID from a fresh board read.
- Existing label: `Bug`; reuse its current ID.
- Card language: follow the board's existing English report style unless Henri asks otherwise.
- Optional repository: `DailyPractice-Ltd/dailypractice-mono`.
- Optional file: `docs/known-issue-k<number>.md`, using the Trello K number. `K18` maps to `docs/known-issue-k18.md`.

These defaults scope the search; do not inspect unrelated businesses or harness folders. A user's explicit destination overrides them. A new destination needs its own duplicate and numbering check.

## Duplicate decisions

Read full likely matches and relevant discussion before deciding. Search keywords and titles narrow candidates but do not prove equivalence. A resolved card with the same mechanism can be a regression rather than a new issue; check its resolution and current state. Reuse or reopen it only within the requested action and supported capabilities.

Keep a compact comparison in the report or local audit: existing card URL, duplicate/related/uncertain, and the factual reason. If there is no match, state the coverage examined rather than claiming no duplicate exists anywhere.

Real example from 15 October 2026:

- [K15](https://trello.com/c/09x3yVJf): saved Codex network configuration is ineffective under the task permission profile.
- [K18](https://trello.com/c/TXPAWU21): after an approved radio check succeeds, the agent invokes completion reporting through the blocked execution path and requires seller intervention.
- These were explicitly separated by Henri. A repeat of K18 should reuse K18, not generate K19. Both can show `ENOTFOUND`; that shared symptom alone does not decide duplication. Future numbering must be read live, never inferred from this example.

## Card content

Title: `K<number>: <specific observable failure>`.

Include only supported details:

- Context and date; affected surface/component/version when known.
- Expected and actual behaviour, minimal reproduction, and exact useful output.
- User impact; distinguish verified facts from a suspected cause.
- Workaround and its limits; keep the issue open until the actual fix is verified.
- Closest related or duplicate issues and the reason for this filing decision.
- Suggested next action or acceptance condition.
- A real repository report/PR link when it exists; identify pending documentation as pending.

Avoid copying the conversation, tokens, local status files, or customer records into a report. A DNS error alone does not prove an outage or a sandbox block. Prefer the paired diagnostic evidence when available.

## GitHub report, when requested

Read the target repository's instructions and existing known-issue conventions. Check for an existing report and relevant open PRs. Verify the active connection's actual read/write access; successful reads do not prove writes are allowed. A verified existing GitHub CLI connection can be used if the connector cannot access the expressly requested repository; do not search other harness folders for credentials.

Use the same K number, comparison and evidence in the card and document. Preserve existing issue text; add an index link when the repository has a known-issues index and it fits the request. Use a `codex/` branch and a reviewable documentation PR unless the user or repository specifies another route. Do not merge unless authorized. Attach a created PR to the current task when the app provides that capability.

If write access is missing, keep the complete report locally and give the precise blocked step. Do not claim a local draft is published or link to a file that does not exist remotely. Continue the independently authorized Trello work. Creating this skill does not itself authorize filing new cards, changing connections, or publishing repository content.

## Retry and completion

A timeout, cancellation or missing tool result can mean delivery is uncertain. Look for the intended card/report before another create. Preserve the original successful receipt; do not duplicate work or inflate completion counts.

When operating inside Marty, follow its current completion rules. Network approval for one read-only check does not enable a later reporting command: use the required approved network execution for that actual command. Do not generate radio events solely to test this skill.
