# Outcome Routing

Use these rules only for separately authorised closeout, after reading the live row, CRM ownership, lifecycle, correspondence and source queue. Check existing completion evidence before every action; reuse completed work rather than repeating it. Intake, maintenance and status-only questions do not execute these routes.

## Connected Or Materially Advanced

- Create one factual Attio note on the most relevant object.
- Complete only the open task satisfied by the call.
- Add or update the dated next task required by the outcome.
- Keep a new call row only when a later call is explicitly needed.
- Preserve the connected outcome and all created IDs in Call History.

## No Answer, Voicemail Or Unavailable

- Do not create an Attio call note.
- Do not describe the attempt as movement.
- Carry a callback only when the person and route remain defensible and the contact-history gate establishes an agreed callback, explicit approved retry or materially new due reason. No answer alone is not a retry schedule.
- If email follow-up is requested, use the existing thread and record the sent message ID.
- Route an unresolved identity or phone to an assigned, dated Attio resolution task owned operationally by Call Planner; never recreate a retired holding tab.

## Referral Or Wrong Decision-Maker

- Log the connected referral or qualification evidence.
- Mark the current person's qualification field accurately when the schema supports it.
- Identify and enrich the referred person before replacing the current contact.
- Ask for an introduction or forward in the existing thread when that is the clearest route.
- Retain a dated follow-up with the current contact until the referral is confirmed.

## Promise To Pay Or Proof Of Payment

- Record the promise date, invoice number, amount and caller evidence.
- Retrieve and verify the invoice and current state from Xero.
- Send collections mail only from the business's dedicated collections sender, never a personal address.
- Ask for proof of payment without recording cash.
- Schedule a conditional follow-up that checks Xero first and calls only if payment remains unconfirmed.
- Never offer or imply a credit, settlement, suspension or invoice change without approval.

## Pipeline Exit

- Explicit release of a record the requesting salesperson owns: add the factual call note, complete relevant open tasks, update to `Closed Lost`, and remove it from the queue.
- Teammate-owned account: add the evidence and hand the decision to the owner; do not change lifecycle without the owner's approved outcome.
- Preserve the disposition and CRM evidence IDs in Call History.

## Enrichment Or Dependency Blocker

- Reuse or create one Attio resolution task with the exact missing fact, accountable owner, source link, next action, deadline and promotion condition. Call Planner executes the research under its current job authority and shared credit ceiling.
- A retired holding tab stays retired; its dated archive is evidence only. Resolve the blocker or retain its owned, dated dependency in Attio. Surface a specific human decision once, and keep its task open until answered. Do not report assignment as enrichment completion.
- Do not invent, borrow or relabel another person's phone number.
- Do not keep a record in Call Queue merely to remember non-call work.
- Promote it only after the identity, role and route are defensible.

## Pipeline And Queue Exclusions

Exclude blocked statuses, DNC, `Closed Lost`, completed opportunities and routine customers from the active queue unless the row is an explicit collections, customer-success reconciliation or manager-play exception.

## History Evidence

Each processed row should retain:

- Processing date and original row identity.
- Outcome text.
- Final disposition.
- CRM note or task IDs when changed.
- Gmail message or Slack reply IDs when sent.
- Invoice/Xero verification evidence for collections.
- Dated next action or a clear exclusion reason.

## Header-Mapped Interface Controls

- Column M is `Action Required?` and is processed first when checked.
- Column N is `Outcome / Instruction` free text and is always safety-scanned, even when Column M is unchecked.
- A checked Column M with blank Column N is held as a blocker with an owner and promotion condition.
- A connected row with blank Column N cannot be cleared or rolled forward silently.
- Only a verified new call for now/today can receive fresh unchecked controls, during authorised closeout and after the previous outcome is preserved and resolved. Actual future calls remain in Attio. Intake, cleanup and content repairs preserve the existing controls and Column N.
