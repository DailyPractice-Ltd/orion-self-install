# The radio — your harness's check-in with Daily Practice, in plain words

Your harness can keep a small two-way radio open with Daily Practice. This page is the
whole story of what that means — what goes out, what comes in, how to say no, and what
saying no changes (nothing else). It is the plain-words version of the constitution's
Article V, channel 1; there is no fine print anywhere else.

## What goes out, exactly

Four kinds of message, and nothing besides:

1. **"Here's which step I'm on"** — your install stage and a timestamp, so Daily
   Practice knows to check in if you seem stuck.
2. **"A task just ran"** — the *type* of task (say, "a post-call debrief completed") and
   when. Never what was in it.
3. **"This machine now runs X"** — when you install a Library package, its name, kind,
   and version. That's how Daily Practice knows who's affected when a package is
   improved.
4. **Your replies** — if Daily Practice sends you a message (below) and you choose to
   answer, your answer goes back.

**Never, under any setting**: the content of your messages or drafts, your knowledge
base, your prospects or customers, anything from your CRM or email. The radio carries
labels and timestamps, not contents.

## Exactly when each message fires — and when nothing does

Every outgoing message has one named moment. If a moment isn't in this table, nothing
is sent — your AI saying good morning, answering questions, drafting, thinking out
loud: none of that ever touches the radio.

| Message | The one moment it fires | Sent by |
|---|---|---|
| "Here's which step I'm on" (`install_checkpoint`) | You accept check-ins in the wizard; your install moves to a new stage | The wizard / the status script — automatic |
| "A task just ran" (`workflow_execution_completed`) | A multi-step run (like a prospect-research workflow) finishes **and you approved its result** | The workflow's radio node, or your agent after your yes |
| "Outreach approved" (`outreach_approved`) | You explicitly say yes to a staged outreach draft, in conversation | Your agent, right after your yes |
| "Outreach declined" (`outreach_rejected`) | You explicitly say no to a staged outreach draft (equally useful for improving the kit) | Your agent, right after your no |
| "Debrief done" (`debrief_completed`) | A post-call debrief finishes **and you approved its CRM update** | The debrief workflow's radio node, or your agent after your yes |
| "CRM updated" (`crm_updated`) | Your agent performs a CRM write **you approved**, outside the workflows | Your agent, right after the approved write |

Three rules sit under that table: every real-work message is **downstream of your
explicit yes** on the work itself (the radio never learns about anything you didn't
approve); it's **one message per moment** (the most specific label wins — never two for
the same event); and it's **the label and the time, never the content**.

## What comes in

Short plain-language messages from Daily Practice — think *"Your follow-up agent hasn't
run in 6 days — want us to take a look?"*. At the start of a session, your AI checks the
mailbox, reads anything waiting out loud, and asks what you'd like to do. **A reply is
sent only when you say yes, in that conversation, and it's your words that go.** No
reply happens on its own.

## The choice, and how it's put to you

During Press Start (or the first conversation, if you skipped the wizard), you're asked
once, in exactly this spirit:

> Your harness checks in with Daily Practice so we can support you and count your
> system as running. You can switch this off.

The box is pre-ticked — most people keep it, and it's genuinely how we spot problems
before you have to report them — and declining is one keystroke. Once you've answered,
you're never asked again.

## Saying no, now or later

- **At the wizard**: answer `n` to "Keep check-ins on?" — done.
- **Any time after**: open `status/status.json` (a plain text file in this folder) and
  change `"status_signal_enabled": true` to `false`. That single edit switches off all
  four message kinds at once.

**What changes when the radio is off: nothing else.** Every agent, package, workflow,
and validation task works identically. The only difference is that Daily Practice can't
see your system running — so if you want help, you reach out first
(support@dailypractice.world).

## What the radio needs before it can transmit at all

A **pairing code** — twelve letters in three groups, like `BCDF-GHJK-LMNP`, read out to
you by your coach on the call. All letters, no vowels, no numbers, so there is no `0`
that might be an `O` and no `1` that might be an `I`.

That code is the only thing you ever type, and typing it is the whole setup: your
machine sends it to Daily Practice, gets your key back, and stores that key in your own
`status/status.json` and nowhere else. **The key does not exist until your machine asks
for it** — so there is never a moment when your coach is holding your key, or could
paste it into a chat by mistake. The code works **once**, expires after **15 minutes**,
and is worthless to anyone who sees it after that.

No code yet (or the radio switched off) → nothing is ever sent, even if check-ins are
"on," and nothing else about your install is affected. Ask for a fresh code any time —
it takes your coach two seconds, and the new one replaces the old.

Your key can be cancelled by Daily Practice and reissued (say, if it ever leaked). When
that happens the wizard notices by itself the next time you run it and simply asks for a
new code. If the radio address doesn't answer, nothing is lost — your harness carries on
and tries at the next natural moment.

## If your AI can't run commands (website-chat lane)

On a plain website chat there's no way for your AI to dial anywhere, so: the check-in
choice is still put to you in the same words and recorded in the same file — and the
mailbox simply doesn't get checked from your side. Daily Practice reaches you by
ordinary email instead. Same choice, same respect for it, slower lane — you lose
nothing except automation.

## Not the same thing as the Intelligence Library

There is one other, entirely separate channel: the **Intelligence Library** —
richer, anonymised usage patterns used to improve future versions of this kit. It is
**off by default** and stays off unless you explicitly turn it on; the radio's setting
has no effect on it, and vice versa. Full detail:
[intelligence-library-opt-in.md](intelligence-library-opt-in.md).
