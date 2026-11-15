---
name: update-harness
description: Use when the client says "update my harness", "get the latest version", "am I up to date?", or "restore my harness from the backup". Applies verified stable GitHub Releases to the selected Orion tool layout.
---

Read `docs/updating.md`. When the client asks for an update, run
`node update/request.mjs` from that deployed harness and follow its result.
A paired radio is required. Report the version, preserved edits or collisions,
and the backup or failure report. If preflight reports a required file with a
local edit, keep the file and report the block.

For an applied withdrawn release, offer the recovery choices in
`docs/updating.md`. A compatible correction uses the normal update. To restore
the pre-update backup, show the preview and wait for the client to choose it.
