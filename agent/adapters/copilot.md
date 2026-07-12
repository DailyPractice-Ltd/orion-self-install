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
3. **Knowledge**: upload the seven knowledge-base files (or point the agent at a dedicated
   SharePoint/OneDrive folder containing exactly those seven files).
4. **Actions/plugins**: **none**. External actions run through n8n with approval gates. In
   a work/organisation tenant, an admin may need to approve the agent — if the client
   mentions this, tell them plainly it may take time and isn't something either of you can
   speed up.
5. **First-run check**: vocabulary check (one prospect-research task, read the draft back).

## Fallback (no agent-creation rights in the tenant)

Run in a standard Copilot chat pinned with the system prompt as the first message + the
knowledge-base files attached per session. Weaker persistence — tell the client this
plainly and log it as a known limitation.

## Known quirks

- Tenant data-loss-prevention policies can silently block file knowledge — check with a
  retrieval question ("what does knowledge base §7 say?") right after setup, not later.
- Copilot may ground answers in other tenant content (emails, documents) beyond the
  knowledge base. Usually helpful; if drafts start pulling in the wrong context, ask the
  client whether their tenant admin can restrict the agent's knowledge scope.
