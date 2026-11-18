# Pair Orion and recover the connection

Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.

## Finish setup

Use an installed Orion folder in **Codex or Claude Code**, where the assistant can
read and write its files and execute Node.js commands. Open the folder created by
`node install.mjs --tool codex --target /path/to/my-orion` (or `--tool claude-code`).
Run `node start.mjs` there. A plain website or paste-only chat cannot execute the
required checks: open this same folder in one of those supported tools to continue.

1. Sign in at [Daily Practice pairing](https://www.dailypractice.world/home/pair).
   Request a code. It works once and expires after 15 minutes; renew it there if needed.
2. Enter that code when Press Start asks, or run `node start.mjs --code YOUR-CODE`.
   The wizard saves the returned credential securely, then checks that Daily Practice
   accepts this folder's identity. You never copy an install token.
3. Setup finishes only after accepted verification and delivery of its setup report.
   A blank, malformed, expired or used code, failed exchange, rejected verification,
   or undelivered report keeps setup unfinished, with no day-to-day handoff.
   Run `node start.mjs` again to resume saved answers. If an exchange succeeded but
   its response was lost before saving, request a fresh code.

Pairing links your account and folder; it does not check payment or subscription.
The [radio guide](radio.md) explains exactly which operational labels are shared.

## Before work

At every interactive session and before every scheduled run, execute
`node status/guard.mjs check --quiet` in this folder **before** Orion tasks,
outbound messages or CRM writes. Exit 0 allows work; exit 2 pauses it. The check
uses the read-only `/verify` endpoint, then delivers pending reports before allowing
new work. A previous successful check or `state: verified` is not permission now.
Check support messages separately with `node status/radio.mjs check` after allowance.
Use the [native scheduling instructions](scheduled-work.md) for recurring tasks.

## Existing folders: one 30-day transition

An existing folder with recorded progress receives a one-time 30-day transition
from its **first updated run**, saved before work. A pristine copied status file
is a new install. The start and deadline survive restarts and updates; the clock
does not reset. During valid grace, existing work may continue with a concise
reminder, even when offline, while operational reports remain queued locally.
An enabled, already paired folder can satisfy this transition by verification
without a new code. A prior declined choice remains recorded until explicit pairing.

At the exact deadline, or after migration has already been satisfied, enabled
pairing, fresh acceptance and delivered pending reports are required. Invalid,
partial or future clock state requires repair; it never creates more grace.

## When work pauses

- **No pairing or a rejected/revoked key:** sign in, renew the code and run
  `node start.mjs --code YOUR-CODE` in this folder.
- **The service cannot be reached:** restore the network, then rerun the guard.
  If the assistant's sandbox blocked it, approve the required network command in
  that tool. See the [Codex adapter](../agent/adapters/codex.md).
- **Server error:** retry the guard once service is restored. Keep the saved state.
- **Pending reports:** rerun the guard after recovery. It replays their original
  event identities before allowing new work, so retries do not add duplicate counts.
- **Local state or lock error:** preserve status and outbox files. For a stale lock,
  inspect `status/.radio-lock/owner.json` and establish that its PID on its named
  host has stopped before removing that lock directory. An old timestamp alone
  does not establish this. Never remove an active or unknown owner's lock.

Diagnosis, status inspection, updating, re-pairing and recovery remain available
while work is paused. A failed report after an allowed task does not undo that work:
its operational labels and original event time stay in `status/radio-outbox.json`,
and subsequent work waits for recovery outside valid grace. Keep local work-log
text, client messages and credentials out of that queue and all evidence.

Ordinary folders hold the key in `sharing.install_token`; homed folders keep it in
machine-local `status/radio.key` instead. Cloud credential attachment still needs
matching server acceptance. Never print the key, even a suffix, or commit it to a home.
The optional top-level `setup_checkpoint` preserves setup report identity and its
delivery result; it is progress, never authorization.

This is a supported-flow policy in an editable local folder. Scripts and native
AI prompts are user-owned and cannot enforce tamper-proof licensing.
