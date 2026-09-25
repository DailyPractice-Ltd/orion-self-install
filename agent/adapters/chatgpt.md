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
4. **Capabilities**: enable web browsing (prospect research needs it). Connect only the
   connectors the checklist names (CRM, email, calendar). The approval gate is the
   agent's own rules — drafts only, nothing sends without the client's yes — the tool
   never gets a send path the rules don't gate.
5. **First-run check, right there in the conversation**: the vocabulary check — one
   prospect-research task, read the draft back, "does this sound like you?"

## Fallback (no custom-GPT plan)

Use a persistent chat: paste the system prompt as the first message with "these are your
standing instructions," then paste each knowledge-base file. Tell the client this is
slightly weaker — instructions can drift over a long conversation, so re-paste them if the
agent starts sounding generic again.

## The radio

The radio does not run here, by design: a chat surface can't run scripts, so the
check-in channel is carried by the client's code-capable sessions (Codex or Claude
Code — see those adapters) and, once hired, by their agents' scheduled routines.
Two consequences to say out loud, once, so nobody is surprised later:

- Work done only in this surface is invisible to Daily Practice — real and valuable,
  just unreported. If the client wants their work counted, the sales actions that hit
  the enumerated signal moments belong in a code-capable session or a routine.
- Never simulate a radio check or a signal from here, and never claim one happened.
  "This surface can't reach the radio" is the honest sentence.

(Actions stay disabled per the install steps above. A signals-only Action that would
give this surface a voice is a considered future design, not something to improvise —
it moves a credential into the GPT and needs its own review.)

## Known quirks

- GPT knowledge retrieval is chunk-based; the numbered-section structure keeps references
  ("knowledge base §5") findable.
- ChatGPT may offer to "remember" facts about the client across chats — fine as a
  supplement, but the knowledge-base files stay the source of truth; update files, not
  memory, when something changes.
