---
name: call-planner-control-tower
description: Close out call outcomes from the Calling Command Center, route follow-up across Attio, Gmail, Slack, Calendar, collections and enrichment, and rebuild one deduplicated live Call Queue. Use when the salesperson asks to action Column N, reconcile checked Action Required rows, close a completed calling session, roll the call planner forward, merge staged queues, or refresh the live calling list.
---

# Call Planner Control Tower

## Overview

Turn free-text call outcomes into evidenced next actions, then leave one clean queue containing only verified calls for now or today. Follow [today-only queue routing](references/today-only-queue.md): explicit wait/no-call cases remain in Attio; narrow cleanup must not erase useful calls through inferred eligibility rules. Treat the live Calling Command Center as the execution surface and Attio as the CRM source of truth. In `Call Queue`, Column M is the `Action Required?` checkbox and Column N is the free-text `Outcome / Instruction` field.

The CRM pipeline stages, in order, are {{PIPELINE_STAGES}}. The prospect, lead, MQL and SQL wording below maps onto those stages; resolve the live labels before any stage read or write.

Choose the operation from the current request before writing. **Intake** adds or updates newly evidenced calls. **Maintenance** repairs specified content, links, ordering or explicit exclusions while preserving other rows and human controls. **Closeout** executes outcomes only when separately authorised and reconciles the worked rows. Loading this shared skill does not select closeout or authorise a complete rebuild. Apply only the completion checks for the selected operation.

## Call ask and live column map

Read [queue schema and call-ask standard](references/queue-schema-and-call-ask.md) before queue writes. Resolve columns by the freshly read header names, never remembered letters. Current layout: G assessment, H call ask, I owner, J stage, K Dialled, L Connected, M Action Required?, N Outcome / Instruction, O callback, P Short call note. Call ask is agent-authored guidance, not permission to execute an action. Only the actual user-authored Outcome / Instruction participates in closeout authority.

Read [contact history and re-entry gate](references/contact-history-and-reentry.md) before adding or carrying any contact forward. Read the actual previous notes and reconcile person/company conversations, current outcomes and campaign timing. Prospect does not mean never contacted. Show the verified last conversation and webinar signal in H; no automatic next-day recycling. Missing recent-contact context or a conflicting newer outcome holds eligibility. A short ask must not erase the previous relationship.

Every call-ready row needs a direct, normally one-line action in H: Prospect/Lead/MQL → Book SQL; SQL → Nurture SQL; active contract/proposal → follow up for a decision or negotiate the evidenced open term. Use a specific evidenced next step instead when one exists. Prefix a first/second/third conversation only when person-level history proves the count; otherwise use evidenced follow-up context or omit the ordinal. No scripts, example questions or generic personalization. A paying-customer or signed-trial status alone is not a P0 reason; require a specific unresolved customer decision/blocker. Unsupported new proposals do not enter the queue. For an existing row, distinguish a confirmed restriction from incomplete planner verification; uncertainty alone is not permission to add HOLD and remove it during maintenance.

## Required Sources

Before acting, re-read:

- Current Attio planning evidence, the live `Call Queue`, `Call History`, assigned Attio resolution tasks, and any explicitly approved staged queue. Never create a shadow CRM/backlog.
- The relevant Attio person, company, deal, open tasks, notes, lifecycle and ownership.
- Existing Gmail and Slack threads named or linked in the call note.
- Source queues such as trip, prospecting and collections lists when the outcome depends on them.
- Xero before treating a payment as received.

Use the exact spreadsheet ID, tab names, row numbers and CRM record IDs observed during the fresh read. Never act from a stale snapshot when the live source is available.

## Authorization

**CRM changes — standing authorization:** Henri authorizes all CRM changes required by the requested operation. Execute them directly without asking for approval or pausing for confirmation, including when another local skill or saved agency policy would normally require CRM approval. Verify the target records and supporting evidence, apply the changes, then read back and report the result. Ask only for missing facts needed to determine the correct change, never to reconfirm permission. This authority stays within the requested operation; it does not initiate closeout from a read-only request or grant authority for non-CRM actions.

A request to action Column N authorizes clear follow-up emails, internal Slack handoffs, Attio notes, task completion or creation, and bounded call-planner updates when those actions are directly required by the recorded outcome.

