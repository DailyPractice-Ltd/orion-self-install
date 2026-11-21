---
name: apollo-enrich-phone
description: Reveal and verify Apollo phone results for an approved cohort, then stage exact HubSpot contact/company phone and association changes. Use for phone enrichment; credit use and CRM writes require approval.
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

# Apollo Enrich Phone

Use Apollo's signed-in Chrome interface to request the phone enrichment product explicitly. A successful completion toast is not evidence that Apollo found a mobile; verify the contact information panel after every request.

## Operating boundary

- Use the available computer-use/browser tools and the Chrome browser profile requested by the user; follow their live API documentation. For Daily Practice work, select the Chrome profile designated for Daily Practice; do not fall back to another signed-in profile.
- Confirm the Apollo identity, company, and current job title before consuming credits.
- Treat `Enrich phone` as a paid action. Require either explicit approval for the exact request or an existing user authorization that clearly covers the cohort and credit use.
- Do not create sequences, add contacts to sequences, send email, call, or perform outreach.
- Do not repeat a phone request for a person whose result was already recorded, including a previous `No mobile number` result.
- Show necessary phone values in the exact approval proposal; avoid unrelated disclosure. Transfer results only to approved CRM fields or queue cells.

## Prepare the enrichment queue

Select contacts from the approved cohort, using Henri's founder-seller/sales-leader
ICP or the current explicit brief. Do not default to CFO/payroll roles, MRR ranking
or South Africa. Resolve HubSpot CONTACT and COMPANY IDs and current employer,
then Apollo identity; deduplicate prior requests before any credit spend. Record
prior values and exact approved fields. Process small batches with readback.

### South African identity gate

For a South African CRM account, do not enrich or map a same-name match until the employer is cross-referenced.

- Require the exact target company or domain in Apollo, not merely a similar company name.
- Require at least two corroborators: current-role LinkedIn context, a work email on the target company's domain, South African location, or a South African mobile (`+27`).
- Treat `+27` as a strong geography signal, not proof of employer by itself.
- Treat a non-`+27` number as an exception unless the exact target company is intentionally global and the user has included foreign contacts.
- If Apollo's current employer and the work-email domain disagree, flag a possible job change. Do not move the person's HubSpot company relationship or attach them to the target account until the current employer is verified.
- A trading group may use an email domain different from its public website. Accept that alias only after a company-owned page or equivalent first-party source explicitly associates the email domain with the target company.
- If a verified alias domain already belongs to another HubSpot company, do not overwrite, merge, or move the domain. Treat it as identity evidence only and preserve both company records for separate deduplication review.
- Reject stale browser pages and candidates whose loaded title, company, or role differs from the queued target.
- For a subsidiary or division, a generic parent-company name is not enough. Confirm the unit using the Apollo account website/domain or an exact unit-specific employer name before attaching the person to that HubSpot company.

## Choose the search route

Use one skill with two entry routes. Both routes must converge on the same person-level identity check and phone enrichment.

### Person-first route

Use when the queue already contains a named Apollo candidate or reliable person identifier.

1. Use Apollo's global search to find the person by full name plus company or domain.
2. Open the exact person record rather than enriching from a search-result row.
3. Continue with **Enrich one person in Apollo**.

### Company-first route

Use when the queue starts with an account and the right people still need to be identified.

1. Open **Prospect and enrich → Companies**, or use Apollo's global search.
2. Search by the exact company domain first; use company name only when the domain is unavailable.
3. If Apollo shows duplicate company records, choose the record whose domain, location, employee context, and existing contacts best match HubSpot. Do not merge Apollo records during enrichment.
4. Open the company and select the **People** tab.
5. Filter the people table with the user's role lane:
   - Use **Job title** for the requested roles; default to founder-sellers and sales-team leaders for Henri.
   - Use **Seniority** to widen decision-maker discovery. The demonstrated leadership set is Owner, Founder, C suite, Partner, and VP; add Director or Manager only when required by the role lane.
6. Compare results by current title and company fit. Open one exact person record.
7. Continue with **Enrich one person in Apollo**. Return to the company People table for the next role or person.

## Enrich one person in Apollo

