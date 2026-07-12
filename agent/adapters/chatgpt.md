# Adapter — ChatGPT (OpenAI)

**Thin by design**: mechanics only. Behaviour lives in the
[agent definition](../agent-definition.md) — fix it there, not here.

Best fit when `{{CLIENT_AI_TOOL}}` = ChatGPT (Plus/Team+ for custom GPTs; on a free plan,
use the fallback below).

## Install steps (Custom GPT — preferred) — walk the client through these directly

1. **Create a GPT**: chatgpt.com → *GPTs → Create*. Name it `{{AGENT_NAME}}`. Set it
   **private** (only the client) — the knowledge base contains their business detail.
2. **Instructions**: paste the assembled system prompt from `agent-definition.md`
   (placeholders filled). If it exceeds the instructions character limit, keep the
   rules and task list verbatim and move the "Who you work for" details fully into the
   knowledge files (they're already there — just remove the duplicated lines).
3. **Knowledge**: upload the seven completed knowledge-base files with numbered filenames
   intact.
4. **Capabilities**: enable web browsing (prospect research needs it). **Disable** any
   Actions — external actions run through n8n with approval gates, never from the GPT
   itself.
5. **First-run check, right there in the conversation**: the vocabulary check — one
   prospect-research task, read the draft back, "does this sound like you?"

## Fallback (no custom-GPT plan)

Use a persistent chat: paste the system prompt as the first message with "these are your
standing instructions," then paste each knowledge-base file. Tell the client this is
slightly weaker — instructions can drift over a long conversation, so re-paste them if the
agent starts sounding generic again.

## Known quirks

- GPT knowledge retrieval is chunk-based; the numbered-section structure keeps references
  ("knowledge base §5") findable.
- ChatGPT may offer to "remember" facts about the client across chats — fine as a
  supplement, but the knowledge-base files stay the source of truth; update files, not
  memory, when something changes.