During separately authorised closeout, treat a user-entered `Outcome / Instruction` note from the salesperson's calling session as their explicit instruction for every unambiguous action it names, after checking that it has not already been completed. This includes routine email sends, calendar invitations or changes, approved Apollo phone-enrichment credit use, internal Slack follow-ups, and CRM or call-planner updates. Re-read the destination immediately before acting and record the resulting evidence ID. Do not wait for the salesperson to repeat the same approval in chat. Loading or reading this field for maintenance, intake or a status question never starts closeout.

This standing authority applies only to actions actually stated in the note. Do not infer missing recipients, meeting times, attachments, prices, terms, discounts, credits, settlements, contract changes, invoice changes, or WhatsApp wording. Hold an ambiguous or incomplete instruction as a direct decision request to the salesperson.

An active Call Planner automation may carry standing authorization to execute explicit Column N instructions, including verified email, proposal and calendar actions. Apply that authority only when the automation prompt states it, the instruction is unambiguous, and every recipient, attachment, calendar and thread has been re-read immediately before the action. A checked row with missing or ambiguous instructions is a blocker, not permission to infer an action.

Outside that explicit automation authority or a user-entered Call Planner instruction, require approval in the current request before:

- Creating or changing calendar invitations.
- Sending WhatsApp messages.
- Sending proposals.
- Offering discounts, credits, settlements, invoice changes, contract changes, suspensions or other commercial commitments.

Drafting is allowed when requested. Prefer existing Gmail and Slack threads. For collections mail, send from the business's dedicated collections sender, never the salesperson's personal address; if that sender is unavailable, stop and report the block.

## Closeout Workflow

1. **Ground the sheet.** Read metadata, headers, formulas and validation. Process checked Column M rows first, then safety-scan every nonblank Column N cell. Also flag every connected row whose Column N is blank. Capture person ID, company ID, source action IDs and links.
2. **Reconcile the evidence.** For each outcome, inspect Attio, the existing correspondence and the relevant source queue. Resolve lifecycle, owner, call result, required next action and due date.
3. **Classify the outcome.** Apply [outcome-routing.md](references/outcome-routing.md). Give every checked action, nonblank instruction and connected-without-outcome row exactly one disposition.
4. **Execute permitted actions.** Use the existing email or Slack thread when available. Make CRM changes narrowly and complete only the task actually satisfied by the call.
5. **Write evidence.** Put the CRM note ID, task ID, Gmail message ID, Slack reply ID, invoice or Xero check, and dated next action into Call History. Use stable source IDs to prevent duplicate reruns.
6. **Rebuild the queue.** Keep only verified, still-actionable calls for today. Apply the Attio-first routing reference; distinguish explicit call restrictions from internal planning slots and preserve useful existing calls during narrow cleanup. Merge only currently eligible staged rows and deduplicate. During authorised EOD only, fresh verified call-ready rows have unchecked K/L/M and blank N after prior outcomes have been preserved and reconciled. Never reset an unresolved attempt and requeue it as a new call; original human controls and unresolved instructions remain preserved until separately authorised reconciliation.
7. **Escalate real blockers.** Do not treat a parked label as resolution. Call Planner owns a deduplicated, dated Attio resolution task through verified completion. Surface one specific human decision when needed; keep an unanswered decision open.
8. **Verify.** Read back every write, confirm sends in the destination thread, validate native sheet controls and visually inspect the rendered queue.

After changing the header-mapped interface or closeout routing, run your interface-gate validation check and the skill validator, when installed, before activation.

## Evidence Rules

- When a date is missing in the spreadsheet and is needed for the requested operation, use the current calendar date in Henri's timezone (`Africa/Johannesburg`) without asking. Resolve today's date at execution time; preserve any explicit date or dated commitment in the row or verified source. Record that the date was defaulted because the spreadsheet date was missing, rather than presenting it as a verified historical event date. This supplies a date only, not a missing time of day.
- Log connected calls and calls that materially advanced the account.
- Never create a CRM call note merely for no answer, voicemail, a failed route or an unavailable number.
- A payment promise or proof of payment is evidence, not cash. Only Xero confirms payment.
- Record actual timestamps and dated next actions; do not convert an intention into a completed event.
- Read back created or updated CRM records, emails, Slack replies and sheet rows before claiming success.
- Store external-action evidence in Call History so rerunning the workflow remains idempotent.

