---
name: report-bug
description: Report Orion bugs in Trello with mandatory duplicate checks and K numbering; add a GitHub report when requested. Use for filing or updating bug reports, not implementing fixes.
---

# Report a bug

Use [the destination and report guide](references/report-guide.md) for Henri's defaults, report fields, and the optional GitHub step. Follow a destination explicitly given in the current request.

1. **Read before filing.** Verify actual Trello access, resolve the Bugs list, and paginate every card in that list, including archived cards. Keep duplicate review within Bugs; inspect full descriptions, relevant comments and linked reports for plausible matches. An installed plugin is not proof its tools are callable; if access is unavailable, prepare a local draft and identify the access gap. Do not certify a duplicate check from a sample.
2. **Check duplicates by meaning.** Compare the trigger, component, observed versus expected behaviour, failure mechanism, and proposed acceptance condition. A shared error message is insufficient. Classify the closest matches as **duplicate**, **related but distinct**, or **uncertain**, with a short reason. For a duplicate, reuse its K number and card; add useful new evidence only within the user's reporting authorization. Preserve existing content. If uncertainty changes whether a new issue is needed, ask one focused question. Honour an explicit user decision to track a distinct issue separately and cross-link the related card.
3. **Choose a number only for a new bug.** Read all cards in the Bugs list, including archived cards and following pagination, to find the highest existing `K<number>` title. Use the next integer, not a gap or Trello's card number. Recheck the Bugs list for a collision immediately before creating; use the next free number if concurrent work took it. Do not scan other board lists for duplicates or numbering. Incomplete access means numbering remains unverified.
4. **Publish within scope.** A request to publish this bug authorizes its routine card creation or update; reuse that authorization. A draft request does not. Create the card in Bugs using the report guide and the existing Bug label. Create the repository report only when requested. Do not add assignees, deadlines, schedules or unrelated notifications by inference.
5. **Verify and finish.** Read back the card's number, list, description, label and URL; verify any repository artifact too. After an error or interruption, reconcile possible partial success before retrying. Report the created or reused card, duplicate-check rationale, and any unfinished destination honestly. Never create a test card or a duplicate merely to validate access.

Use observed evidence; separate hypotheses and workarounds from verified fixes. Exclude credentials, private customer data and unrelated session details. This skill has no schedule or independent radio report; the calling task follows the current harness's completion procedure once.
