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

## Import & set up

1. **Import** both JSON files into your own n8n workspace (Workflows → ⋯ → Import from
   file).
2. **Attach your credentials** from the connector checklist: the Anthropic/model API key
   your agent uses, Gmail OAuth2, and your CRM credential. The credential names in the
   JSON are placeholders — rebind each node to your own.
3. **Set workflow variables** (n8n → Variables):
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
   instead of silently.

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