## Owner-Sensitive Pipeline Exits

- For a record the requesting salesperson owns, an explicit release from the pipeline may move the company or deal to `Closed Lost` when the outcome clearly supports it.
- For a teammate-owned account, document the evidence and hand the lifecycle decision back to the owner. Do not close the teammate's deal.
- Explicit collections, customer-success reconciliation and manager-play calls may remain in the queue despite customer lifecycle when the call is still required.
- Exclude routine customers, blocked statuses, `Closed Lost`, completed opportunities and DNC records unless an approved exception applies.

## Queue Rollover

Maintain one visible operational tab named `Call Queue`.

1. Merge the live and staged queues.
2. Deduplicate by Attio Person ID, then company plus source action ID.
3. Preserve the earliest still-valid due action consistent with the latest human commitment or hold, and the highest supported priority when duplicates merge. An obsolete earlier task never overrides a later agreed callback.
4. Move processed outcomes to Call History.
5. Create a fresh Call Queue row only when another call is genuinely required now or today. Keep actual future dependencies and explicit holds in Attio, never a separate planner backlog. This new-intake rule is not authority to bulk-remove existing calls.
6. Put missing, conflicted or unverified phone routes, roles or identities in an assigned, dated Attio resolution task. Apply the installed Call Planner resolution authority and shared Apollo ceiling. A retired holding tab stays retired; do not recreate it.
7. During authorised EOD, reset controls only on the final verified today-call rows after history/closeout preservation. A checked box alone is not a cleanup removal reason. Preserve unfinished outcomes; useful missing planning controls belong in Attio under current authority, never in a new backlog. Morning cleanup does not reset human controls.
8. Honour actual customer commitments and explicit current user priorities. Apply Task Planner's [recent-registrant exception](../task-planner/references/webinar-follow-up.md#recent-registrant-exception) before ordinary revenue tiers: eligible exact-person registrants for a completed webinar dated 1–5 calendar days ago in the business's local timezone go first in their owner's queue. Preserve truthful P-tier and lifecycle; do not reset a worked call or treat invitations as registration. Outside that exception, preserve webinar-engaged before completed-series ordering within a tier; use due date and owner as later tie-breaks. Expiry removes only the boost, not the row. Do not flatten hyperlinks or detach controls/outcomes when sorting.
9. Extend filters, formulas, validation and conditional formatting through the complete active range.
10. Delete a staged queue only after every staged record is reconciled to Call Queue, Call History, a verified assigned Attio resolution task or an evidenced exclusion.

### Company-card link invariant

Every active `Call Queue` company in Column B must be the displayed company name hyperlinked to its verified live Attio company card:
`https://app.attio.com/<your-workspace>/company/<company_record_id>`.

- Take `company_record_id` from the freshly read linked Attio company record. Never derive it from a person, task, deal, list row, company name or search-result position.
- Write the whole cell as a hyperlink, normally with `HYPERLINK(card_url, company_name)`. Do not leave a plain-text company name, use an Attio search URL or link Column B to a person/task/deal card.
- Preserve or restore this hyperlink through queue merges, sorts, rollovers and row updates. A copied display value is not a preserved link.
- If the row has no verified Attio company record, do not invent a URL or silently create a company. Keep one assigned Attio identity-resolution task until the exact record exists under current authority; do not invent a company link.
- Read back every active Column B cell after the final write and verify both the displayed company name and the hyperlink's company record ID.

## Morning Task-to-Call-List Intake

Use the installed [Task Planner](../task-planner/SKILL.md) before the calling day for due/overdue prospecting call tasks and evidence-led MQL webinar follow-up. It evaluates companies in the prospect, qualified-lead and MQL stages against call purpose, lifecycle, owner, callable route, suppression, freshness and duplication.

