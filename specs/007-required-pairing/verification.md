# Required pairing verification

## Scope and remaining live work

Implementation stays on `feature/required-pairing` in both repositories. No tag,
deployment, migration against a live database, or release publication has run.
The maintainer explicitly deferred the live test ("will test later"). Ticket 07
must remain incomplete until the real signed-in account and bridge journey passes.

## Server: implementation b4ebd5b

Server contract evidence is in mono `specs/005-radio/contracts/radio.md` and
`specs/002-intelligence-bridge/contracts/bridge.ts`. New endpoints are implemented
in source; this is not evidence that they are deployed.

Passed using the existing local dependencies, without installation:

- UI `vite build` and `tsc -p tsconfig.build.json`.
- Harness `tsc -p tsconfig.build.json`.
- Repository `eslint .`.
- Enablement `vitest run`: 36 files, 360 tests passed.
- Enablement `next build --experimental-build-mode compile`.
- Enablement `tsc --noEmit`, after Next finished generating its types.

The first parallel typecheck overlapped Next rewriting `.next/types` and reported
missing generated files; the sequential check passed. The pnpm wrapper attempted
registry access and failed in the sandbox; network escalation was declined, so
the above checks invoked the already-installed binaries directly offline.

The focused server implementation cycle passed 20 HTTP/component tests and
typechecking. Database transaction, expiry, ownership, rollback and concurrency
checks are provided in mono
`apps/enablement/tests/integration/pairing/run.sh`, but **have not run**: PostgreSQL
tooling is unavailable and the attempted temporary-tool installation was stopped
while awaiting approval. Do not treat route mocks as database integration proof.

## Client candidate: automated checks

Baseline before the feature: `node --test` passed 174 tests, zero skips.
Final ticket 07 client source under test:
`a0de7c92d05fca5ff067b39e2f8d88a51724d3f7`, branch
`feature/required-pairing-ticket07` based on integration `8c79fab`.
These changes are intended for `feature/required-pairing`; this is not a release tag.

On 2026-11-18, using existing Node v26.9.0 with no dependency installation:

- `node --test`: **292 passed, 0 failed, 0 skipped, 0 cancelled** (19.205 seconds).
- `node update/release-contract.mjs --tool codex`: passed.
- `node update/release-contract.mjs --tool claude-code`: passed.
- `node --check start.mjs` and `git diff --check`: passed.
- `node tests/helpers/pristine.mjs --write` regenerated candidate fingerprints
  after release edits and the source commit; the full suite's freshness check passed.
  Final evidence-only commits do not ship to client folders. Regeneration after
  those commits confirmed the registry remained unchanged.

The full suite includes new-install failure/success and saved-exchange interruption;
key secrecy and ordinary/homed/environment/cloud credential variants; legacy paired,
unpaired and declined migration cohorts with clock boundaries; interactive/scheduled
work refusal; stable labels-only outbox/report replay; and both installed package
journeys. External HTTP is simulated at the network boundary in those checks.
These are client behavioral checks, not proof of a deployed bridge or live server
counts. Server database transactions/concurrency still need the runner below.

Focused red/green cycles added package-plan assertions for guard/store/report and
setup guidance, required setup explanation and supported-surface documentation
checks. Legacy wizard tests now require unfinished setup and no handoff without
pairing. Deployed-folder tests demonstrate both blocked setup and successful verified
handoff with all shipped runtime modules. Four public wizard cases verify legacy
website/ChatGPT/desktop selections move to the recorded supported tool or request
an executable choice while preserving saved business answers. Test key fixtures are
constructed rather than committed as complete credential-shaped literals.

Template candidate is 3.0.0, additive client schema remains 2.0.0 and maintainer
constitution is 2.0.0. Guard/store/report plus setup guidance ship in both legacy
refresh and common deployment sources. Pairing state, setup checkpoint, machine-local
key, outbox and runtime lock remain client-owned. Native scheduler prompts held in
apps require in-place migration; local updates cannot rewrite those prompts.

## Pending database and live checklist

**Status: not run; ticket 07 incomplete.** The maintainer explicitly said “will test
later.” No deployment, account request, database migration or release publication
was attempted for ticket 07. Missing PostgreSQL tooling also prevents claiming the
provided database runner passed; no tooling install or network access was approved.
The completed local checks above do not remove either verification requirement.

When the maintainer resumes live testing, use a selected test account and installed
test folder, with the reviewed migration and routes available. Record outcomes in
the table below, including time, relevant source/deployment revision, observed exit
status and sanitized receipt/result. Never record a code, token, token suffix,
Authorization header, account identity, customer information or work-log content.

1. **Database first, on an empty disposable database only.** With existing `psql`
   and the maintainer-selected connection provided securely in the environment,
   run from the mono root:

   ```sh
   bash apps/enablement/tests/integration/pairing/run.sh
   ```

   The runner requires `PAIRING_TEST_DATABASE_URL` and creates its own fixture
   schema. It checks account ownership/renewal, expiry/reuse, simultaneous initial
   issuance, concurrent redemption and transactional rollback. It is unsuitable
   for a live business database. Record its exit code and summary, not the URL.
2. **Self-service issuance.** Sign in at `/home/pair` without support. Issue and
   renew a code, observing the expiry. Confirm superseded, expired or reused code
   does not complete setup; preserve the real values outside evidence.
3. **Exchange, verify and setup.** In a fresh installed test folder run
   `node start.mjs` and enter the code. Confirm matching `/verify` acceptance and
   setup report acknowledgment precede handoff. Restart before/after exchange and
   confirm answers survive; renew a code if its successful response was lost before
   the credential was saved. Check ordinary and homed credential storage without
   printing the key or committing it to a home.
4. **Interactive and scheduled checks.** Run `node status/guard.mjs check --quiet`
   before interactive work. Create an authorized native test task using
   `docs/scheduled-work.md` with that guard first. Inspect saved prompt and observe
   one unattended run, confirming no work precedes exit 0.
5. **Pre-work failure pause.** In the disposable test setup demonstrate rejected,
   unreachable and server-error checks. Observe exit 2 and no task output, outbound
   messages, CRM writes or scheduled work. Confirm inspection, updates and re-pairing
   remain available. Restore service or renew pairing without resetting migration.
6. **Post-check report failure and recovery.** After an accepted check, complete one
   harmless authorized test task and interrupt report delivery in the controlled
   test environment. Confirm local completion survives restart and the outbox holds
   only allowlisted labels with original event time. Restore the connection, rerun
   the guard, and observe replay acknowledgment and empty outbox before new work.
   Inspect authorized bridge evidence for one event/count despite retry; do not
   substitute a client mock for this server observation.
7. **Finalize evidence.** Fill each pending row with sanitized observations. Only
   after all required live/database checks pass may ticket 07 be completed. No tag,
   publishing or deployment follows implicitly from that completion.

| Required observation | Result | Sanitized evidence |
|---|---|---|
| Disposable PostgreSQL runner | Not run — tooling unavailable | No database result claimed |
| Signed-in code issue/renew and invalid-code refusal | Not run — maintainer deferred | Pending |
| Exchange, matching verification, setup/resume and key storage | Not run — maintainer deferred | Pending |
| Interactive and unattended scheduled pre-work check | Not run — maintainer deferred | Pending |
| Failed-check pause and recovery-only commands | Not run — maintainer deferred | Pending |
| Post-check failed report, restart and durable replay | Not run — maintainer deferred | Pending |
| Bridge confirms no duplicate event/count | Not run — maintainer deferred | Pending |
