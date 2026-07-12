# n8n Starter Workflows

Two importable workflows that connect your agent to your actual Gmail, Calendar, and CRM
credentials (set up in [the connector checklist](../connectors/connector-checklist.md)).

| File | Flow | Matches agent task |
|---|---|---|
| `wf-01-prospect-research-outreach.json` | Prospect form → agent researches + drafts → **Gmail DRAFT** → approval email → (if approved) CRM pipeline entry | Task 1, prospect research |
| `wf-02-post-call-debrief.json` | Call form → agent debriefs (3 sections) → **follow-up DRAFT** → approval email → (if approved) CRM note + entry update | Task 2, post-call debrief |

## The approval architecture — this is the part that cannot be weakened

Nothing sends and nothing is written to your CRM without you saying yes, every single
time:

1. **Outreach/follow-up messages** are created as **Gmail Drafts**, never sent. You send
   from your own Drafts folder after reading — the act of sending is your approval.
2. **CRM writes** are gated behind an explicit **approve/decline email** sent to you, with
   two buttons. Decline and the CRM stays untouched; the workflow just ends.
3. There is **no auto-send path anywhere** in these workflows. If you ever want a faster
   path later, that's a deliberate future decision to make with a clear head — not
   something to loosen by editing a node without thinking it through.

## Before you import: these workflows need their own small separate account

This is worth knowing upfront, because it's easy to miss: **the chat conversation you have
with your agent, and these automated workflows, are two different things technically**,
even though they feel like one agent to you. Your everyday chat runs on whatever Claude/
ChatGPT/Copilot subscription you already have — nothing extra needed there. But these two
automated workflows (the ones that run when you submit a form, without you actively
chatting) need their own way to reach Claude, which means a separate account at
**console.anthropic.com** (Anthropic's developer site, different from claude.ai):

1. Go to console.anthropic.com and sign up (email, Google, or single sign-on all work).
2. You'll need to add a card under **Settings → Billing** — this account is billed
   separately, based on how much these two workflows are actually used (typically small
   for this — a few prospects and calls a day), not a flat subscription fee. Skipping this
   step is the single most common reason a brand-new key doesn't work, so don't skip it.
3. Click **API Keys** in the sidebar, then **Create Key**. Copy the key shown — like other
   keys in this repo, it's shown exactly once. If you ever lose it, you just make a new one
   — nothing is harmed by that.

**If this feels like a lot**: it's the one part of this whole install that genuinely can't
be avoided or done by hand instead — automated workflows need their own way to reach an AI
model, and this is that. It only needs doing once.

## Import & set up

1. **Import** both JSON files into your own n8n account (three dots in the top-right,
   then **Import from File** — pick each JSON file from your unzipped folder).
2. **Attach your credentials**: open each node in the imported workflow that needs one
   (n8n will show a warning on any node that isn't connected to a credential yet) and pick
   or create the matching one — the Anthropic key from just above, your Gmail connection,
   and your CRM connection, both already set up in the
   [connector checklist](../connectors/connector-checklist.md).
3. **Set a workflow variable** — n8n's term for a simple setting these workflows read
   (n8n → Variables):
   - `AGENT_SYSTEM_PROMPT` — the assembled system prompt from
     [`agent/agent-definition.md`](../agent/agent-definition.md), placeholders filled.
     Same prompt your chat agent uses — one identity, two surfaces.
4. **Replace the inline placeholders** in the workflow (your email address, business
   name, agent name) — your agent can do this for you if it's code-capable, or walk you
   through it click by click otherwise.
5. **Finish the CRM mapping**: the exact way a prospect record gets created/updated
   depends on which CRM template you applied — the JSON is flagged wherever this needs a
   small adjustment for your specific setup. Do this with your real CRM open, not test
   data.
6. **Error notifications**: create a third workflow from n8n's built-in error-trigger
   template that emails you "a workflow failed, here's why" and set it as the error
   workflow on both of the above. This is what makes a stale credential fail loudly
   instead of silently. **You'll know this one worked when**: it shows up as a third
   workflow in your list, and both WF-01 and WF-02 show it selected under their own
   Settings → Error Workflow.

**You'll know steps 1-2 worked when**: both workflows appear in your n8n workflow list
with no warning triangles on any node. A warning triangle means that node still needs a
credential picked — click it and fix that one before moving on.

## Wiring your commitments — the point of all this

These workflows exist to serve your own quantified "comfort +5%" numbers (knowledge base
§7). Practically:

- Put the **WF-01 form link** where the activity actually happens — a browser bookmark
  named after the commitment (e.g. "100 IG DMs/mo" → bookmark "New prospect →
  {{AGENT_NAME}}").
- The **`Commitment served`** field in your CRM ties each entry back to a commitment, so
  your Daily Drive view shows pace against your own numbers.

## Mark this done

Once both workflows import cleanly and connect to your credentials, set
`status/status.json`'s `n8n_wf01_imported` and `n8n_wf02_imported` to `true`. Then move on
to [validation](../validation/validation-tasks.md).
