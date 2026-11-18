# 04: Require verified pairing to finish setup

**What to build:** A new user finishes setup only when their folder has exchanged a code and the server has accepted its credential. Failed or interrupted pairing stays resumable setup, with an actionable next step and no day-to-day agent handoff.

**Blocked by:** 03 — Central guard and existing-user migration.

**Status:** ready-for-agent

- [ ] Use the approved explanation verbatim: “Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.”
- [ ] Direct users to the self-service account page and use the shared guard and pairing states for both wizard and direct conversational installation.
- [ ] Missing, blank, malformed, expired, or reused codes, network failure, and rejected verification remain in setup with a specific recovery instruction. Legacy decline/skip flags cannot complete a new install.
- [ ] Persist exchanged credentials before verification in the appropriate existing storage location, then mark verified only after server acceptance. Never print or log tokens.
- [ ] Resume after interruption at every pairing step without re-asking saved setup answers. An exchanged but unverified credential can be rechecked without unnecessarily consuming another code; uncertain exchange outcomes offer code renewal.
- [ ] Only fully verified success permits installation completion and the day-to-day agent handoff. Stored pairing time, a well-shaped key, or exchange success alone are insufficient.
- [ ] Test every failure mode and success, interruption and resumption, token redaction, ordinary and homed folders, and cloud-attached credentials where applicable.
- [ ] Update setup-facing instructions with this slice; ticket 07 performs the full release consistency pass.
