---
name: update-harness
description: Update Orion when the client asks for the latest version, check its installed version, restore an update backup, or switch the folder between Codex and Claude Code.
---

Follow `docs/updating.md` (Updating Orion) for the requested operation. It is a harness file: read it at the
root of the active Orion folder, the project you are working in, never relative to this skill's location.
To switch AI assistants, run `node switch_ai.mjs` from the root of the active Orion folder.
