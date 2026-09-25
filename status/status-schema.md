# `status/status.json` — field reference

Human-readable companion to `status.schema-template.json` and
`specs/001-self-install/data-model.md`. If you're an agent reading this without wanting to
parse JSON Schema, this is the quick version.

**On session 1**: `status/status.json` doesn't exist yet. Copy
`status.schema-template.json` to `status.json` and start filling it in — the template file
itself never gets edited, only copied.

**On every subsequent session**: read `status.json` first, before asking the client
anything. Its contents ARE the answer to "where did we leave off."

| Field | Meaning | When you write it |
|---|---|---|
| `client_id` | slugified business name | as soon as `business_name` is known |
| `business_name` | the client's business, human-readable | first thing captured (knowledge base §1) |
| `agent_name` | the name the client chose for their agent | during agent identity setup |
| `harness_status` | forward-only: `draft → configured → connected → validated → installed/running` | on each real lifecycle transition — never skip a step, never move backward |
| `ops_stage` | forward-only: `booked → day1_encode → day2_wire_and_run → validated → seven_day_checkin → formalised` | tracks alongside `harness_status`, one notch coarser |
| `machine_profile` | what the Press Start wizard learned about this computer (OS, Node, git, AI tools found, which one the client chose) | written by `start.mjs` only; `null` means the wizard never ran here — ask conversationally instead, never assume. If it's filled, **don't re-ask any of it** |
| `checklist.*` | one boolean per install unit | flip `true` the moment that unit is genuinely done — never optimistically, never in a batch at session end |
| `packages.<slug>` | one entry per installed capability — Library packages **and** bespoke hires or taught skills (`kind: agent\|skill`, semver from `0.1.0`; `contracts/agent-anatomy.md`): `kind`, `role` (agents: a `library/ROLES.md` slug or `custom`), `version`, `installed_at`, `smoke_test_passed` | Library package: on a genuine smoke-test pass. Bespoke hire: at hire, with `smoke_test_passed: false`, flipped `true` only on a genuine pass — the no-optimism rule governs the flip, and the early entry is what makes a half-done hire resumable |
| `stage_history` | append-only list of `{stage, at}` | on every stage change — never edit or delete an existing entry |
| `memory` | the team notebook's wiring (schema 1.5.0): `enabled` (default `true`), `backend` (`folder` — a plain local folder — or `git` — a private repo the CLIENT owns), `remote` (git backend only), `path` (default `memory`) | config only, read by `status/memory.mjs`; the notebook's CONTENT lives in the `memory/` folder, never here. Contract: `docs/memory.md`. Independent of the radio by design |
| `sharing.status_signal_enabled` | default `true` — the radio's master switch (constitution Article V, channel 1) | only the client changes this, and only if they ask to |
| `sharing.radio_choice` | `null` until the check-in choice has been presented once; then `"accepted"` or `"declined"` | set once by the wizard (or by you, on the conversational path) — its presence is why the choice is never re-asked |
| `sharing.bridge_url` / `sharing.harness_id` / `sharing.install_token` | the radio's address and key, from the client's pairing code exchange | during the wizard's check-in step (or its conversational equivalent). All three plus the master switch must be set before anything dials out — anything less is a silent local no-op. The token is typed by the client, never echoed, never logged |
| ~~`sharing.status_signal_endpoint`~~ | removed in schema 1.2.0 (002a reconciliation) — the 001-era unauthenticated webhook is gone; the authenticated radio (`bridge_url` + key) is the only outbound path | delete it if an old status.json still carries it |
| `sharing.intelligence_library_opt_in` | default `false` | only on the client's explicit, separate say-so — see `docs/intelligence-library-opt-in.md` |
| `sharing.radio_seen_through` | `null` until the radio has read a message out; then the time of the newest Daily Practice message already read to the client (schema 1.4.0). Messages up to it are not repeated at the next check | written by `radio.mjs check` after it reads a message out. Never by hand. Deleting it only means the most recent message may be read once more |
| `notes` | free text scratch space | anything you want your future (possibly resumed, possibly different-AI-tool) self to know |

## The one rule that matters most

**Write after every completed unit, not at the end of a session.** You do not control
when a session ends — the client might close their laptop mid-sentence. If a completed
step isn't written back yet when that happens, it's lost, and the client will be asked
the same question twice next time. That's the exact failure this file exists to prevent.
