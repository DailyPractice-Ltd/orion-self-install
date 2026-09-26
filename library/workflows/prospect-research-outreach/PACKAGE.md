# Prospect Research → Outreach (workflow)

The hand-off chain of prospecting, run by your own agent: you name a prospect, it
researches them, drafts outreach in your voice, parks the draft in your **Drafts**
folder, and asks your permission before anything touches your CRM. It's part of the
core install — this page packages it so you can point at it, reinstall it, or add it
later.

| Field | Value |
|---|---|
| **Name** | Prospect Research → Outreach |
| **Kind** | workflow |
| **Version** | 2.0.0 |
| **Requires** | The connector setup from the core install (`connectors/connector-checklist.md`): your email and {{CRM_NAME}} connected on the AI surface you use every day. Nothing else — no extra accounts, nothing billed separately. |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Prospect Research → Outreach workflow from my Orion folder.

1. Read library/workflows/prospect-research-outreach/PACKAGE.md and adopt its
   chain as a standing procedure: when I hand you a prospect, run research →
   staged outreach draft → my yes → CRM entry, in that order, every time,
   exactly as agent/agent-definition.md task 1 describes.
2. Check the connector prerequisites first (connectors/connector-checklist.md)
   and tell me plainly which, if any, are missing before we start.
3. Run the smoke test below (it's validation task VT-01), and only when it
   passes, record the install in status/status.json:
   packages.prospect-research-outreach (kind "workflow", version "2.0.0",
   smoke_test_passed true).
4. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug prospect-research-outreach --kind workflow --version 2.0.0
```

## What it does

A prospect's name in → research + drafted outreach out, with the two approval gates
that define this whole kit: the message lands as a **draft in your Drafts folder**
(sending it is your approval), and the CRM write waits for your explicit **yes in the
conversation**. Say no and nothing is written. There is no auto-send path in it to
switch on.

Want it to run without you asking? That's a hire: give the chain to a scheduled agent
(`library/HIRING.md`) and it becomes a shift with a report — the workflow is the
procedure, the hire is the clock.

## What it doesn't do

It won't find prospects for you — that's the [Prospecting](../../agents/prospecting/PACKAGE.md)
agent. This workflow does the per-prospect legwork once you know who.

## Smoke test — prove it works

Run **VT-01** from `validation/validation-tasks.md`: hand your agent one real prospect.

**You'll know it worked when**: a researched draft appears in your own Drafts folder
(sent by no one), your agent asks for your yes on the CRM entry, and your CRM shows the
new entry only after you give it. Then set the status fields from step 3 of the
install prompt.

## Safety rails

The draft is generated under your agent's system prompt, tone file and refusal line
included — the VT-05 boundary (no reputationally harmful outreach, ever) applies to
this lane exactly as it does to everything else.

## Changelog

- 2.0.0 — 2026-09-25 — Re-platformed onto the agent's own connectors: same chain, same
  two approval gates, no n8n, no separate AI account. The n8n lane this packaged
  (wf-01) was retired with template 1.0.0 — it never ran in a real install.
- 1.0.0 — 2026-07-25 — Packaged for the Library; the workflow itself
  (`n8n/wf-01-prospect-research-outreach.json`) shipped unchanged from this kit's core
  install, where it was adapted from the coach-led kit's field-tested original.
