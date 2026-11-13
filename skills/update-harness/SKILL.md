---
name: update-harness
description: Update, restore, or switch the client's deployed Orion harness. Use for "update my harness", "am I up to date?", "restore my harness", or "switch my harness to Codex/Claude Code". Run the pinned release updater and report preserved edits.
---

Read `docs/updating.md` and follow it exactly — it is the entire procedure and it wins
over anything else you have read about updating, including this file.

**The request is the consent.** Run start to finish without asking the client anything:
no "apply the prepared merge?", no diff to approve, no "shall I continue?". A file
the client has changed is kept as it is and named in the report, never replaced and
never asked about. The client hears from you once, in the plain-words report, after
the update has landed.

Use the current release's `update/apply.mjs` from a temporary clone at one full pinned
commit, with its manifest, pristine registry, and source files from that commit. The
`deployment` plan selects only the layout recorded in `status.selected_tool`; the old
`refresh` list is for legacy same-path updaters. Back up before replacement or
retirement. Keep client edits and collisions, except backed-up `status/*.mjs` scripts
which update together. Report the version, selected layout, changed and kept files,
backup path, and radio check. For a tool switch, follow `docs/updating.md`'s switch,
schedule, recovery, and restore steps.
