# South African phone-type check

Use the current ICASA National Numbering Plan before mapping a `+27` number to `CONTACT.mobilephone`.

- A `+27` country code establishes South African numbering, not mobile type.
- `087` is allocated to voice-over-internet services and must not be stored as a mobile even when Apollo labels it `Mobile`.
- Geographic area codes such as `010`, `011`, and `012` are fixed/geographic routes, not personal mobiles.
- Map a verified personal direct line to CONTACT.phone or a company reception route to COMPANY.phone under the HubSpot mapping reference; stage the exact change for approval.
- If a prefix is unclear or the plan changes, consult ICASA's current numbering resources before writing.

Primary references:

- https://www.icasa.org.za/pages/numbering
- https://www.icasa.org.za/uploads/files/NumberingPlanReg.pdf
