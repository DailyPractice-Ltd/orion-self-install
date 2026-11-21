---
name: task-planner
description: Prepare Henri's daily call priorities from HubSpot tasks and verified engagement. Use for planning and due call intake, not sending outreach, completing tasks or executing call outcomes.
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

# Task Planner

1. Read current HubSpot permissions and the shared model. Scope to Henri's owner ID
   `37951461` unless explicitly asked about another owner. Fetch the complete scoped
   TASK inventory with status, type, due timestamp, subject/body and associations.
   Follow pagination; report a sample as a sample.
2. Identify genuine call actions from both `hs_task_type` and full task meaning.
   A TODO about sending an email, adding a phone or finding a replacement is admin
   or research, not a ready call. `COMPLETED` is excluded; `WAITING` and `DEFERRED`
   require resolving their actual conditions. An overdue date never overrides a hold.
3. Resolve associated CONTACT and COMPANY identities separately; read current
   lifecycle, owner, route, notes, calls, meetings and relevant communication.
   Apply [contact history](../call-planner-control-tower/references/contact-history-and-reentry.md).
   A task's association is not proof of an accepted meeting or connected call.
4. Apply [ranking](references/call-ranking.md). Keep actual callbacks ahead of
   inferred urgency. The objective is a later 20-minute Google Meet demo; preserve
   a more specific evidenced next step. Henri calls; Marty prepares.
5. Stage additions or narrow updates to the verified existing queue. Preserve
   outcomes, checkboxes, links and callbacks. Without a verified sheet, show the
   proposed priorities in conversation. Planning does not create/complete/reschedule
   CRM tasks, execute outcomes, spend credits or send messages.

When relevant and accessible, read [webinar intake](references/webinar-follow-up.md)
and [Slack intake](references/slack-opportunity-intake.md). These are conditional
sources, not required installations. Missing Slack or webinar access must not block
ordinary HubSpot task planning; state the resulting coverage limit.

For new research use [Prospect Call List](../prospect-call-list/SKILL.md); for actual
call outcomes use [Call Planner Control Tower](../call-planner-control-tower/SKILL.md).
