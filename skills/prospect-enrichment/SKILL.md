---
name: prospect-enrichment
description: Route prospect research and contact enrichment to the HubSpot Prospect Call List skill; retain this compatibility name without a separate workflow.
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

# Prospect Enrichment

Read and follow [Prospect Call List](../prospect-call-list/SKILL.md). That skill owns
brief clarification, sourcing, HubSpot identity resolution and calling-list delivery.
Use [Apollo Phone Enrichment](../apollo-enrich-phone/SKILL.md) for approved paid phone
reveals. This alias grants no additional authority and creates no duplicate workflow.
