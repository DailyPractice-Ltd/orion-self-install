# CRM — which one, and how it gets wired in

**If you're the installing agent**: ask the client directly which CRM they use (or if they
don't have one yet), then follow the matching path below. Don't move on to connectors until
`status/status.json`'s `crm_choice_made` and `crm_template_applied` are both `true`.

## Decide which path

| Client's situation | Path |
|---|---|
| Uses **Attio** already | [`attio/README.md`](attio/README.md) |
| Uses **HubSpot** already | [`hubspot/README.md`](hubspot/README.md) |
| Uses something else (Pipedrive, Close, Salesforce, a spreadsheet…) | [`other-crm-manual-setup.md`](other-crm-manual-setup.md) |
| Has no CRM at all yet | [`other-crm-manual-setup.md`](other-crm-manual-setup.md) — same path; a spreadsheet is a valid starting CRM |

Both Attio and HubSpot ship with a **template + a script** that can set up the pipeline
shape automatically, *if* the client's AI assistant can run scripts (see
`agent/adapters/claude-code.md`). Everyone else — and anyone on a different CRM — follows
the same shape by hand. Neither path is a lesser option; the manual path is exactly as
valid an outcome, it just takes longer to click through.

## What "wiring it in" actually means

Regardless of CRM, the goal is the same three things:

1. A **pipeline** with stages the agent and workflows can read: roughly
   `prospect → lead → MQL → SQL → deal → customer` (exact stage names vary by CRM — see
   each path for specifics).
2. A place to record the client's own **assessment profile** (industry, ICP, offer,
   AI tools, team size) — so the agent has a durable home for context beyond the
   knowledge-base files.
3. **API access** the client generates themselves (an API key or private-app token) — used
   once to apply the template, then handed to the client's own n8n workflows for ongoing
   use. It is never stored in this repository and never sent to Daily Practice.

## Why this doesn't block the rest of the install

CRM setup can be fiddly and is often the first genuinely technical thing a non-technical
client encounters. It's deliberately sequenced *after* the knowledge-base and agent-
identity work (US1), not before — so a client who gets stuck here still has a working,
useful agent, and can pick CRM wiring back up later. `status/status.json` tracks this
independently for exactly that reason.
