---
name: switch-ai
description: Switch this Orion folder between Codex and Claude Code when the client asks to move to the other AI assistant.
---

Use this when the client wants to move this Orion folder from Codex to Claude Code, or back.

1. Tell the client in one plain sentence what happens: their skills move to the other
   assistant's folder, a backup is kept, and they can switch back the same way.
2. Remind them to review their scheduled tasks in the app that owns them, because
   schedules do not move with the folder.
3. From the Orion folder root, run:

   ```sh
   node switch_ai.mjs
   ```

   It switches to the other assistant. Add `--to claude-code` or `--to codex` to name one.
4. Report what it printed: which assistant the folder now uses and where the backup is.
   If it refused because a file already exists, read the listed paths to the client and
   ask what to do with them. Nothing was changed.
5. Tell them to open this folder in the new assistant to carry on.

