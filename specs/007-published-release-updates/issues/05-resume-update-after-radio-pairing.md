# 05: Resume a requested update after radio pairing

**What to build:** Let a client with radio off decide whether to opt in and pair when requesting an update, then continue the original request after the radio is confirmed working.

**Blocked by:** 04 — Apply a pinned update to a paired harness

**Status:** completed

- [x] Explain the pairing requirement when a radio-off or unpaired client requests an update, and offer an explicit opt-in and pairing step.
- [x] An earlier decline is preserved unless the client chooses to opt in. A decline or failed pairing leaves update files and applied release identity untouched.
- [x] After the client opts in and pairing succeeds, resume the pending update, including current eligibility and prewrite verification, without asking the client to repeat the request.

## Implementation evidence

- `update/request.mjs` explains the pause, requires explicit opt-in, and resumes
  the original update after confirming the radio works. `docs/updating.md` covers
  the terminal prompt and how to supply a pairing code for a non-interactive run.
- Disposable deployed-harness tests cover a prior decline and pairing failures,
  success with both supported credential locations, discovery after pairing,
  and withdrawal before the first update write. They verify a failed pairing
  preserves the existing release and update files.
- Validation at `a59f248`, after merge `6e0e012` and fingerprint regeneration,
  passed all **287 tests** with `node --test tests/*.test.mjs` and loopback access
  for the disposable fixtures. `node tests/helpers/pristine.mjs` and
  `git diff --check` passed.
