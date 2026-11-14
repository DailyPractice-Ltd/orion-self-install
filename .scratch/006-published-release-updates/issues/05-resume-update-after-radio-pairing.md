# 05: Resume a requested update after radio pairing

**What to build:** Let a client with radio off decide whether to opt in and pair when requesting an update, then continue the original request after the radio is confirmed working.

**Blocked by:** 04 — Apply a pinned update to a paired harness

**Status:** ready-for-agent

- [ ] Explain the pairing requirement when a radio-off or unpaired client requests an update, and offer an explicit opt-in and pairing step.
- [ ] An earlier decline is preserved unless the client chooses to opt in. A decline or failed pairing leaves update files and applied release identity untouched.
- [ ] After the client opts in and pairing succeeds, resume the pending update, including current eligibility and prewrite verification, without asking the client to repeat the request.