1. Open or claim the existing Apollo tab in the correct Chrome profile.
2. Search for and open the exact person.
3. Verify the person's name, employer, domain, and current title. Stop on an ambiguous or stale identity.
   - After every navigation, confirm the loaded name and title match the queued person and role before any paid click. A stale page or role mismatch is an exception, not permission to enrich the visible person.
   - For a South African account, apply the South African identity gate before spending credits and again before the HubSpot write.
4. Identify the Apollo record state and inspect **Contact information**:
   - **Unsaved prospect/person page:** the paid action may appear directly as `Access mobile`. Confirm identity, ensure the person has not already been requested, then select `Access mobile` once.
   - **Saved contact page:** use the `Enrich Contact` dropdown flow below.
   - If a personal mobile is visible and its source is Apollo, do not spend again; use the existing verified result.
   - If a number is visible but marked `User managed`, treat it as unverified. When the user authorized phone validation, run `Enrich phone` once and compare the source/result afterward.
   - If the panel shows a paid `Request phone number` action (the historical 8-credit price is not a current quote), `No mobile number`, or only an HQ number, continue only if this person has not already been requested.
5. On a saved contact, open the arrow/dropdown attached to **Enrich Contact**. Do not click the main action blindly.
6. In the dropdown, select the current **Enrich phone** option only after verifying its displayed cost against the approved budget. Do not select `Enrich email` unless the user separately requested email enrichment. On an unsaved prospect, the equivalent paid action is the already-confirmed `Access mobile` button.
7. Wait until `Trying Apollo...` finishes. Then re-read the contact information panel.
8. Classify the outcome:
   - **Mobile found:** an Apollo-sourced personal mobile/direct mobile is visible, or an Apollo-sourced number is independently classified as mobile. Record it as the verified mobile result.
   - **Existing number validated:** a prior user-managed number remains the same but its source changes to Apollo after enrichment. Classify its phone type before deciding whether it is a mobile.
   - **No mobile found:** the panel says `No mobile number`, or Apollo reports no data and no personal mobile appears. Record the no-result once and do not retry.
   - **HQ/reception only:** only a company or HQ number is available. Do not represent it as a personal mobile.
   - **Uncertain:** the page changed, identity no longer matches, or the request did not settle. Do not write a number; retain the record for review.

## Interpret Apollo's signals

- `Enrichment complete` means the request finished; it does not mean a phone number was found.
- `Enrichment ran successfully, but no data was found with the current configuration` is a completed no-result when the panel still shows no mobile.
- An HQ, corporate, reception, `Other`, or user-managed number is not a mobile unless Apollo explicitly labels it as a personal mobile/direct mobile.
- If Apollo returns `Other · Source: Apollo`, use an approved local/offline phone-number-type classifier for the country. Do not send personal numbers to an external classification service. Map it to `mobilephone` only when the type resolves to mobile; otherwise use the decision-maker reception route or retain it for review.
- For South African numbers, read [references/za-phone-types.md](references/za-phone-types.md). The national numbering plan overrides an incorrect Apollo label: for example, `087` is VoIP rather than mobile, and geographic area codes such as `010`, `011`, and `012` are not personal mobiles.
- If an Apollo-sourced mobile was already visible before the request, treat it as existing verified data and avoid paying again. A user-managed number can be enriched once to validate it when validation is in scope.

## Map the result into HubSpot

Read [HubSpot mapping](references/hubspot-mapping.md). CONTACT.mobilephone and
CONTACT.phone are single string properties, not arrays. Never append multiple
numbers or silently overwrite a different valid number. COMPANY.phone holds a
verified company route. Preserve existing associations and stage exact changes.
Do not map buyer/team/champion fields without discovering actual HubSpot properties
or association labels. Re-read each changed property and approved association.

## Batch controls

- Use one browser tab for the active person and one controlled queue; avoid duplicate concurrent writes.
- After every small batch, reconcile: requested, mobile found, no mobile, HQ only, uncertain, HubSpot created, HubSpot updated, and skipped duplicate.
- Resume from the ledger after interruption. Never infer that an unrecorded contact was completed.
- If the Apollo UI changes, stop paid clicks after the first unexplained state and inspect the page again before proceeding.

## Completion gate

A batch is complete only when every selected person has one terminal status, every approved verified mobile is read back on the correct HubSpot CONTACT (unapproved results stay staged), all required company relationships are present without duplication, and no outreach was created.
