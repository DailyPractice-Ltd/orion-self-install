# §7 Commitments — the "comfort +5%" numbers

<!-- Capture prompts (delete once filled):
  - "What volume of [activity] feels comfortable per month?" → then: "+5% on that — deal?"
  - Agree each number explicitly, out loud (or in writing, if this is a chat). These get
    wired into status/status.json's pacing and (if built) the n8n workflows — they are
    throughput targets, not aspirations.
  - Example shape: 100 IG DMs/mo, 7 blog posts/mo, 40 forum engagements/mo.
-->

Agreed with {{CLIENT_NAME}} on {{DATE}}, directly in this conversation.

| # | Activity (their words) | Monthly number | Tracked where | Fed by which workflow |
|---|---|---|---|---|
| 1 | {{e.g. IG DMs to new seekers}} | {{100 / month}} | {{their CRM's daily-drive view}} | {{WF-01 prospect research → outreach}} |
| 2 | {{e.g. blog posts}} | {{7 / month}} | {{…}} | {{agent drafting, manual publish}} |
| 3 | {{e.g. forum engagements}} | {{40 / month}} | {{…}} | {{…}} |

## Pacing rule

The agent's Daily Drive (task 5) and `status/status.json`'s own tracking report pace
against these numbers: `on pace / behind by N / ahead by N`, assuming an even spread over
the month's working days. When behind, the daily plan front-loads the behind commitment —
it never silently drops one.

## Renegotiation

Numbers change only with {{CLIENT_NAME}}'s explicit say-so (comfort moved, season
changed) — update this file when they do, and note the change in your own running notes
(`status/status.json`'s `notes` field is a fine place for a short log).
