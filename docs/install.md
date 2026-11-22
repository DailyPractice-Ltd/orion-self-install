# Install Orion, pair it, and recover the connection

The one authority for installing Orion, pairing it with Daily Practice, the before-work
guard, the connection allowance, and recovery. Follow it whenever `status/status.json` is
missing or its `ops_stage` is not `formalised`. Day-to-day behaviour is in
[AGENTS.md](../AGENTS.md).

## Installer rules

You are the installer; there is no coach in the session.

1. **Non-technical first.** Assume the client has never opened a terminal, generated an
   API key or used git. Before any technical step, say in one plain sentence what it is
   for. When a click-by-click path exists beside a scripted one, offer both.
2. **One question at a time.** A conversation, not a form.
3. **Save after every completed unit of work.** Update `status/status.json` (stage,
   checklist key) as each piece finishes, not at the end of the session: that is what
   makes the install resumable across days, machines and AI tools.
4. **Follow the documented fork.** When the client's situation does not fit the main path
   (no CRM, a CRM other than Attio or HubSpot, an unsupported AI tool), say so plainly and
   follow the fallback in the relevant file. Every such fork is covered somewhere in this
   folder.
5. **Say before you write.** Tell the client what a script or API is about to change before
   it first writes to a live external account.

## Start or resume

- **No `status/status.json`**: copy `status/status.schema-template.json` to
  `status/status.json` and start at `ops_stage: "booked"`.
- **A status file**: resume at its `ops_stage`; skip every checklist step already `true`.
  When `machine_profile` is filled, the Press Start wizard (`start.mjs`) already recorded
  the OS, Node, git, the AI tools present and the client's choice: never re-ask them. When
  it is `null`, ask only for what you need.
- **Knowledge-base files already filled** (a reinstall from 1.x, see
  [reinstall-from-1.x.md](reinstall-from-1.x.md)): read them, mark the matching `kb_*`
  checklist keys, and ask only the capture questions they leave unanswered.

Setup records `agent_name: "Orion"` automatically; there is no naming question.

## Stages

The stage names mirror Daily Practice's internal tracking board and are load-bearing:
never rename them.

| `ops_stage` | What happens | Detail |
|---|---|---|
| `booked` | Say hello, set expectations, confirm a fresh start or a resume; pair Orion | this file |
| `day1_encode` | Capture the knowledge base (business, ICP, offer, tone, objections, commitments) | [knowledge base guide](../agent/knowledge-base/README.md), [Capture notes](#capture-notes) |
| `day2_wire_and_run` | CRM choice and setup, connector sign-in (CRM, email, calendar), first real task | [CRM](../crm/README.md), [connectors](../connectors/connector-checklist.md) |
| `validated` | Run the validation tasks against the client's real accounts | [validation tasks](../validation/validation-tasks.md) |
| `seven_day_checkin` | The client drives Orion solo; you are on standby for questions | [AGENTS.md](../AGENTS.md) |
| `formalised` | Install complete and confirmed stable | — |

## Capture notes

- **Commitments are numbers.** §7 holds the client's own quantified "comfort +5%" numbers
  (for example "100 IG DMs/month"), agreed out loud. Daily drive and pacing depend on them.
  Once §7 is captured, record its pacing limits once:
  `node status/send.mjs set-level low --cap-email N --cap-dm N --cap-sms N` (per day).
- **Vocabulary check.** Once the knowledge base is assembled, run one prospect-research
  task and show the draft: "does this sound like you?" If it does not, recapture §2 and §5.
  When it does, set `checklist.agent_identity_set` to `true`.
- **Send level.** At the end of the install, tell the client once, in these words: "Your
  harness sends on its own at low: replies and logistics. Say 'set my risk to medium' to
  change it, or 'pause sending' to stop it." The matrix in plain words is
  [risk-matrix.md](../agent/risk-matrix.md).

## Pair Orion

Pairing is required to finish setup. During setup, and when recovery needs a new code,
say:

Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.

Use an installed Orion folder in **Codex or Claude Code**, where the assistant can read
and write its files and run Node.js. The folder is created by
`node install.mjs --tool codex --target /path/to/my-orion` (or `--tool claude-code`).
A website-only or paste-only chat cannot run the checks: open this same folder in one of
those tools to continue.

1. Sign in at [Daily Practice pairing](https://www.dailypractice.world/home/pair) and
   request a code. It works once and expires after 15 minutes; renew it there if needed.
2. Run `node start.mjs` and enter the code, or run `node start.mjs --code YOUR-CODE`. The
   wizard saves the returned credential, then checks that Daily Practice accepts this
   folder. The client never copies an install token.
3. Setup finishes only after accepted verification and delivery of its setup report. A
   blank, malformed, expired or used code, a failed exchange, a rejected verification or
   an undelivered report keeps setup unfinished. Run `node start.mjs` again to resume
   saved answers. If an exchange succeeded but its response was lost before saving,
   request a fresh code.

Pairing links the client's account and folder; it does not check payment. The
[radio guide](radio.md) says exactly which operational labels are shared.

Ordinary folders hold the key in `sharing.install_token`; a folder with a home keeps it
in machine-local `status/radio.key`. Never print the key, even a suffix, or commit it to a
home. The optional top-level `setup_checkpoint` preserves the setup report's identity and
delivery result; it is progress, never authorization.

## Finish the Orion plugin

Orion's shipped skills arrive as the `orion` plugin in `plugins/orion/`. Its setup is
separate from pairing. The installer registers it with the selected tool, scoped to this
folder, and records progress in `status/status.json` under `plugin`:

- **Claude Code**: the installer validates the package and catalog, then runs
  `claude plugin marketplace add <folder> --scope local` and
  `claude plugin install orion@<catalog> --scope local` from this folder. Those write
  this folder's `.claude/settings.local.json` (Claude Code also notes the uniquely named
  catalog in its per-user list of known marketplaces; Orion is enabled only here).
- **Codex**: the installer writes this folder's own `.codex/config.toml` with two
  entries, `[marketplaces."<catalog>"]` (this folder) and `[plugins."orion@<catalog>"]`
  `enabled = true`, keeping anything else in that file. It writes nothing to the
  user-wide Codex settings. Codex reads a project's `.codex/config.toml` only once the
  folder is trusted, so the first step may be to open the folder in Codex and trust it.
  Installing Orion is then the client's step in Codex: the Plugins Directory (desktop
  app) or `/plugins` (CLI), search for "orion" and install it. Codex may need a restart.
  If Codex records Orion as switched on in the user-wide `~/.codex/config.toml`, it would
  load in every folder: setup stays unfinished and says which entry to delete there.

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
`node update/plugin-setup.mjs status` prints where setup stands. Report "plugin setup
complete" only when the command says so.

