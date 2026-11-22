---
name: lifecycle-governance
description: Review and stage evidence-backed HubSpot contact/company lifecycle and deal-stage corrections. Use for qualification, reopening or loss decisions; keep each object and property separate.
---

## Local authority and setup

This is Daily Practice's Marty configuration for Henri, adapted to HubSpot on
2026-10-11. Read [the shared HubSpot model](references/hubspot-model.md) before CRM work; refresh
permissions and relevant property options live. It distinguishes CONTACT, COMPANY,
DEAL, TASK and CALL and defines this portal's verified mappings.

Stage exact external changes for Henri's explicit approval in the current session,
including CRM associations, sheet updates, draft creation, sends, calendar actions
and paid Apollo requests. Reuse approval for those exact actions; do not infer it
from a spreadsheet checkbox, outcome text, another job or a prior batch. These
skills create no schedule. Read-only research and local drafts may proceed.

# Lifecycle Governance

Read [HubSpot model and live mappings](references/hubspot-model.md) and
[stage evidence policy](references/lifecycle-stage-policy.md).

1. Identify the exact object and property. A CONTACT lifecycle, COMPANY lifecycle,
   contact lead status and DEAL stage are different decisions. Verify current
   values, enum options, owner, associations, history and highest evidenced stage.
2. Read full relevant notes, calls, meetings, correspondence and deal/payment
   evidence. Labels, job titles, numbers, tasks and proposal drafts do not prove
   qualification. If history is unavailable, state that uncertainty; do not invent it.
3. Show the proposed object ID, field, current label/value, new label/value and
   evidence. Preserve owner, associations, unrelated properties and history.
4. Execute only after Henri approves that exact mutation. Read immediately before
   writing; stop on conflicting concurrent changes. Read back after writing.
5. For a backwards lifecycle correction, disclose that HubSpot requires clearing
   `lifecyclestage` and setting the target value. Verify the clear, then the target.
   If the target fails, report the empty/intermediate state and reconcile it; never
   claim completion or repeat writes blindly. Do not change other fields to force it.

## Loss and reopening

`DEAL.dealstage=closedlost` means a lost opportunity. This portal also has a custom
CONTACT/COMPANY lifecycle option `8. Closed/Lost` (`4692220128`); it is not the same
field and is never changed automatically when a deal closes.

For either proposed loss classification require verified prior SQL-or-later evidence
and a human-authored loss outcome. No reply, failed enrichment, cold disqualification
or a cleanup request does not pass. Check other active deals and customer history.
A lost opportunity does not erase the existing customer relationship.

For an incorrectly lost pre-SQL record, stage restoration to the last proven valid
lifecycle; if none is known, explain a proposed Prospect correction for approval.
Reopening follows current evidence and exact object scope. Do not create a note,
task, association, outreach or compensating stage change without approval.
