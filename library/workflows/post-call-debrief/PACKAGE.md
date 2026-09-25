# Post-Call Debrief (workflow)

The two minutes after a sales call, handled by your own agent: you tell it how the call
went, it writes the structured summary, drafts your follow-up into **Drafts**, and
updates your CRM — each write waiting for your yes. Part of the core install; packaged
here so you can point at it, reinstall it, or add it later.

| Field | Value |
|---|---|
| **Name** | Post-Call Debrief |
| **Kind** | workflow |
| **Version** | 2.0.0 |
| **Requires** | Same as its sibling: the connector setup from the core install (`connectors/connector-checklist.md`) — email and {{CRM_NAME}} connected on your daily AI surface. Nothing extra, nothing billed separately. Installing both workflows in one sitting is the natural move. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Post-Call Debrief workflow from my Orion folder.

1. Read library/workflows/post-call-debrief/PACKAGE.md and adopt its chain as
   a standing procedure: when I debrief a call, produce the three labelled
   sections (Call Summary / CRM Update / Follow-up Draft), stage everything,
   and write to the CRM only on my yes — exactly as
   agent/agent-definition.md task 2 describes.
2. Check the connector prerequisites first (connectors/connector-checklist.md)
   and tell me plainly which, if any, are missing.
3. Run the smoke test below (it's validation task VT-04), and only when it
   passes, record the install in status/status.json:
   packages.post-call-debrief (kind "workflow", version "2.0.0",
   smoke_test_passed true).
4. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug post-call-debrief --kind workflow --version 2.0.0
```

## What it does

Call notes in → three things out: a structured debrief (what happened, what it means,
what's next), a follow-up message drafted in your voice into your Drafts, and a CRM
note + stage update gated behind your yes in the conversation. Say no and your CRM
stays untouched.

Want the debrief to trigger other work — a proposal draft, a scheduling touch? That's
a handoff: a hired agent can run "after a call" as its shift trigger
(`library/HIRING.md`, Q4's handoff lane), with this chain upstream.

## What it doesn't do

It doesn't record or transcribe calls — you tell it how the call went in your own
words, which is also exactly the training your agent learns your judgement from.

## Smoke test — prove it works

Run **VT-04** from `validation/validation-tasks.md`: debrief one real call from this
week.

**You'll know it worked when**: the summary reads like the call you were actually on,
the follow-up draft sits unsent in your Drafts, and the CRM note appears only after
your yes. Then set the status fields from step 3 of the install prompt.

## Safety rails

Follow-up drafts run under your agent's tone and refusal rules (the VT-05 boundary).
Nothing in this lane can send or write without your explicit yes.

## Changelog

- 2.0.0 — 2026-09-25 — Re-platformed onto the agent's own connectors: same three
  sections, same gates, no n8n, no separate AI account. The n8n lane this packaged
  (wf-02) was retired with template 1.0.0 — it never ran in a real install.
- 1.0.0 — 2026-07-25 — Packaged for the Library; the workflow itself
  (`n8n/wf-02-post-call-debrief.json`) shipped unchanged from this kit's core install,
  where it was adapted from the coach-led kit's field-tested original.
