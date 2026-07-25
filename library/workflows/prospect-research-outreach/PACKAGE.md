# Prospect Research → Outreach (workflow)

The form-triggered lane of prospecting: you submit a prospect's name, the workflow
researches them, drafts outreach in your voice, parks it in your **Drafts** folder, and
asks your permission before anything touches your CRM. It's part of the core install —
this page packages it so you can point at it, reinstall it, or add it later.

| Field | Value |
|---|---|
| **Name** | Prospect Research → Outreach |
| **Kind** | workflow |
| **Version** | 1.0.0 |
| **Requires** | The connector setup from the core install (`connectors/connector-checklist.md`): your n8n account, Gmail, {{CRM_NAME}}, and the workflow's own AI key (`n8n/README.md` explains that one honestly — it's the single unavoidable technical step in this kit). |

## Install prompt — copy this whole block and paste it to your AI

```text
Install the Prospect Research → Outreach workflow from my Orion folder.

1. Read library/workflows/prospect-research-outreach/PACKAGE.md, then follow
   n8n/README.md for the import of n8n/wf-01-prospect-research-outreach.json —
   walk me through it click by click if you can't do it directly.
2. Check the connector prerequisites first (connectors/connector-checklist.md)
   and tell me plainly which, if any, are missing before we start.
3. Fill the workflow's placeholders (my email, business name, agent name) and
   finish the CRM mapping with my real CRM open.
4. Run the smoke test below (it's validation task VT-01), and only when it
   passes, record the install in status/status.json: checklist
   n8n_wf01_imported = true, and packages.prospect-research-outreach
   (kind "workflow", version "1.0.0", smoke_test_passed true).
5. If my check-ins are on and you can run scripts, report the install:
   node status/radio.mjs report-install --slug prospect-research-outreach --kind workflow --version 1.0.0
```

## What it does

Form in → research + drafted outreach out, with the two approval gates that define
this whole kit: the message lands as a **Gmail Draft** (sending it is your approval),
and the CRM write waits for your explicit **approve/decline email**. Decline and
nothing is written. There is no auto-send path in it to switch on.

## What it doesn't do

It won't find prospects for you — that's the [Prospecting](../../agents/prospecting/PACKAGE.md)
agent. This workflow does the per-prospect legwork once you know who.

## Smoke test — prove it works

Run **VT-01** from `validation/validation-tasks.md`: submit one real prospect through
the form.

**You'll know it worked when**: a researched draft appears in your own Gmail Drafts
folder (sent by no one), the approval email reaches you, and your CRM shows the new
entry only after you click approve. Then set the status fields from step 4 of the
install prompt.

## Safety rails

The draft is generated under your agent's system prompt, tone file and refusal line
included — the VT-05 boundary (no reputationally harmful outreach, ever) applies to
this lane exactly as it does in chat.

## Changelog

- 1.0.0 — 2026-07-25 — Packaged for the Library; the workflow itself
  (`n8n/wf-01-prospect-research-outreach.json`) ships unchanged from this kit's core
  install, where it was adapted from the coach-led kit's field-tested original.
