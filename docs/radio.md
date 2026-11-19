# The radio — Orion's check-in with Daily Practice, in plain words

Orion uses a required two-way operational connection to Daily Practice. Pairing
links your signed-in account to this folder and does not check payment. Failed
connection checks pause supported work outside the one-time existing-user
transition. This is constitution Article V, channel 1, in plain words.

Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.

[Setup and recovery](setup.md) covers code renewal, interrupted setup, the 48-hour
connection allowance and paused-work recovery.

## What goes out, exactly

Three tiers, by how your yes is given — and nothing besides:

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
3. **"This machine now runs X"** — a Library install shares the package's name, kind,
   and version so Daily Practice knows whom to support when a package improves.
4. **Which template version this folder is on** — included with operational signals
   and reporting/support-message call headers, so
   Daily Practice can tell whether an update reached you. A label about this folder,
   never about your work.
5. **Messages arriving from Daily Practice** — the inbound half (see "What comes
   in"). Reading a message out sends nothing back.

**Tier 2 — your words, your yes each time**: your replies, and messages you choose to
start. Your sentences, sent only when you say yes in that conversation — never
automatically, and never a file. One message your AI will offer to send: if you wish
Orion did something it doesn't yet, it asks once whether to pass that wish to Daily
Practice as a request. Your words go only if you say yes. Daily Practice looks at
requests every Friday and tells you what it decided.

**Tier 3 — your artifacts, shown to you first**: a skill you choose to offer the
Library after reviewing exactly what it will send.

**Never, under any setting**: the content of your messages or drafts, your knowledge
base, your prospects or customers, anything from your CRM or email. The label tier
never carries content or names; your words and files cross only with your per-item
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
| This machine runs X (`report-install`) | A package passes its real-data smoke test | Orion, after the pass |
| Your message (`send`) | You have something to say to Daily Practice and say yes to sending it — your words | Your agent, on your yes in that conversation |
| A skill offered up (`contribute`) | You choose to offer a skill to the library, after seeing exactly what would be sent | Your agent, on your yes to the shown preview |

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

Sometimes the message is an offer: a skill from the Daily Practice library. Your AI
tells you which skill it is, what it needs and where it would go. Nothing is written
until you say yes.

A library skill is written for any business, so it leaves a gap where the business
name goes. As it lands, your harness fills that gap with your business name, from what
it already has on record. If the skill needs something your harness does not know,
such as your CRM's stage names, your AI asks you, one question at a time, and writes
your answer in. You see what will be filled in before you say yes. Nothing about you
is sent anywhere to do this: it happens on your machine.

Each message is read to you once. Your harness remembers what you have already heard,
so nothing is repeated at the next session.

## Pairing and the existing-user transition

Sign in at [Daily Practice](https://www.dailypractice.world/home/pair) and request
or renew your one-time code. It has twelve consonants in three groups, such as
`BCDF-GHJK-LMNP`, and expires in 15 minutes. Run `node start.mjs --code YOUR-CODE`
in your installed folder. It exchanges the code, saves the credential, verifies
that the server accepts this folder, and delivers the setup report before handoff.
Missing codes, failed verification and failed reports leave setup unfinished.

Ordinary folders store the returned key in `sharing.install_token`; a homed folder
uses machine-local `status/radio.key`, excluded from its home repository. Never
print a key or any suffix. Environment and supported cloud-attached credentials
still require a matching server check; local key shape is not proof of acceptance.

All unpaired harnesses must pair before normal work, including the first updated
run. Existing accepted credentials need no new code. Temporary verification or
reporting failures permit work silently for 48 elapsed hours after accepted
verification and acknowledged delivery of all queued reports. Only that complete
cycle refreshes `last_connected_at`; partial replay, failures, restarts and updates
never do. At exactly 48 hours, block the next task or scheduled run unless current
verification and delivery succeed. An admitted task may finish and report afterward.
Invalid/revoked credentials clear the allowance immediately. Disabled radio and
unsafe local state require recovery. Historical migration fields are readable but
inert; never infer the connection time from old verification or migration dates.
Preserve a declined choice until explicit pairing. Setup still requires current
accepted verification and acknowledged setup reporting.

Updating, inspection, diagnosis and re-pairing remain available. Website-only or
paste-only chat cannot run the guard; use Codex or Claude Code in this folder.

## If the radio can't get through

Run `node status/guard.mjs check --quiet` before every interactive Orion session
and scheduled run. Exit 0 permits work; exit 2 pauses tasks, outbound messages and
CRM writes. The guard uses the side-effect-free `/verify` endpoint, not the
support-message `/nudges` endpoint. A saved `verified` state is only history.

| Outcome | What to do |
|---|---|
| Accepted and no pending reports | Continue work; check support messages separately |
| Invalid or revoked key | Renew your code and run `node start.mjs --code YOUR-CODE` |
| Unreachable service after the allowance expires | Restore the network, then rerun the guard |
| Server error after the allowance expires | Rerun the guard once service is restored; preserve saved state |
| Pending reports after expiry, or unsafe local state at any time | Follow [recovery](setup.md); keep the outbox and original identities |

If the assistant's sandbox blocks the network, approve the required command and
retry. The [Codex adapter](../agent/adapters/codex.md) explains that surface. On a
company network, ask IT to allow HTTPS to `www.dailypractice.world`. Temporary failures permit silent work within the shared 48-hour allowance;
after expiry, new work waits for verified connection and complete delivery.

A report can fail after an allowed task. The task still happened: `done.mjs` keeps
its local work-log line, and the reporting helper writes its **labels and original
event time** to `status/radio-outbox.json` before attempting delivery. The guard
attempts replay at each task boundary. Pending reports use the same remaining
48-hour allowance, and never create a separate blocker or renew the clock. Retry preserves the original
identity, and bridge deduplication prevents duplicate counts. Lost or malformed
receipts keep the report pending; a successful connection alone never deletes it.

The queue contains only allowlisted signal and installed-package metadata: folder
identity, event type/time, stage/status/template version, public tag, count, routine
or skill/asset slug, kind/version and applicable enum labels. Package reports keep
the original installation time and version. It never contains credentials, local
work-log text, prospect names, client words, artifact content or a package's
free-text purpose. Tier 2 messages and Tier 3 contributions remain separate explicit
consent operations and never enter this operational queue. Corrupt data requires
repair rather than deletion. See [setup](setup.md) for safe lock recovery.

“Running” means finished work was reported in the last 14 days; a connection check
alone does not create activity. The requirement is a supported flow in editable
local files and native AI prompts, not tamper-proof licensing.

## Not the same thing as the Intelligence Library

There is one other, entirely separate channel: the **Intelligence Library** —
richer, anonymised usage patterns used to improve future versions of this kit. It is
**off by default** and stays off unless you explicitly turn it on; the radio's setting
has no effect on it, and vice versa. Full detail:
[intelligence-library-opt-in.md](intelligence-library-opt-in.md).
