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

Your **welcome pack** — a short note from Daily Practice with your client id, your
harness id, your key, and the radio address. No pack (or radio switched off) → nothing
is ever sent, even if check-ins are "on." The key is typed by you, hidden as you type,
stored only in your own `status/status.json`, and can be cancelled by Daily Practice
and reissued if it's ever lost. If the radio address doesn't answer, nothing is lost —
your harness just carries on and tries at the next natural moment.

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
