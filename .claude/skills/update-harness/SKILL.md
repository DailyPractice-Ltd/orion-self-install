---
name: update-harness
description: Bring the client's Orion harness up to the latest template. Use when the client says "update my harness", "get the latest version", "am I up to date?", or "restore my harness from the backup". Allowlist-refresh from the template's main branch; the client's own work is untouchable by construction.
---

Read `docs/updating.md` and follow it exactly — it is the entire procedure and it wins
over anything else you have read about updating.

The allowlist is `update/manifest.json`, always fetched fresh from main. A path not on
it is never written. Back up before replacing, `node --check` the scripts after, never
roll back, and end with the plain-words report — including the sentence that the
client's knowledge base, agents, skills, status and logs were not touched.
