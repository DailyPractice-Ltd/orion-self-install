# Adapter — Microsoft Copilot

**Thin by design**: mechanics only. Behaviour lives in the
[agent definition](../agent-definition.md) — fix it there, not here.

Best fit when `{{CLIENT_AI_TOOL}}` = Copilot — typically a client inside a Microsoft 365
organisation.

## Install steps (Copilot agent — preferred, M365 Copilot licence)

1. **Create an agent**: Microsoft 365 Copilot → *Create agent* (Copilot Studio agent
   builder / declarative agent). Name it `{{AGENT_NAME}}`. Keep it private to the client.
2. **Instructions**: paste the assembled system prompt from `agent-definition.md`
   (placeholders filled). Copilot's instruction field is length-limited — same rule as
   the ChatGPT adapter: rules and task list stay verbatim, business detail lives only in
   the knowledge files.
3. **Knowledge**: add the seven knowledge-base files and both core skill files named in
   the agent definition's setup notes. Name the skill files
   `prospect-research-outreach.md` and `post-call-debrief.md` when adding them. Use file
   uploads or a dedicated SharePoint/OneDrive folder containing these nine files.
4. **Actions/plugins**: only the connectors the checklist names (CRM read-and-write, email read, draft and
   send, calendar read). Verified 4 November 2026: the agent scores by hand from
   `agent/risk-matrix.md`, says so, and the waiting list is `status/waiting.md`, handed
   over and read out at the start of each conversation. The gate is rule 1 of the agent definition: every message is scored; a
   Copilot agent cannot send on its own, so here every message waits for the
   client (agent-definition rule 1). In
   a work/organisation tenant, an admin may need to approve the agent — if the client
   mentions this, tell them plainly it may take time and isn't something either of you can
   speed up.
5. **First-run check**: vocabulary check (one prospect-research task, read the draft back).

## Fallback (no agent-creation rights in the tenant)

Run in a standard Copilot chat pinned with the system prompt as the first message.
Supply the knowledge-base files and both core skills per session. If attachments are
unavailable, paste each file's text with its name above it. Tell the client to supply
the files again when starting a new chat.

## Known quirks

- Tenant data-loss-prevention policies can silently block file knowledge — check with a
  retrieval question ("what does knowledge base §7 say?") right after setup, not later.
- Copilot may ground answers in other tenant content (emails, documents) beyond the
  knowledge base. Usually helpful; if drafts start pulling in the wrong context, ask the
  client whether their tenant admin can restrict the agent's knowledge scope.
