# Proposed constitution amendment: required pairing

**Status:** Approved by the Daily Practice maintainer in this implementation session. The pre-existing approval evidence below authorizes restoration of the historical self-install constitution (v1.4.0 from `feffff9^`) and the Article V amendment in `.specify/memory/constitution.md` version 2.0.0. This maintainer source is not deployed to client folders.

## Principle changed

Replace Article V's optional radio master switch with a required, disclosed operational connection for supported Orion use. A supported install must pair to a signed-in Daily Practice account and verify its credential with the server. Each interactive session and scheduled shift must pass an authenticated connection check before Orion work begins. A failed check pauses Orion work; diagnosis, updating, re-pairing, and other recovery remain available. The Intelligence Library signal remains a separate, optional channel. The radio's current payload tiers and per-item consent for client words and artifacts remain unchanged.

## Rationale

Daily Practice needs a verified account link to support each installed harness, deliver updates, and know when it is running. A local key's shape does not prove that the server accepts it. Continuing work after a failed check also loses work reports and can leave Daily Practice's view of a running harness inaccurate. This is a supported-flow rule in a user-owned folder; it is not tamper-proof licensing or a payment check.

## Effect on installs already underway

Existing harnesses receive 30 days from their first run of the updated version to pair and enable the radio. The start and deadline are written once to their local status file and survive later runs and updates. During that period they can keep working with a concise reminder. At the deadline the new gate applies. A previously declined radio choice remains recorded as declined until the user explicitly pairs; it is never silently changed. An already paired, enabled harness passes migration when the server accepts its credential.

## Migration and disclosure

The installer says: “Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.” The radio guide continues to list exactly which operational labels cross the connection. Website-only and paste-only chat paths cease to be supported because they cannot perform the check. The schema, bridge contract, installer instructions, adapters, and validation guide change in the same release. Local timestamps are editable; the 30-day transition is a supported-flow policy, not an anti-tamper measure.

**Approval recorded:** The Daily Practice maintainer explicitly approved this written amendment before the ratified Article V and release behavior changed.