## Before work

At every interactive task and before every scheduled run, run
`node status/guard.mjs check --quiet` in this folder **before** Orion tasks, outbound
messages, CRM writes or moving an install stage. Exit 0 allows work; exit 2 pauses it and
prints the one recovery action. The check uses the read-only `/verify` endpoint, then
attempts delivery of pending reports before deciding. A previous successful check or
`state: verified` is not permission now. Support messages are checked separately, with
`node status/radio.mjs check`, after the guard allows the session.

For a task composed of script commands, admit the whole invocation with
`node status/guard.mjs run -- <command> [args]` (for a shell sequence, use
`run -- sh -c '<commands>'`). Nested gated commands use the live parent admission
until that command exits, so authorized actions and reporting can finish after
expiry. The scope stays in that invocation's descendants and ends with its parent;
never save or reuse its environment for another task. For interactive connector
work, run `check --quiet` once at the task boundary and finish the admitted task;
do not add a new mid-task check. Run the guard again for the next task or shift.

### The connection allowance

Temporary verification or reporting failures permit work silently for 48 elapsed hours
after accepted verification and acknowledged delivery of all queued reports. Only that
complete cycle refreshes `last_connected_at`; partial replay, failures, restarts and
updates never do. At exactly 48 hours, the guard blocks the next task or scheduled run
unless current verification and delivery succeed; an admitted task may finish and report
afterward. Invalid or revoked credentials clear the allowance at once. A disabled radio
and unsafe local state need recovery. Unpaired folders must pair before any work; setup
always needs current accepted verification and acknowledged setup reporting.

Stay silent about temporary failures while work is allowed. Explain recovery only when
the guard blocks.

## When work pauses

- **No pairing, or a rejected or revoked key:** sign in, renew the code and run
  `node start.mjs --code YOUR-CODE` in this folder.
- **The service cannot be reached:** restore the network, then rerun the guard. If the
  assistant's sandbox blocked it, approve the network command in that tool (see the
  [Codex adapter](../agent/adapters/codex.md)). On a company network, ask IT to allow
  HTTPS to `www.dailypractice.world`.
- **Server error:** retry the guard once service is restored. Keep the saved state.
- **Pending reports:** rerun the guard after recovery. It replays their original event
  identities before allowing new work, so retries never add duplicate counts.
- **"Status is locked":** another Orion command is changing `status/status.json`. Every
  change to that file, to `status/radio.key` and to the report queue goes through
  `status/store.mjs` under one lock. A command waits up to a minute for it (a guard check
  holds it while it reaches the service), then stops and changes nothing. The radio does
  not wait: a message is still read out, and only remembered on the next check. Let the
  other command finish and run yours again.
- **Local state or lock error:** preserve status and outbox files. For a stale lock,
  inspect `status/.radio-lock/owner.json` and establish that its PID on its named host
  has stopped before removing that lock directory. An old timestamp alone does not
  establish this. Never remove an active or unknown owner's lock.

Diagnosis, status inspection, updating, re-pairing and recovery stay available while work
is paused. A failed report after an allowed task does not undo that work: its
operational labels and original event time stay in `status/radio-outbox.json` until
delivered. Keep local work-log text, client messages and credentials out of that queue
and out of all evidence. Corrupt queue data needs repair, never deletion.

This is a supported-flow policy in an editable local folder. Scripts and native AI
prompts are user-owned and cannot enforce tamper-proof licensing.
