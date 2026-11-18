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

## Client baseline and contracts

Before feature changes, `node --test` passed all 174 tests, with zero skips.
Ticket 02 structural schema/example checks passed. Its release-contract freshness
check requires the planned final pristine fingerprint regeneration in ticket 07.
Client runtime and complete release validation are still underway.

## Live checks still required

Use a maintainer-selected real account and bridge with the migration and routes
available. Obtain and renew a code without support, exchange it in an installed
folder, verify it, finish setup, and run interactive and scheduled pre-work checks.
Demonstrate failure pause, a post-check report failure, restart, and successful
recovery with pending-report replay and no duplicate counts. Exercise the supplied
PostgreSQL concurrency runner on a disposable database first. Record sanitized
outcomes here; never record credentials or client content.
