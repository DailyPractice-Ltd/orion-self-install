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

## Finish the Orion plugin

Orion's shipped skills arrive as the `orion` plugin in `plugins/orion/`. Its setup is
separate from pairing: pairing does not depend on it, and it does not pair anything.
The installer registers it with the selected tool, scoped to this folder, and records
progress in `status/status.json` under `plugin`:

- **Claude Code**: the installer validates the package and catalog, then runs
  `claude plugin marketplace add <folder> --scope local` and
  `claude plugin install orion@<catalog> --scope local` from this folder. Those write
  this folder's `.claude/settings.local.json` (Claude Code also notes the uniquely named
  catalog in its per-user list of known marketplaces; Orion is enabled only here).
- **Codex**: the installer writes this folder's own `.codex/config.toml` with two
  entries, `[marketplaces."<catalog>"]` (this folder) and `[plugins."orion@<catalog>"]`
  `enabled = true`, keeping anything else in that file. It writes nothing to your
  user-wide Codex settings. Codex reads a project's `.codex/config.toml` only once you
  trust the folder, so the first step may be to open the folder in Codex and trust it.
  Installing Orion is then your step in Codex: the Plugins Directory (desktop app) or
  `/plugins` (CLI): search for "orion" and install Orion. If Codex records Orion as
  switched on in your user-wide `~/.codex/config.toml`, that would load it in every
  folder: setup stays unfinished and says which entry to delete there.

The states:

- `pending`: one step is owed first (install the tool, trust the folder in Codex,
  install Orion from Codex's `/plugins` or Plugins Directory, reinstall it, enable it,
  or start a fresh session). `remaining_action` says exactly what.
- `failed`: a check or native command failed; `remaining_action` says how to retry. After
  an update whose check later fails, it also names the restore command for that update's
  backup (`plugin.update_backup`).
- `registered`: the tool's own inspection, run from this folder, shows Orion enabled for
  this folder only, at this version, with every shipped skill (Claude Code:
  `claude plugin list --json` and `claude plugin details`; Codex: `codex plugin
  marketplace list --json`, `codex plugin list --json` and the cached copy Codex loads,
  under `~/.codex/plugins/cache/<catalog>/orion/local/`). No fresh session has
  confirmed it yet.
- `complete`: that same native evidence, and an assistant in a fresh session in this
  folder saw the Orion skills and confirmed it with
  `node update/plugin-setup.mjs verify --discovered`. The flag alone never earns it.

To resume unfinished plugin setup, run from this folder (safe to repeat; it reuses the
folder's catalog identity and never registers twice):

```text
node update/plugin-setup.mjs resume
```

`node update/plugin-setup.mjs verify` inspects without changing anything, and
`node update/plugin-setup.mjs status` prints where setup stands. Only report
"plugin setup complete" when the command says so.

Pairing links your account and folder; it does not check payment or subscription.
The [radio guide](radio.md) explains exactly which operational labels are shared.

## Before work

At every interactive session and before every scheduled run, execute
`node status/guard.mjs check --quiet` in this folder **before** Orion tasks,
outbound messages or CRM writes. Exit 0 allows work; exit 2 pauses it. The check
uses the read-only `/verify` endpoint, then attempts delivery of pending reports before deciding whether to allow
new work. A previous successful check or `state: verified` is not permission now.
Check support messages separately with `node status/radio.mjs check` after allowance.
Use the [native scheduling instructions](scheduled-work.md) for recurring tasks.

## Pairing and temporary connection failures

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

## When work pauses

- **No pairing or a rejected/revoked key:** sign in, renew the code and run
  `node start.mjs --code YOUR-CODE` in this folder.
- **The service cannot be reached:** restore the network, then rerun the guard.
  If the assistant's sandbox blocked it, approve the required network command in
  that tool. See the [Codex adapter](../agent/adapters/codex.md).
- **Server error:** retry the guard once service is restored. Keep the saved state.
- **Pending reports:** rerun the guard after recovery. It replays their original
  event identities before allowing new work, so retries do not add duplicate counts.
- **"Status is locked":** another Orion command is changing `status/status.json`.
  Every change to that file, to `status/radio.key` and to the report queue goes
  through `status/store.mjs` under one lock, so no command loses another's change.
  A command waits up to a minute for it (a guard check holds it while it reaches
  the service), then stops and changes nothing. The radio does not wait: a message
  is still read out, and only remembered on the next check. Let the other command
  finish and run yours again.
- **Local state or lock error:** preserve status and outbox files. For a stale lock,
  inspect `status/.radio-lock/owner.json` and establish that its PID on its named
  host has stopped before removing that lock directory. An old timestamp alone
  does not establish this. Never remove an active or unknown owner's lock.

Diagnosis, status inspection, updating, re-pairing and recovery remain available
while work is paused. A failed report after an allowed task does not undo that work:
its operational labels and original event time stay in `status/radio-outbox.json`,
and subsequent work waits for recovery when the shared guard blocks. Keep local work-log
text, client messages and credentials out of that queue and all evidence.

Ordinary folders hold the key in `sharing.install_token`; homed folders keep it in
machine-local `status/radio.key` instead. Cloud credential attachment still needs
matching server acceptance. Never print the key, even a suffix, or commit it to a home.
The optional top-level `setup_checkpoint` preserves setup report identity and its
delivery result; it is progress, never authorization.

This is a supported-flow policy in an editable local folder. Scripts and native
AI prompts are user-owned and cannot enforce tamper-proof licensing.


For a task composed of script commands, admit the whole invocation with
`node status/guard.mjs run -- <command> [args]` (for a shell sequence, use
`run -- sh -c '<commands>'`). Nested gated commands use the live parent admission
until that command exits, so authorized actions and reporting can finish after
expiry. The scope stays in that invocation's descendants and ends with its parent;
never save or reuse its environment for another task. For interactive connector
work, run `check --quiet` once at the task boundary and finish the admitted task;
do not add a new mid-task check. Run the guard again for the next task or shift.
