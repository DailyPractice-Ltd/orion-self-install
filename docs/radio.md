# The radio — Orion's check-in with Daily Practice, in plain words

Orion can keep a small two-way radio open with Daily Practice. This page is the
whole story of what that means — what goes out, what comes in, how to say no, and what
saying no changes (nothing else). It is the plain-words version of the constitution's
Article V, channel 1; there is no fine print anywhere else.

## What goes out, exactly

Three tiers, by how your yes is given — and nothing besides:

**Tier 1 — labels, on by default** (the check-in switch covers all of these at once):

1. **"Here's which step I'm on"** — your install stage and a timestamp, so Daily
   Practice knows to check in if you seem stuck.
2. **"A piece of work finished"**: what kind of work it was, how many things were
   done, when, and what did it. The kind is one general tag from a short public menu
   (see "The tag menu" below), such as "prospecting". The count is a number: say, 18.
   What did it is the name of the skill or hired agent that ran, if one did. This
   covers a task you set your AI in a session, a hired agent's shift (work it does
   on a schedule), and the approval moments in the table below. Never what was in
   the work, never who it was for.
3. **"This machine now runs X"** — when you install a Library package or hire an
   agent, its name, kind, and version — and for a hire, which role it is: a label from
   [the public role menu](../library/ROLES.md) (or "custom"). That's how Daily
   Practice knows who's affected when a package is improved, and which roles teams
   actually hire.
4. **Which template version this folder is on** — stated on every radio call, so
   Daily Practice can tell whether an update reached you. A label about this folder,
   never about your work.
