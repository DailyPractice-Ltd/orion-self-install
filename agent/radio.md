# The radio — Orion's check-in with Daily Practice, in plain words

Orion uses a required two-way operational connection to Daily Practice. This page says
exactly what crosses it and when. This is constitution Article V, channel 1, in plain words.

Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.

Pairing, the before-work check, the connection allowance and recovery are in
[Install Orion](install.md).

## What goes out, exactly

Two tiers, by how your yes is given — and nothing besides:

**Tier 1 — required operational labels** (unchanged by the pairing requirement):

1. **"Here's which step I'm on"** — your install stage and a timestamp, so Daily
   Practice knows to check in if you seem stuck.
2. **"A piece of work finished"**: what kind of work it was, how many things were
   done, when, and what did it. The kind is one general tag from a short public menu
   (see "The tag menu" below), such as "prospecting". The count is a number: say, 18.
   What did it is the name of the skill that ran, if one did. This
   covers a task you set your AI in a session, Orion's scheduled work (work it does
   on a schedule), and the named moments in the table below. Never what was in
   the work, never who it was for.
3. **Which template version this folder is on** — included with operational signals
   and reporting/support-message call headers, so
   Daily Practice can tell whether an update reached you. A label about this folder,
   never about your work.
4. **Messages arriving from Daily Practice** — the inbound half (see "What comes
   in"). Reading a message out sends nothing back.

**Tier 2 — your words, your yes each time**: your replies, and messages you choose to
start. Your sentences, sent only when you say yes in that conversation — never
automatically, and never a file. One message your AI will offer to send: if you wish
Orion did something it doesn't yet, it asks once whether to pass that wish to Daily
Practice as a request. Your words go only if you say yes. Daily Practice looks at
requests every Friday and tells you what it decided.

**Never, under any setting**: the content of your messages or drafts, your knowledge
base, your prospects or customers, anything from your CRM or email. The label tier
never carries content or names; your words cross only with your per-item
yes, shown to you first.

## The tag menu

A finished task or shift carries one tag, so Daily Practice can see what kind of
work your harness is doing without ever seeing the work. The tag comes from this
menu, and only from this menu. When nothing fits, the tag is `other`. (The named
moments in the table below already name their own kind of work: an approved
outreach draft is outreach. They carry a tag only when your AI adds one.)

| Tag | The kind of work |
|---|---|
| `prospecting` | finding and researching who to talk to |
| `outreach` | messages, sequences, follow-up |
| `content` | collateral, posts, decks, webinars |
| `crm` | records and pipeline upkeep |
| `calls` | call prep, debriefs, meeting notes |
| `deals` | proposals, pricing, contracts |
| `accounts` | work on existing customers |
| `hiring` | recruitment and candidates |
| `finance` | invoices, numbers, bookkeeping |
| `admin` | inbox, calendar, files |
| `onboarding` | getting a person or client started |
| `research` | market, competitor or topic research |
| `reporting` | reviews, summaries, dashboards |
| `ops` | upkeep of the harness and the team itself |
| `other` | anything that fits nowhere above |

Your AI picks the tag when it reports. It cannot make one up: the script that
reports refuses any tag that is not on this menu.

## Exactly when each message fires — and when nothing does

Every outgoing message has one named moment. If a moment isn't in this table, nothing
is sent. Your AI saying good morning, answering a question, making a plan, thinking
out loud, or showing you a draft that still waits on your yes: none of that touches
the radio. A task you set that is now finished does. That is the "A task finished"
row. A message your agent sent on its own, inside the risk level you set, is a finished
task too: it reports as "A task finished" with the tag `outreach` and a count, and the
radio never learns your level, the score, or who it was to.

| Message | The one moment it fires | Sent by |
|---|---|---|
| "Here's which step I'm on" (`install_checkpoint`) | Verified setup finishes; your install moves to a new stage | The wizard / the status script — automatic |
| "A task finished" (`task_completed`) | A task you set your AI is finished: you have the thing you asked for, or the action is taken. One message per finished task. A finished task did at least one thing, so its count is 1 or more | Your agent, as the last step of the task (`node status/done.mjs`), with a tag, a count, and the name of the skill or agent that ran, if one did |
| "A run you approved" (`workflow_execution_completed`) | A multi-step run (like a prospect-research chain) finishes **and you approved its result** | Your agent, after your yes |
| "Outreach approved" (`outreach_approved`) | You say "send it" to a message that was waiting for you (one above your risk level) | Your agent, right after your yes |
| "Outreach declined" (`outreach_rejected`) | You say no to a message that was waiting for you (equally useful for improving the kit) | Your agent, right after your no |
| "Debrief done" (`debrief_completed`) | A post-call debrief finishes and its CRM update is written. No yes is asked: CRM writes are a standing scope | Your agent, right after the write |
| "CRM updated" (`crm_updated`) | Your agent performs a standalone CRM write inside your standing scope (not part of a debrief). No yes is asked | Your agent, right after the write |
| A scheduled task ran (`routine_completed`) | Orion completes a task in Codex scheduled tasks or Claude Routines. A run may report count zero when it checked for work and found none. | Orion runs `node status/done.mjs --shift` with a tag, count, and skill when applicable |
| Your message (`send`) | You have something to say to Daily Practice and say yes to sending it — your words | Your agent, on your yes in that conversation |

Three rules sit under that table.

First, every real-work message **follows work you asked for or approved**: a task you
set in a session, an action you said yes to, a CRM write under your standing scope, or a scheduled task you set up in the native scheduler. The radio never learns
about anything you didn't ask for or approve.

Second, it's **one message per piece of work**. The most specific label wins, and
there are never two for the same piece of work. A CRM update is "CRM
updated", not also "A task finished". A shift that used a skill is one message that
names the skill.

Third, it's **the labels, the count, and the time. Never the content.** When your AI
reports finished work it also writes one line about it for your own records: in
`status/work-log.md` for a task you asked for, in `status/shift-log.md` for a shift.
That line never leaves your machine.
The script that reports (`status/done.mjs`) does not pass it to the radio, and it
has no way to send free text at all. It also refuses a line that looks like a key,
a token or a password, so one never lands in a log.

## What comes in

Short plain-language messages from Daily Practice — think *"Your follow-up agent hasn't
run in 6 days — want us to take a look?"*. After the pre-work guard allows a session, your AI checks the
radio for support messages, reads anything waiting out loud, and asks what you'd like to do. **A reply is
sent only when you say yes, in that conversation, and it's your words that go.** No
reply happens on its own.

Each message is read to you once. Your harness remembers what you have already heard,
so nothing is repeated at the next session.

## The report queue

A report can fail after an allowed task. The task still happened: `done.mjs` keeps its
local work-log line, and the reporting helper writes the report's **labels and original
event time** to `status/radio-outbox.json` before attempting delivery. Retries keep the
original identity, so Daily Practice never counts the same work twice. Lost or malformed
receipts keep a report pending: a successful connection alone never deletes it.

The queue contains only allowlisted signal and installed-package metadata: folder
identity, event type/time, stage/status/template version, public tag, count, routine
or skill/asset slug, kind/version and applicable enum labels. It never contains
credentials, local work-log text, prospect names, client words, artifact content or a
package's free-text purpose. Tier 2 messages remain separate explicit-consent
operations and never enter this queue.

“Running” means finished work was reported in the last 14 days; a connection check
alone does not create activity.
