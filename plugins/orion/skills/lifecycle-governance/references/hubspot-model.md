# Marty's HubSpot model

Verified read-only on 2026-10-11 in portal **26589447**, Henri owner **37951461**.
The machine-readable evidence is [hubspot-schema.json](hubspot-schema.json).
This snapshot is a starting point: call get_user_details and refresh relevant
property options before filtering or writing. Check the returned account ID; do
not apply these identifiers to another portal. Tool schemas are authoritative for
object type spelling and parameters. Use search_properties (max five keywords),
get_properties, search_crm_objects and get_crm_objects; not deprecated search/fetch.
For ambiguous concepts such as “lead”, discover the schema rather than assuming a
standalone Lead object. These skills use CONTACT lifecycle qualification.

## Objects and scope

| Object | Purpose and fields | Important distinction |
|---|---|---|
| CONTACT | Person; firstname, lastname, email, jobtitle, phone, mobilephone, hubspot_owner_id, lifecyclestage, hs_lead_status | Verify employer through company associations; a text company name is not an association. |
| COMPANY | Account; name, domain, phone, hubspot_owner_id, lifecyclestage | Has its own owner/stage. Never copy these to every contact by inference. |
| DEAL | Opportunity; pipeline, dealstage, associated contacts/companies | Pipeline default is Build Your Sales Harness. Lifecycle and deal stage are separate. |
| TASK | Work; hs_task_subject, hs_task_body, hs_task_type, hs_task_status, hs_timestamp, hubspot_owner_id | Due date is not a customer-agreed callback. Associations determine whose work it is. |
| CALL | Actual call; hs_call_body, hs_call_status, hs_call_disposition, hs_timestamp, owner and associations | COMPLETED is not evidence of a two-way conversation. |
| NOTE | Factual context; discover fields and associations for the exact write | NOTE writes required reauthorization at verification time. Leave notes staged if unavailable. |

CONTACT/COMPANY/DEAL/TASK/CALL writes were available. NOTE and EMAIL writes
required reauthorization. Permission availability is not approval. A Gmail draft is
an external mutation too. Never create a fictitious CALL to bypass NOTE permission.

## Contact and company lifecycle options

Both object types returned these labels and values; verify each object's schema
independently in future. This is the portal's configured display order, not a claim
that Closed/Lost or Subscriber represents greater commercial progress.

| Display label | Internal value |
|---|---|
| 1. Prospect | 4692162800 |
| 2. Lead | lead |
| 3. MQL | marketingqualifiedlead |
| 4. SQL | salesqualifiedlead |
| 5. Deals (Opportunity) | opportunity |
| 6. Customer | customer |
| 7. Evangelist | evangelist |
| 8. Closed/Lost | 4692220128 |
| 9. Subscriber | subscriber |

Blocked and Signed trial are not lifecycle options in this snapshot. Do not invent
values or create properties automatically. Use existing verified status/task evidence
for holds. CONTACT.hs_lead_status is separate (e.g. BAD_TIMING, UNQUALIFIED, Bad_Data);
refresh its options and do not translate a research blocker into a sales status by
assumption. A field being present does not establish a qualification policy.

## Deal pipeline and stages

Pipeline label **Build Your Sales Harness**, value `default`.

| Display label | dealstage value |
|---|---|
| 1.Initial Offer 💰 (Qualified Buyer) | appointmentscheduled |
| 1.1. Nurturing 🪴 (Brainstorm) | presentationscheduled |
| 2.Strong YES 👌 (Closing Case) | contractsent |
| 2.1. Decision Maker 🤝 Bought-In | decisionmakerboughtin |
| 3.BANT ✅ (Qualified Closer) | 2657079510 |
| CS - Pilot | 2657079511 |
| Closed Won 🍾 | closedwon |
| Closed Lost | closedlost |

Use the configured labels and evidence, not semantics guessed from internal IDs:
appointmentscheduled does not prove an appointment, and contractsent does not prove
a contract was sent. Verify the selected pipeline's valid stages before mutation.
Do not infer a signed trial from CS - Pilot. Amounts require their currency property;
do not rank Henri's one-time offer by invented MRR.

## Tasks and calls

Task types include CALL, EMAIL and TODO. Statuses include NOT_STARTED, IN_PROGRESS,
WAITING, DEFERRED and COMPLETED. Open does not automatically mean callable: inspect
full task text, associations, actual dependencies, recent history and suppression.
Paginate the entire requested scope; return coverage and totals. Never claim a
three-record sample is the full workload. Use timezone-aware due comparisons;
Henri's working-day and holiday conventions have not been fully specified.

Live call disposition values:

- Connected: `f240bbac-87c9-4f6e-bf70-924b57d47db7`.
- Meeting booked: `2e7360c1-6b71-40e9-ab2b-30ae98a4678c`.
- Busy: `9d9162e7-6cf3-4944-bf63-4dff82258764` — never count as Connected.
- No answer: `73a0d17f-1163-4015-bdd5-ec830791da20`.

Refresh these options before applying. Count only evidenced real conversations with
distinct contacts, checking prior history to distinguish new prospects from follow-ups.
Henri's goal is 60 new prospects actually spoken with per month; a task or dial is
not a conversation. Missing history means incomplete counting, not a fabricated zero.

## Relationships, updates and links

Use associatedWith queries to retrieve related records. Resolve CONTACT, COMPANY,
DEAL and TASK IDs separately and preserve all valid existing relationships. Discover
association types/labels before proposing a change; buyer, team and point_of_contact
are not assumed HubSpot fields. Never overwrite a primary company as a side effect
of enrichment. Keep object IDs as strings in ledgers; obey tool parameter types.

Show exact old/new properties and associations for approval; batch at most ten
objects per mutation. Re-read before applying, then read back properties and
associations. Reconcile ambiguous results before retrying. Missing permissions hold
only the dependent step; don't fabricate success or silently substitute another action.

For backward lifecyclestage corrections, explain the clear-then-set sequence before
approval. Verify the intermediate clear and final value. These are not atomic writes;
if interrupted, re-read and report the actual state, not a presumed restoration.
See [HubSpot lifecycle guidance](https://knowledge.hubspot.com/records/use-lifecycle-stages).
No stage-history timestamps or other evidence fields should be manually rewritten.

Use URLs or urlTemplate values returned by HubSpot, retaining UTM parameters. Check
object type and ID for each record link. A contact URL is not a company URL. Do not
construct guessed company cards from contact IDs.

## Marty workflow defaults

Use the knowledge base and current brief: France, founder-sellers and sales-team
leaders, all sectors. First contact is Henri's phone call to book a later 20-minute
Google Meet demo; messages use his approved French tone. After no answer, prepare
a retry after two days, at most three total attempts, subject to holds and actual
history. Non-working-day adjustments are not specified; ask only when needed.
After a demo without purchase, the recorded preference is a next-day phone follow-up.
Do not schedule or create tasks from these preferences without approval.

The existing queue is optional and its current headers must be inspected; no new
sheet, columns or automation are created by installation. Slack, webinar and payment
sources are conditional on scope and actual access. No Slack publication, Xero account,
blue-collar restriction or standing write authority is assumed.
