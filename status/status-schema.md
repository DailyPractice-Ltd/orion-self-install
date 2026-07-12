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
| `checklist.*` | one boolean per install unit | flip `true` the moment that unit is genuinely done — never optimistically, never in a batch at session end |
| `stage_history` | append-only list of `{stage, at}` | on every stage change — never edit or delete an existing entry |
| `sharing.status_signal_enabled` | default `true` | only the client changes this, and only if they ask to |
| `sharing.intelligence_library_opt_in` | default `false` | only on the client's explicit, separate say-so — see `docs/intelligence-library-opt-in.md` |
| `notes` | free text scratch space | anything you want your future (possibly resumed, possibly different-AI-tool) self to know |

## The one rule that matters most

**Write after every completed unit, not at the end of a session.** You do not control
when a session ends — the client might close their laptop mid-sentence. If a completed
step isn't written back yet when that happens, it's lost, and the client will be asked
the same question twice next time. That's the exact failure this file exists to prevent.
