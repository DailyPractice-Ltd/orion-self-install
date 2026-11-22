---
name: switch-ai
description: Switch this Orion folder between Codex and Claude Code when the client asks to move to the other AI assistant.
---

Use this when the client wants to move this Orion folder from Codex to Claude Code, or back.

1. Tell the client in one plain sentence what happens: their own skills move to the other
   assistant's folder, Orion is set up in the other assistant before the folder changes
   over, a backup is kept, and they can switch back the same way.
2. Remind them to review their scheduled tasks in the app that owns them, because
   schedules do not move with the folder.
3. From the root of the active Orion folder (the project you are working in, never
   relative to this skill's location), run:

   ```sh
   node switch_ai.mjs
   ```

   It switches to the other assistant. Add `--to claude-code` or `--to codex` to name one.
4. Report what it printed:
   - **Switched**: which assistant the folder now uses, where the backup is, and the one
     step left for the Orion plugin (a fresh session in the new assistant).
   - **Waiting on one step**: the folder still uses the current assistant. Read the step
     to the client (for Codex, installing Orion from its Plugins Directory). Once it is
     done, run `node switch_ai.mjs` again to finish. To call the switch off instead, run
     `node switch_ai.mjs --to <the current assistant>`.
   - **Nothing was switched**: Orion could not be set up in the other assistant; read the
     reason. The folder is exactly as it was.
   - If it refused because a file already exists, read the listed paths to the client and
     ask what to do with them. Nothing was changed.
5. Once it has switched, tell them to open this folder in the new assistant to carry on.
