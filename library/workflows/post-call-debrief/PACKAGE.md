# Post-Call Debrief (workflow)

The two minutes after a sales call, automated: you tell it how the call went, it writes
the structured summary, drafts your follow-up into **Drafts**, and updates your CRM —
each write waiting for your yes. Part of the core install; packaged here so you can
point at it, reinstall it, or add it later.

| Field | Value |
|---|---|
| **Name** | Post-Call Debrief |
| **Kind** | workflow |
| **Version** | 1.0.0 |
| **Requires** | Same as its sibling: the connector setup from the core install (`connectors/connector-checklist.md`) and the workflow AI key from `n8n/README.md`. Installing both workflows in one sitting is the natural move. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Post-Call Debrief workflow from my Orion folder.

1. Read library/workflows/post-call-debrief/PACKAGE.md, then follow
   n8n/README.md for the import of n8n/wf-02-post-call-debrief.json — walk me
   through it click by click if you can't do it directly.
2. Check the connector prerequisites first (connectors/connector-checklist.md)
   and tell me plainly which, if any, are missing.
3. Fill the workflow's placeholders (my email, business name, agent name) and
   finish the CRM mapping with my real CRM open.
4. Run the smoke test below (it's validation task VT-04), and only when it
   passes, record the install in status/status.json: checklist
   n8n_wf02_imported = true, and packages.post-call-debrief
   (kind "workflow", version "1.0.0", smoke_test_passed true).
5. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug post-call-debrief --kind workflow --version 1.0.0
```

## What it does

Call notes in → three things out: a structured debrief (what happened, what it means,
what's next), a follow-up message drafted in your voice into your Gmail Drafts, and a
CRM note + stage update gated behind your approve/decline email. Decline and your CRM
stays untouched.

## What it doesn't do

It doesn't record or transcribe calls — you tell it how the call went in your own
words, which is also exactly the training your agent learns your judgement from.

## Smoke test — prove it works

Run **VT-04** from `validation/validation-tasks.md`: debrief one real call from this
week.

**You'll know it worked when**: the summary reads like the call you were actually on,
the follow-up draft sits unsent in your Drafts, and the CRM note appears only after
your approve click. Then set the status fields from step 4 of the install prompt.

## Safety rails

Follow-up drafts run under your agent's tone and refusal rules (the VT-05 boundary).
Nothing in this lane can send or write without your explicit yes.

## Changelog

- 1.0.0 — 2026-07-25 — Packaged for the Library; the workflow itself
  (`n8n/wf-02-post-call-debrief.json`) ships unchanged from this kit's core install,
  where it was adapted from the coach-led kit's field-tested original.
