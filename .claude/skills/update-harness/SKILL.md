---
name: update-harness
description: Bring the client's Orion harness up to the latest template. Use when the client says "update my harness", "get the latest version", "am I up to date?", or "restore my harness from the backup". Refresh-and-prune from the template's main branch; the client's own work is untouchable by construction.
---

Read `docs/updating.md` and follow it exactly — it is the entire procedure and it wins
over anything else you have read about updating, including this file.

The permission is `update/manifest.json`, always fetched fresh and pinned to main's
current commit: the `refresh` list is everything an update may write, the `remove`
list is everything it may delete (a release retiring a file), and
`remove_status_checklist_keys` names the only checklist keys it may drop. Nothing
outside those lists is touched. Back up before replacing or removing — including one
copy of `status/status.json` — `node --check` the scripts after, never roll back, and
end with the plain-words report: the client's knowledge base, agents, skills and logs
were not touched, and in their status file only the version, one note line, and any
retired checklist entries changed.
