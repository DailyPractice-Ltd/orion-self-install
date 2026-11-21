---
name: call-planner
description: Build today's read-only call plan from the CRM or a CRM export. Use to rank known contacts, surface overdue callbacks, and prepare call angles and a held-out enrichment list.
---

# Plan today's calls

Confirm the caller, CRM stage names, and timezone from the request or knowledge base. Read current pipeline records, verified callback promises, recent notes, and contact details. Build the plan for today's local date.

1. Rank overdue callbacks first, then by priority (P0 first) and owner. Include the company, person and role, direct number and fallback, owner, stage, last note, callback time, and a specific call angle grounded in the offer and prior conversation.
2. Put candidates with an unresolved stage, role, phone route, or angle in Needs Enrichment with the reason and a safe next step. Keep previous attempts in history. Count dials, connects, connect rate, and callbacks due from the records.
3. Deliver the day sheet. The task's scope is read-only across CRM, email, calendar, and calling tools. For completed-call outcomes or live queue reconciliation, use the separate Call Planner Control Tower workflow when available.

For Markdown and CSV output, populate [call-data.template.json](assets/call-data.template.json) (a package resource: read it from this skill's folder) with the current CRM evidence, and save the result as `call-data.json` at the root of the active Orion folder. Run [the generator](scripts/build-call-plan.mjs) from the root of the active Orion folder, or name that folder with `--root`; it never works out the folder from its own location, and it writes the day sheet and CSVs inside that folder only. `--help` lists its arguments. Pass the business timezone and use ISO timestamps with offsets for callbacks. Where scripts are unavailable, produce the day sheet directly using the same fields and order.

Verify the first run against the real pipeline. Check today's date, overdue order, evidence behind each angle, and reasons for held-out contacts.
