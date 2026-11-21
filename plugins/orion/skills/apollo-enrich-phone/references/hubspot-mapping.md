# HubSpot phone and relationship mapping

Read [HubSpot model](../../lifecycle-governance/references/hubspot-model.md).

| Verified result | Proposed destination |
|---|---|
| Personal mobile | CONTACT.mobilephone |
| Personal direct line | CONTACT.phone, with correct route classification |
| Company HQ/reception | COMPANY.phone; keep company routing distinct from personal numbers |
| Unknown type or ambiguous identity | No CRM write; retain evidence for review |

These fields are single strings. If the field is empty, stage the verified value.
If identical, no write is necessary. If a different valid value exists, preserve it
and ask for an exact replacement decision; do not comma-append or silently erase it.
A company number does not become a personal mobile because Apollo returned it on a
person page. Do not copy reception into CONTACT.phone without an explicitly approved
routing convention. Normalize with verified country context; never infer country
solely from Henri's location. South African rules apply only to South African numbers.

Resolve contacts by ID, exact email and employer, using LinkedIn/current-role evidence
for ambiguity. Names alone do not establish identity. Search for existing company
by verified domain before proposing creation; preserve parent/subsidiary distinctions.
A missing mobile is not a universal ban on contact creation: use the actual brief.

No direct equivalents of buyer, team, point_of_contact or multiselect contact_mobile
are assumed. Discover approved association labels and use CONTACT–COMPANY and relevant
DEAL relationships explicitly. Do not move primary associations or remove existing
links while enriching. Stage creation, property updates and associations separately.

Read back every approved field and relationship. Preserve lifecycle, owner and other
context. Record Apollo request/outcome/cost in a local ledger, including no-results;
this is an audit, not a second CRM. No paid reveal or CRM write is part of installation.
