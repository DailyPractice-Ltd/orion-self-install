# Adapter — Claude (claude.ai)

**Thin by design**: this file is *only* the mechanics of installing the
[agent definition](../agent-definition.md) on Claude. Behaviour lives in the definition;
if Claude needs a behavioural tweak that other tools don't, that's a definition bug —
fix it there.

Best fit when `{{CLIENT_AI_TOOL}}` = Claude (any paid plan; Projects requires Pro/Team+).

## Install steps — walk the client through these directly, one at a time

1. **Create a Project** in claude.ai named `{{AGENT_NAME}}` (the name the client chooses
   for their agent — they should see it every time they open the tool). Tell them: "this
   keeps your agent's setup and knowledge separate from your everyday chats."
2. **Project instructions**: paste the assembled system prompt from
   `agent-definition.md` (§ "System prompt", placeholders filled) into
   *Project settings → Instructions*. Paste as-is — no preamble.
3. **Project knowledge**: upload the seven completed knowledge-base files
   (`01-…` through `07-…`), keeping the numbered filenames so the section references
   in the prompt (e.g. "knowledge base §5") resolve unambiguously.
4. **Model**: default to the best available general model on the client's plan.
5. **First-run check, done with the client right there**: run the vocabulary check from
   `agent-definition.md`'s notes — one prospect-research task, read the draft back to
   them, "does this sound like you?"

## If the client can't do steps 1–4 themselves

Walk them through it live in the conversation, one click at a time — don't assume they know
what "Project settings" means or where to find it. If they're on a plan without Projects,
say so plainly and route them to the fallback in `chatgpt.md`'s "no plan" pattern (a
persistent chat, first message = instructions, re-pinned as needed) adapted for Claude.

## Known quirks

- Project knowledge is retrieved automatically — don't paste KB contents into the
  instructions as well (duplication drifts; the files are the single source).
- Connectors/MCP inside Claude are **out of scope for the agent layer** — CRM/email/
  calendar actions run through the n8n workflows, which carry the approval gates. Don't
  wire a send-capable connector directly into the Project.
