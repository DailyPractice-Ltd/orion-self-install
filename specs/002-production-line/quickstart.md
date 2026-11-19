# Current quickstart — required pairing

Use [setup and recovery](../../docs/setup.md) in an installed Codex or Claude Code
folder. Website-only and paste-only chat cannot execute the guard. Get a one-time
15-minute code from signed-in `/home/pair`; run `node start.mjs --code YOUR-CODE`.
Only matching accepted verification and the stable setup report acknowledgment
complete setup. No-code, failed exchange or failed verification/report leaves saved
setup unfinished without handoff. Resume without repeating saved answers.

Run `node status/guard.mjs check --quiet` before interactive and native scheduled
work. Exit 2 pauses all tasks, messages and CRM writes outside valid grace; recovery
and updating remain available. Post-check report failures persist labels and original
time in the outbox; accepted recovery replays before new work without duplicate counts.
Existing folders receive one 30-day clock from first updated use, never reset;
past decline stays historical until explicit pairing. Exact expiry ends grace.

For automated maintainer checks run `node --test` and validate both packaged plans
with `node update/release-contract.mjs --tool codex` and `--tool claude-code`.
Regenerate pristine fingerprints last after release edits and commits.

The real-account journey and database integration runner have **not run** for this
candidate. Follow [verification](../007-required-pairing/verification.md) for the
sanitized live checklist and blockers. No tag, publication or deployment is implied.
