# Required pairing verification

## Revised policy: pending implementation and verification (2026-11-19)

The maintainer confirmed immediate pairing for all unpaired harnesses and a silent
48-hour connection allowance for paired harnesses. See spec.md and
contracts/status-and-guard.md. Tickets 02–07 are reopened or require revision
integration. The automated results below describe the earlier candidate only;
they do not validate the new policy. No new runtime tests or live checks have run.

Required new automated coverage:

- First updated run blocks unpaired/declined harnesses; accepted existing credentials
  work without another code. Old migration fields never grant work permission.
- Version-2 state persists `last_connected_at` only after accepted verification and
  complete acknowledged delivery. No inferred timestamp from older state.
- Temporary verification/reporting failures allow tasks silently before 48 hours;
  the exact boundary and later attempts block. Interactive and scheduled paths agree.
- Partial/failed replay never renews the timestamp despite accepted verification;
  full verification-and-delivery recovery does. Restarts and updates do not reset it.
- Invalid/revoked credentials invalidate the allowance and block immediately.
  Disabled radio, future/malformed timestamps, corrupt/unwritable queues and unsafe
  locks require recovery even inside the nominal window.
- A task admitted before expiry finishes its authorized effects and reporting after
  expiry; the next task/shift is blocked. Finished-work reporting remains available.
- Allowed outage runs show no connection notice/countdown or repeated alerts;
  blocked runs give one recovery action. Setup still needs current accepted
  verification and acknowledged reporting before handoff.
- Existing privacy, identity, lost-ACK replay, concurrency and credential-storage
  regressions still pass. Record fresh suite/package results after implementation.

## Historical scope and remaining live work

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
Pre-review ticket 07 client source under test:
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

Template candidate additive client schema remains 2.0.0 and maintainer
constitution is 2.0.0. Guard/store/report plus setup guidance ship in both legacy
refresh and common deployment sources. Pairing state, setup checkpoint, machine-local
key, outbox and runtime lock remain client-owned. Native scheduler prompts held in
apps require in-place migration; local updates cannot rewrite those prompts.

## Final review fixes: 2026-11-19

Client source commit `398beb5` on `fix/required-pairing-review`, based on
integration `98d6832`, resolves the final two-axis review's three P2 findings:

- Wizard saves now apply machine detection or a selected surface to fresh locked
  state, retaining concurrent credentials, identity, pairing, setup checkpoint and
  saved answers. A deterministic two-process wizard regression waits at the public
  surface prompt while the other wizard pairs and completes setup; the waiting
  wizard then resumes successfully without a second exchange or checkpoint.
- Reporting failures use the same migration policy as the work guard before
  introducing the pairing marker. Public `done.mjs`, `radio.mjs signal` and report
  entry regressions fix the clock at `2026-11-18T12:00:00.000Z`, assert the durable
  `2026-12-18T12:00:00.000Z` deadline, permit grace before it, refuse at the exact
  boundary and recover without resetting either timestamp. Reports remain queued
  and local completion text stays in the local work log.
- The public no-detected-app wizard branch directs installation to Codex or Claude
  Code and `docs/setup.md`; it no longer promises website-only installation.

Each finding was reproduced red before its fix and then passed green. Focused
validation covered the wizard, migration, guard and reporting entrypoints; no
second broad review was run. After the final source commit, candidate fingerprints
were regenerated and the full client suite passed: **297 passed, 0 failed, 0
skipped, 0 cancelled** (19.793 seconds), using existing Node v26.9.0 without any
installation or network access. Both Codex and Claude Code package plans passed,
as did `node --check start.mjs` and `git diff --check`. Evidence-only commits do
not ship to client folders; regeneration after them must remain unchanged.

These are local client regressions. Mono was unchanged; ticket 01's database
runner and ticket 07's real account/bridge journey remain unexecuted and open.
No deployment, release publication or live feature claim follows from this pass.

## Pending database and live checklist — revised target

**Status: not run; ticket 07 incomplete.** The maintainer explicitly said “will test
later.” No deployment, account request, database migration or release publication
was attempted for ticket 07. Missing PostgreSQL tooling also prevents claiming the
provided database runner passed; no tooling install or network access was approved.
The completed local checks above do not remove either verification requirement.

When the maintainer resumes live testing, use a selected test account and installed
test folder, with the revised client policy and required routes available. Record outcomes in
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
5. **Connection allowance and immediate refusal.** In the disposable paired
   setup, establish an accepted verification-and-delivery timestamp. Demonstrate
   unreachable and server-error checks permit interactive/scheduled work silently
   before expiry; use controlled clock injection to verify refusal at exactly
   48 hours and afterward without waiting two days. Confirm a previously admitted
   task finishes after expiry. Demonstrate invalid/revoked credentials block
   immediately and invalidate the allowance, while unpaired users cannot work at
   all. Recovery/inspection/update commands remain available. Record simulated
   clock checks distinctly from real server observations.
6. **Reporting failure and recovery.** Complete a harmless authorized test task,
   interrupt reporting, and confirm local completion and the labels-only outbox
   survive restart. Confirm work continues silently within the same allowance.
   Accepted verification with failed/partial replay must not refresh the timestamp;
   expiry blocks the next task. Restore reporting, rerun the guard and confirm
   accepted verification plus acknowledged empty outbox refreshes the connection
   time. Inspect authorized bridge evidence for one event/count despite retry;
   do not substitute mocks for the real server observation.
7. **Finalize evidence.** Fill each pending row with sanitized observations. Only
   after all required live/database checks pass may ticket 07 be completed. No tag,
   publishing or deployment follows implicitly from that completion.

| Required observation | Result | Sanitized evidence |
|---|---|---|
| Disposable PostgreSQL runner | Not run — tooling unavailable | No database result claimed |
| Signed-in code issue/renew and invalid-code refusal | Not run — maintainer deferred | Pending |
| Exchange, matching verification, setup/resume and key storage | Not run — maintainer deferred | Pending |
| Interactive and unattended scheduled pre-work check | Not run — maintainer deferred | Pending |
| Silent 48-hour allowance, exact expiry and immediate credential refusal | Not run — maintainer deferred | Pending |
| Post-check failed report, restart and durable replay | Not run — maintainer deferred | Pending |
| Bridge confirms no duplicate event/count | Not run — maintainer deferred | Pending |