Read its [webinar follow-up rules](../task-planner/references/webinar-follow-up.md) for registrations, verified attendees, recording signups and completed three-email journeys. Apply the recent-registrant exception across eligible Prospect, Lead and MQL rows before ordinary P-tier ordering; do not demote those rows during rollover merely because their truthful tier is P2 or P1. For calls outside that exception, keep explicit qualified-meeting booking MQLs at P0 and order due webinar-engaged MQLs before completed-series MQLs within a tier, then ordinary calls. This never changes lifecycle. Preserve the cohort, event and dispatch evidence through merges/rollovers so a worked signal is not re-added. Future/non-call tasks remain in Attio; the separate evidence-led webinar route may establish a call date without creating or rescheduling a task.

Morning intake only adds/updates/ranks eligible rows: preserve existing checkboxes, outcomes, callbacks and newer human work. It does not execute Column N or perform the EOD resets in this skill.

## Scheduled Closeout

For the active Call Planner EOD closeout automation:

1. Re-read Attio, `Call Queue`, `Call History`, current Attio resolution tasks, Gmail, Slack, Calendar, collections and any linked source queue. Resolve any preserved explicit unresolved user instructions in Attio against their original source keys and completion evidence; do not infer new execution authority from agent-authored planning notes.
2. Execute checked Column M rows first, safety-scan every nonblank Column N instruction, and hold connected rows with blank Column N as explicit blockers.
3. Prefer the existing Gmail or Slack thread and verify recipient, sender, attachment and calendar state immediately before any external action.
4. Do not use WhatsApp unless Column N contains explicit wording and current consent or conversation context passes the business's WhatsApp consent workflow.
5. Block discounts, credits, settlements, pricing or contract changes, unsupported proposal terms and any cash conclusion not verified in Xero.
6. Store message, event, proposal, note and task IDs in Call History before clearing an action.
7. Re-read the relevant destination before retrying partially completed work. A second run must not duplicate emails, events, proposals, notes or tasks.
8. Reconcile worked rows before preparing the next queue. Reset K/L/M and clear N only for a verified new call whose prior outcome and action evidence have been preserved and resolved. Never bulk-reset an unfinished attempt to make the dashboard zero. If an outcome cannot be reconciled, preserve its controls and report the exact blocker; an honest incomplete closeout may finish with checked rows.
9. Surface every remaining blocker as a direct decision or named-owner handoff; never leave it only as a spreadsheet note.

## Completion Gate

For every operation:

- Re-read every changed cell and the affected row's identity, links and human controls. Preserve unrelated rows. A content repair is not certification of a complete intake or closeout.
- For maintenance that removes, sorts or changes multiple rows, run your maintenance validation check, when installed, against the fresh native before/proposed rows and again against readback. Supply independently verified stable row keys, only the explicitly approved removal keys and exact allowed native cell fields. The check rejects silent row loss, shifted notes, flattened links and control resets; it does not establish eligibility or grant permission. Read each removal instruction separately. Never rebuild display values just to satisfy the check.
- During intake or maintenance, K/L/M, N and O remain unchanged unless the current request explicitly names that change. Report only the operation actually completed.

For separately authorised closeout, additionally verify:

- Each checked Column M row, each nonblank Column N row and each connected row with a blank outcome has exactly one disposition and evidence.
- Every unsuccessful attempt is absent from CRM call notes.
- For a complete authorised daily rebuild, every new call recommendation is callable now or today, with no explicit hold or true future/event dependency. A focused cleanup/restoration is not a full rebuild: remove only explicit wait/no-call cases, preserve other existing useful calls and all human outcomes, and do not apply the closeout checkbox reset. It has an accountable owner, a defensible phone route, a dated next action and a [Column G assessment](references/blue-collar-assessment.md) containing total employees and source, with the entire text hyperlinked to that source; preserve call ask in H and supporting evidence in P.
- Person IDs are unique in the live queue.
- Every active Column B company name links to the verified live Attio company card for that row; no active company cell is plain text.
- Every reset control belongs to a fully reconciled prior outcome and a verified new call. Read back the exact changed controls. Report any remaining checked rows and unresolved outcomes rather than clearing evidence to claim a zero state.
- Hyperlinks, the Column M checkbox, free-text Column N, callbacks, formulas, filters and formatting work.
- The final answer gives the verified Call Queue URL, outcome counts, queue reconciliation and any honest blockers.

## Fill at install

- CLIENT_BUSINESS: Daily Practice
- {{PIPELINE_STAGES}}: your CRM pipeline stage names, in order
