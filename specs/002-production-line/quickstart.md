# Current quickstart — required pairing

Use [setup and recovery](../../docs/setup.md) in an installed Codex or Claude Code
folder. Website-only and paste-only chat cannot execute the guard. Get a one-time
15-minute code from signed-in `/home/pair`; run `node start.mjs --code YOUR-CODE`.
Only matching accepted verification and the stable setup report acknowledgment
complete setup. No-code, failed exchange or failed verification/report leaves saved
setup unfinished without handoff. Resume without repeating saved answers.

Run `node status/guard.mjs check --quiet` before interactive and native scheduled
work. Exit 2 pauses all tasks, messages and CRM writes when the shared guard blocks; recovery
and updating remain available. Post-check report failures persist labels and original
time in the outbox; accepted recovery replays before new work without duplicate counts.
All unpaired harnesses must pair before normal work, including the first updated
run. Existing accepted credentials need no new code. Temporary verification or
reporting failures permit work silently for 48 elapsed hours after accepted
verification and acknowledged delivery of all queued reports. Only that complete
cycle refreshes `last_connected_at`; partial replay, failures, restarts and updates
never do. At exactly 48 hours, block the next task or scheduled run unless current
verification and delivery succeed. An admitted task may finish and report afterward.
Invalid/revoked credentials clear the allowance immediately. Disabled radio and
unsafe local state require recovery. Historical migration fields are readable but
inert; never infer the connection time from old verification or migration dates.
Preserve a declined choice until explicit pairing. Setup still requires current
accepted verification and acknowledged setup reporting.

For automated maintainer checks run `node --test` and validate both packaged plans
with `node update/release-contract.mjs --tool codex` and `--tool claude-code`.
Regenerate pristine fingerprints last after release edits and commits.

The real-account journey and database integration runner have **not run** for this
candidate. Follow [verification](../007-required-pairing/verification.md) for the
sanitized live checklist and blockers. No tag, publication or deployment is implied.
