# Contract: required pairing and work guard

`status/status.json` schema 2.0.0 adds `sharing.pairing`:

| Field | Meaning |
|---|---|
| `state` | `unpaired`, `exchanged`, or `verified`. Only a successful authenticated `GET /verify` sets `verified` |
| `verified_at` | Last successful server check, ISO timestamp; informational, never substitutes for a new pre-work check |
| `last_check` | `accepted`, `invalid`, `unreachable`, or `server_error`; the outcome of the latest attempt |
| `migration_started_at` | First run of this version by an existing harness, set once |
| `migration_deadline_at` | Exactly 30 × 24 hours after the start, set once |

An existing harness is one with a pre-2.0 schema and recorded progress (`started_at`,
machine profile, a completed checklist item, or an advanced ops stage). A pristine
template is a new install even if its status file already exists. Migration timestamps
are never moved on later runs or updates. An invalid future start/deadline does not
grant an extension: the guard uses the earlier of a valid recorded deadline and
start + 30 days. At the exact deadline the grace period has ended.

`status/radio-outbox.json` is an array of complete `/signals` request bodies. It is
written atomically. The only permitted keys are `harness_id`, `signal_type`,
`occurred_at`, and a flat, validated `payload` of operational labels. Local work-log
text is never stored there. A failed report preserves the original `occurred_at`; a
replay sends the same body so the bridge's `(harness, type, occurred_at, routine,
asset, tag)` identity treats it as the same event. A successful 200 replay or 201
first receipt removes it. Any remaining item blocks new work after the grace period.

`node status/guard.mjs check` performs the pre-work check. It verifies the credential
without consuming support messages, then replays the outbox before returning success.
Exit 0 means Orion work may proceed; exit 2 means pause. `--quiet` omits normal
success text for scheduled work. Recovery commands and updates may run while paused.
The client cannot enforce this against arbitrary user-edited AI prompts or scripts;
supported entry points and instructions call the guard.
