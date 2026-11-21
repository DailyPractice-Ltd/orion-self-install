---
name: prospect-call-list
description: Review HubSpot prospect coverage and build a sourced calling list for Henri. Use for prospect research and list replenishment; route daily task intake to Task Planner and completed calls to Call Planner Control Tower.
---

## Local authority and setup

This is Daily Practice's Marty configuration for Henri, adapted to HubSpot on
2026-10-11. Read [the shared HubSpot model](../lifecycle-governance/references/hubspot-model.md) before CRM work; refresh
permissions and relevant property options live. It distinguishes CONTACT, COMPANY,
DEAL, TASK and CALL and defines this portal's verified mappings.

Stage exact external changes for Henri's explicit approval in the current session,
including CRM associations, sheet updates, draft creation, sends, calendar actions
and paid Apollo requests. Reuse approval for those exact actions; do not infer it
from a spreadsheet checkbox, outcome text, another job or a prior batch. These
skills create no schedule. Read-only research and local drafts may proceed.

# Prospect Call List

1. **Review the requested scope.** Read [CRM review](references/crm-review.md).
   Separate company coverage from contact lifecycle and owner; never count contacts
   as companies or apply a company's stage to all of its people.
2. **Resolve the brief.** Read [target brief](references/target-brief.md). Reuse
   Henri's known ICP: founder-sellers and sales-team leaders in France, all sectors,
   unless the current brief specifies another geography or cohort. No default
   blue-collar, finance/payroll-role, employee-band or recurring-revenue requirement.
   Clarify only missing quantity, scope or delivery choices that affect selection.
3. **Research and verify.** Follow [run guide](references/run-guide.md). Resolve
   existing HubSpot contacts and companies before proposing creates. Keep sourced
   candidates, verified callable people and delivered rows as separate counts.
4. **Stage exact writes.** Show record IDs, existing values, proposed fields,
   associations and destination cells before approval. Research approval alone does
   not permit CRM creation, enrichment spending or queue publication.
5. **Verify delivery.** Read back approved changes and compare against the scoped
   target. Report shortfalls and partial source coverage. Do not change lifecycle
   merely because a phone number or decision-maker was found.

Use [Apollo Phone Enrichment](../apollo-enrich-phone/SKILL.md) only when paid
phone enrichment is requested and approved. Use the existing calling sheet when
verified; otherwise deliver the proposed list in conversation, not a new live queue.
