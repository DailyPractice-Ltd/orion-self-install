# Contract: the send level and its files (spec 007, kit 1.5.0)

The decisions live in `dailypractice-mono/specs/007-send-risk/spec.md`. This page is the
shape of what the kit writes, so a script, a test and an assistant read the same thing.

## `status/status.json`, `scopes` (schema 1.9.0)

| Key | Values | Written by |
|---|---|---|
| `send_risk` | `off`, `low`, `medium`, `high` | the wizard (`low` on a fresh install), `node status/send.mjs set-level`, `migrate` (`low` when none is recorded) |
| `send_risk_set_by` | who set it: `install`, `update`, or the client's name | the same |
| `send_risk_set_on` | `YYYY-MM-DD`, local date | the same |
| `send_risk_resume` | the level to go back to while paused (`off`) | `set-level pause`; removed by any other set |
| `send_caps` | `{ email, dm, sms }`, whole numbers, per day, from knowledge base §7 | `set-level --cap-email N --cap-dm N --cap-sms N` |
| `waiting_session` | optional: the fixed id of the command-line "waiting for you" session | the assistant, once |

Nothing else reads a level from anywhere else. A skill never carries one.

## The job sheet (`.claude/agents/<name>.md` frontmatter)

`send_risk: harness` (sends with the harness level; absent means the same) or
`send_risk: never`. Anything else means never. `go_live: false` sends nothing whatever the
level. `tools:` names the route's send tool by its real name, for example
`mcp__claude_ai_Gmail__send_message`; the wake-up passes it through only while the
effective level allows.

## `status/send-log.md`

One line per decision, content-free, never the recipient, seven cells:

```
{YYYY-MM-DD HH:MM} | {agent} | {channel} | {relationship} | {content} | {score} | {send|waiting|sent|failed|verdict}
```

A `verdict` line carries an eighth cell, `approved` or `rejected`. A cell not given is
`-`. The history factor reads verdict lines over the last 30 days for the same agent,
channel and content label. The client's file: no update touches it.

## `status/no-contact.md`

One address or domain per line, lower case, matched whole. Permanent. The client's file.

## `status/waiting.md`

The list of messages waiting for the client, rewritten in full by every run, read out
at the start of every session, in the words the agent definition gives ("Waiting for
you: N messages. ..."). The client's file.

## `status/shifts/<name>.json` (since 1.5.0)

Gains `bin`, `node_dir` and `send_risk` (the effective level the wake-up was rendered
with), so `set-level` and `migrate` can re-render the wake-up in place. A record from
before 1.5.0 has none of them; the command is read back from the wake-up file itself.

## The sentence

`WAITING_SENTENCE` in `status/shapes.mjs`, asserted word for word in rule 1 of the agent
definition and in `agent/risk-matrix.md`.