5. **Messages arriving from Daily Practice** — the inbound half (see "What comes
   in"). Reading a message out sends nothing back.

**Tier 2 — your words, your yes each time**: your replies, and messages you choose to
start. Your sentences, sent only when you say yes in that conversation — never
automatically, and never a file.

**Tier 3 — your artifacts, shown to you first**: a skill you choose to offer the
library (you see exactly what would be sent before it goes), and — when you hire an
agent — one sentence you approve at hire saying what that agent is for, read back to
you word for word before it is ever sent.

**Never, under any setting**: the content of your messages or drafts, your knowledge
base, your prospects or customers, anything from your CRM or email. The label tier
never carries content or names; your words and files cross only with your per-item
yes, shown to you first.

## The tag menu

A finished task or shift carries one tag, so Daily Practice can see what kind of
work your harness is doing without ever seeing the work. The tag comes from this
menu, and only from this menu. When nothing fits, the tag is `other`. (The approval
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
row.

| Message | The one moment it fires | Sent by |
|---|---|---|
| "Here's which step I'm on" (`install_checkpoint`) | You accept check-ins in the wizard; your install moves to a new stage | The wizard / the status script — automatic |
| "A task finished" (`task_completed`) | A task you set your AI is finished: you have the thing you asked for, or the action is taken. One message per finished task. A finished task did at least one thing, so its count is 1 or more | Your agent, as the last step of the task (`node status/done.mjs`), with a tag, a count, and the name of the skill or agent that ran, if one did |
| "A run you approved" (`workflow_execution_completed`) | A multi-step run (like a prospect-research chain) finishes **and you approved its result** | Your agent, after your yes |
| "Outreach approved" (`outreach_approved`) | You explicitly say yes to a staged outreach draft, in conversation | Your agent, right after your yes |
| "Outreach declined" (`outreach_rejected`) | You explicitly say no to a staged outreach draft (equally useful for improving the kit) | Your agent, right after your no |
| "Debrief done" (`debrief_completed`) | A post-call debrief finishes **and you approved its CRM update** | Your agent, after your yes |
| "CRM updated" (`crm_updated`) | Your agent performs a standalone CRM write **you approved** (not part of a debrief) | Your agent, right after the approved write |
| "A shift ran" (`routine_completed`) | A hired agent finishes a shift: work it does on a schedule, started by a clock or a handoff and not by a person. The standing yes you gave on its job sheet at hire covers exactly this report. A shift may report a count of 0: it ran and found nothing to do. ("Routine" is only the name on the wire. In plain words it is a shift.) | The agent, as the last step of the shift (`node status/done.mjs --shift`), with its name, a tag, and a count |
| "This machine runs X" (`report-install`) | A package's smoke test passes, or a hired agent's first run on real work passes. A hire carries its role label. The purpose sentence rides only after the job-sheet readback named it and you said yes | Your agent, right after the pass |
| Your message (`send`) | You have something to say to Daily Practice and say yes to sending it — your words | Your agent, on your yes in that conversation |
| A skill offered up (`contribute`) | You choose to offer a skill to the library, after seeing exactly what would be sent | Your agent, on your yes to the shown preview |

Three rules sit under that table.

First, every real-work message **follows work you asked for or approved**: a task you
set in a session, an action you said yes to, or a shift you approved once, at hire,
on the job sheet that names its schedule and this report. The radio never learns
about anything you didn't ask for or approve.

Second, it's **one message per piece of work**. The most specific label wins, and
there are never two for the same piece of work. An approved CRM update is "CRM
updated", not also "A task finished". A shift that used a skill is one message that
names the skill.

Third, it's **the labels, the count, and the time. Never the content.** When your AI
reports finished work it also writes one line about it for your own records: in
`status/work-log.md` for a task you asked for, in `status/shift-log.md` for a shift,
and in your memory log too when memory is on. That line never leaves your machine.
The script that reports (`status/done.mjs`) does not pass it to the radio, and it
has no way to send free text at all. It also refuses a line that looks like a key,
a token or a password, so one never lands in a log.

## What comes in

Short plain-language messages from Daily Practice — think *"Your follow-up agent hasn't
run in 6 days — want us to take a look?"*. At the start of a session, your AI checks the
radio, reads anything waiting out loud, and asks what you'd like to do. **A reply is
sent only when you say yes, in that conversation, and it's your words that go.** No
reply happens on its own.

Sometimes the message is an offer: a skill from the Daily Practice library. Your AI
tells you which skill it is, what it needs and where it would go. Nothing is written
until you say yes.

Each message is read to you once. Your harness remembers what you have already heard,
so nothing is repeated at the next session.

## The choice, and how it's put to you

During Press Start (or the first conversation, if you skipped the wizard), you're asked
once, in these words:

> Your harness checks in with Daily Practice so we can support you and count your
> system as running. It shares which step you're on, what kind of task finished (a
> general tag such as "prospecting", a count, and which skill or agent ran), and
> which packages you've installed. Never the content of your messages, your
> knowledge base, or your prospects. You can switch this off. Keep check-ins on?

"Running" has one meaning here: your harness reported finished work in the last 14
days. Work you asked for in a session counts, and so does work a hired agent did on
a schedule.

The box is pre-ticked — most people keep it, and it's genuinely how we spot problems
before you have to report them — and declining is one keystroke. Once you've answered,
you're never asked again.

## Saying no, now or later

- **At the wizard**: answer `n` to "Keep check-ins on?" — done.
- **Any time after**: open `status/status.json` (a plain text file in this folder) and
  change `"status_signal_enabled": true` to `false`. That single edit silences the
  radio entirely — every message in the table above, all three tiers, outbound and
  inbound alike.

**What changes when the radio is off: nothing else.** Every agent, package, workflow,
and validation task works identically. The only difference is that Daily Practice can't
see your system running — so if you want help, you reach out first
(support@dailypractice.world).

## What the radio needs before it can transmit at all

A **pairing code**, if Daily Practice has given you one — twelve letters in three
groups, like `BCDF-GHJK-LMNP`. All letters, no vowels, no numbers, so there is no `0`
that might be an `O` and no `1` that might be an `I`. Nobody hands you one automatically:
if you're going solo, there's no code to wait for, and the radio just stays off.

That code is the only thing you ever type, and typing it is the whole setup: your
machine sends it to Daily Practice, gets your key back, and stores that key in your own
`status/status.json` and nowhere else. (If your folder has been given a home of its own,
a private repository that you control, the key is kept in `status/radio.key` instead,
a file that is never saved to that home.) **The key does not exist until your machine asks
for it** — so there is never a moment when whoever gave you the code is holding your
key, or could paste it into a chat by mistake. The code works **once**, expires after
**15 minutes**, and is worthless to anyone who sees it after that.

No code yet (or the radio switched off) → nothing is ever sent, even if check-ins are
"on," and nothing else about your install is affected. Ask Daily Practice for a fresh
code any time — it takes two seconds, and the new one replaces the old.

Your key can be cancelled by Daily Practice and reissued (say, if it ever leaked). When
that happens the wizard notices by itself the next time you run it and simply asks for a
new code. If the radio address doesn't answer, nothing is lost — Orion carries on
and tries at the next natural moment.

## If the radio can't get through

The radio never blocks your work and never retries on its own — it says one plain line
and gets out of the way. What each line means:

| The line you see | What it means | What to do |
|---|---|---|
| "Radio quiet — no messages" | Everything works; nothing waiting | Nothing |
| "Radio is off (or not configured)" | Check-ins are off, or pairing never happened | Your choice — run `node start.mjs` to pair if you want it on |
| "The radio address didn't answer (…)" | The call left your machine and hit a wall — see below | One of the two fixes below |
| "that key isn't valid (401)" | Your key was revoked or replaced | Ask Daily Practice for a fresh pairing code |
| "Radio check answered 4xx/5xx" | Reached Daily Practice, answered oddly | Nothing — it tries again next session |

The command that reports a finished task (`node status/done.mjs`) calls the radio to
do it, so it prints these same lines. With the radio off it prints nothing about the
radio at all, and still writes your own line.

**"Didn't answer" has two usual causes:**

1. **Codex's safety sandbox** (most common). Codex blocks network calls by default.
   The one-time fix is in [`agent/adapters/codex.md`](../agent/adapters/codex.md):
   `network_access = true` under `[sandbox_workspace_write]` in `~/.codex/config.toml`,
   then prove it with one `check`.
2. **A company network** (corporate laptops). Company proxies and security tools often
   let your browser through but block command-line calls. Test: open
   `https://www.dailypractice.world/api/bridge/nudges` in your browser — an ugly
   technical error message means the address is reachable and the block is local to
   commands; a company block page means the network itself is filtering. Either way the
   ask for your IT team is one line: **allow HTTPS to `www.dailypractice.world`** — one
   address, standard port, a small check-in API. Until then, everything local keeps
   working, and your own records still get every line: the shift log for each
   shift, the work log for each finished task. Under each one that could not be
   reported, the script adds a line saying so, so nothing goes missing quietly.

## If your AI can't run commands (website-chat lane)

On a plain website chat there's no way for your AI to dial anywhere, so: the check-in
choice is still put to you in the same words and recorded in the same file — and the
radio simply doesn't get checked from your side. Daily Practice reaches you by
ordinary email instead. Same choice, same respect for it, slower lane — you lose
nothing except automation.

## Not the same thing as the Intelligence Library

There is one other, entirely separate channel: the **Intelligence Library** —
richer, anonymised usage patterns used to improve future versions of this kit. It is
**off by default** and stays off unless you explicitly turn it on; the radio's setting
has no effect on it, and vice versa. Full detail:
[intelligence-library-opt-in.md](intelligence-library-opt-in.md).
