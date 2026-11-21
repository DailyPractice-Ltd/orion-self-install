# Resolve the targeting brief

Accept prose, bullets, a named list or a detailed brief. Extract what the user already answered; apply current explicit instructions before defaults. First complete and present the [scoped CRM review](crm-review.md). Use its observed segments, ownership gaps and coverage to inform each missing decision. A brief is ready when source scope, qualifiers and quantity meaning are known. Do not replay a past cohort or its approval automatically.

Use the user's language: **target segment** for the companies being pursued; **vertical**, **industry** or **industry sector** for the business category; **coverage** for the number of qualifying companies and the contacts/roles represented. Keep sector, geography, workforce size and CRM eligibility as separate filters. Use coverage goals, minimums and maximums in questions and reports.

| Parameter | Establish | Missing-information behaviour |
|---|---|---|
| Sources | Existing HubSpot companies, new industry research, both, or a supplied list/view. | Show available CRM segments first and recommend the strongest supported starting point. Offer industry expansion if useful; do not silently expand HubSpot-only work. |
| Target segment | Vertical/industry sector, geography, workforce segment, eligible lifecycle stages, unassigned versus named-owner records and exclusions. An explicit broad scope is valid. | Ask for unresolved boundaries that materially change selection. For the usual segment, consider Henri-owned contacts and explicitly requested unassigned accounts in prospect, lead and MQL stages; verify the live labels against the [verified HubSpot lifecycle mapping](../../lifecycle-governance/references/hubspot-model.md). Never assume missing lifecycle means Prospect. |
| Qualifiers | Workforce thresholds and whether these measure total employees or confirmed blue-collar workers; acceptable blue-collar fit; must-haves versus preferences. | Summarise the known role/fit evidence and any criteria explicitly supplied. Apply workforce thresholds only when the current brief supplies them; Henri has no default headcount or blue-collar restriction. |
| Coverage target | Count unique companies or individual contacts; minimum, maximum, goal or a combination; optional separate segment targets. | Show existing coverage and researched/unknown availability, then offer a justified target or choices and ask what should be the minimum, maximum or goal. Clarify ambiguous “leads”; never substitute contact rows for companies. |
| Fill mode | Add N new qualifying units, or bring the existing eligible calling coverage up to N. | “Add/find N companies” means new additions; “top up to N” means total eligible calling coverage. Clarify “fill with N” when context leaves both possible. |
| Contact coverage | Relevant roles, any requested per-company coverage/cap, mobile-only versus reception acceptable. | Reuse Henri's founder-seller/sales-leader ICP unless the brief overrides it; label reception routes accurately and ask only if role/route ambiguity changes acceptance. |
| Owner and delivery | Calling-list owner, destination, timing, permitted writes and approval scope. | Default to the requesting salesperson and the existing Call Queue unless directed otherwise; verify the live owner identity. Stage unapproved changes. No arbitrary deadline, schedule or credit budget. |

After the review, resolve missing source/segment choices, qualifiers, then quantity/fill mode. Present two or three evidence-backed options when useful, recommend one with a reason, and ask one concise decision at a time. Skip answered items and allow the salesperson to give another direction. The user may accept the usual criteria or choose unrestricted industry/geography. Continue independent read-only checks while waiting; do not begin dependent sourcing or paid enrichment until the brief is resolved. Time passing or a preselected recommendation is not an answer.

For a sparse “Fill my call list,” show the scoped CRM review and selection table first, then ask which of the observed segments to pursue. Include its actual count, ownership status, evidence gaps and recommendation in the choice. Never open with a blank “What industry?” or “How many leads?” When a detailed brief supplies everything, show the scoped review and the requested segment's feasibility, then begin research without repeating questions.

## Interpret quantity and stop correctly

- **Minimum:** required floor. Continue until met or the eligible segment is exhausted/blocked; report any gap. If no goal is supplied, stop when the minimum is met rather than treating it as unlimited sourcing.
- **Maximum:** hard ceiling on qualified additions or resulting coverage, according to fill mode. It is not a promised minimum. With only a maximum, work toward that ceiling within the qualified segment and report the actual count.
- **Goal:** desired outcome; stop on reaching it, subject to any maximum. If a minimum is met but the goal is not, report both separately. If only a goal is given, do not exceed it without a reason approved in scope.
- **Exact N:** use N as both goal and maximum; a shortfall stays visible. Never force the number through weaker or duplicate candidates.
- Validate nonnegative whole numbers, minimum ≤ maximum, and any goal between the supplied bounds. Clarify contradictions before sourcing. Zero means no additions for that segment.
- Segment targets are separate: 50 mid-size companies and 10 whales means 60 distinct companies. Define disjoint segments or clarify overlap; never count one company twice toward a combined target.
- A top-up counts only current, in-scope, eligible, call-ready units in the existing queue. Count each company once despite multiple contact rows; exclude completed, suppressed, held or out-of-scope units. Required coverage must be satisfied. `needed = max(0, target - eligible_existing)`. If already above a maximum, report it and add none; do not remove existing rows without authority.
- Research candidates, approved provisional candidates, and verified call-ready units are different counts. A company reaches the calling target only with qualifying evidence and the required verified contact route/coverage. Report approved exceptions separately; never relabel them as confirmed qualifiers.

## Judge evidence

Prefer current company-published workforce evidence, then defensible company-size sources. Search “How many people work at {company}” or the exact website. Open the source and retain its date, URL and entity scope. Do not use search snippets or Apollo estimates as unquestioned facts.

A published range wholly inside the requested band can support band-based qualification when the brief permits it. A range crossing a threshold, conflicting totals, an open-ended lower bound, or a group figure without subsidiary allocation needs further evidence or a visible hold. Blue-collar fit can be likely from construction, installation, production, maintenance or field operations; this does not establish a blue-collar employee count. Distinguish employees from contractors, placed workers, franchise networks and LinkedIn profiles. Never substitute a headcount proxy for a requested confirmed blue-collar threshold.

Rank companies by fit evidence and the user's priorities. Do not invent revenue or scoring weights. If the requested segment is exhausted, report the shortfall and a concrete optional expansion; obtain the changed brief before expanding.
