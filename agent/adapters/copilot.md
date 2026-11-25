# Adapter — Microsoft Copilot web chat and declarative agents

This website-only or paste-only surface cannot execute Orion's pairing and fresh
pre-work connection checks. It is no longer a supported installation or Orion work
path. An uploaded knowledge base or pasted agent prompt does not satisfy the gate.

## Continue in a supported tool

1. Explain that Orion needs a local assistant that can run the connection check.
2. Open the client's existing installed Orion folder in **Codex or Claude Code**.
   For the Claude desktop app use its Code environment, covered by
   [the Claude Code adapter](claude-code.md). Keep their saved business files in
   that folder rather than exporting credentials into chat.
3. Follow [setup and recovery](../install.md): run `node start.mjs`, get the
   signed-in account's one-time code, exchange and verify it. Resume saved answers.
4. In the supported tool run `node status/guard.mjs check --quiet` before Orion
   tasks, outbound messages or CRM writes, and stop on exit 2. Native scheduled
   work follows [Schedule Orion](../scheduled-work.md).

On this unsupported surface, help only with setup and recovery guidance until the
client moves to a supported tool. Never claim a check or signal happened here.
Unpaired work is blocked immediately.
See [the radio guide](../radio.md) for the operational-data disclosure.
