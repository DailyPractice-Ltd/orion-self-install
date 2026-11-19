# Simulated dry-run example — required-pairing candidate

This is an illustrative walkthrough, not live verification or evidence that a real
non-technical person completed setup. Use [the real protocol](../NON-TECHNICAL-DRY-RUN.md)
for an observed run. The earlier website-only example belongs to the historical
optional-radio design; it is replaced by this supported executable journey.

## Starting and pausing

A fictional salesperson uses a website chat and asks to install Orion. It explains
that this surface cannot run pairing or connection checks and routes them to
Codex or Claude Code with Node.js. The salesperson downloads the release and runs
`node install.mjs --tool codex --target /path/to/my-orion`. This creates the folder;
setup remains unfinished. They open that folder and run `node start.mjs`.

The wizard detects the machine and records the supported tool. It presents:

> Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.

Without a code it saves answers, provides the signed-in `/home/pair` route and
stops without a day-to-day handoff. A fictional expired code behaves likewise.
The person renews the code themselves; no support person or payment check is needed.
The wizard exchanges it, saves its private credential, verifies the returned folder
identity and receives acknowledgment for its setup report. Only then is the
handoff printed. No credential, suffix or code response appears in evidence.

## Doing work and recovering

In every session the assistant first runs `node status/guard.mjs check --quiet`.
After exit 0 it captures business context one question at a time, performs the
connector checks, and runs the real validation tasks in a genuine observed run.
A scheduled task has that same guard before all research and writes, followed by
`done.mjs --shift` only after finished work. Existing app-owned prompts are edited
in place before the next enabled run.

To illustrate a failure, the pre-work check is rejected. Exit 2 means no research,
CRM writes, messages or scheduled work. The assistant gives the recovery action;
inspection, updating and re-pairing remain available. After service returns, the
next guard verifies again and delivers pending reports before new work.

If delivery fails after a successful check and completed task, the local work-log
line remains. Only operational labels and original time enter the durable outbox.
Restart and replay keep the same identity, so duplicate acknowledgments do not add
counts. The assistant claims delivery only after acknowledgment and an empty queue.

An existing previously declined folder is a separate cohort: first updated use
requires pairing before work. Paired folders continue silently through temporary
failures for 48 elapsed hours after verified connection and complete report delivery.
At expiry the next task blocks; admitted tasks finish and report.

## Evidence boundary

No step above was performed against a real account. Ticket 07 remains incomplete
until the maintainer completes the real-account checks in
`../validation/validation-tasks.md` and the observed journey in
`../NON-TECHNICAL-DRY-RUN.md`. Keep observed friction in the real protocol's log
and record only sanitized outcomes.
