# Orion — self-install

This turns your own AI assistant into **Orion**: a personal sales agent that knows your
business, your customers, and how you actually sell — and helps with the parts of selling
that aren't talking to people (research, drafting, CRM admin, follow-up).

There's no coach in this. Your AI assistant runs the install with you, directly, using
this repo. You don't need to read any of the other files yourself — just get started below
and let it guide you.

## What you need

- Whatever AI assistant you already use — Claude, ChatGPT, or Copilot. If you use Claude
  Code (or another tool that can read and edit files), the install can do more for you
  automatically; otherwise you'll be walked through the same steps by hand. Either way
  works.
- That's genuinely it to get started. CRM, email, and calendar get connected as you go.

## Get started

**Option 1 — clone it** (if you're comfortable with git):
```
git clone <this-repo-url> my-orion
```

**Option 2 — no git needed**: click **Code → Download ZIP** above, and unzip it wherever
you like.

Either way, once you have the folder:

1. Open it with your AI assistant (drag the folder into Claude Code / Cursor, or upload the
   files if you're on a web chat).
2. Say something like **"let's get started"**.
3. It takes it from there — it'll introduce itself, ask about your business in your own
   words, and walk you through connecting your CRM, email, and calendar one step at a time.

You can stop at any point — close the window, come back tomorrow, even switch to a
different AI assistant — and it'll pick up exactly where you left off.

## What this will never do

- **Nothing sends without your yes.** Every message, every CRM update, every email your
  Orion agent drafts is shown to you first. It sends nothing on its own, ever.
- **It won't write anything that could embarrass you or your business.** If you ask for
  something that crosses a line, it'll say so plainly and suggest a better way, not just
  refuse and leave you stuck.
- **Nothing about your business goes anywhere without you knowing.** What little status
  information leaves your machine (so Daily Practice knows you're up and running, in case
  you need help) is disclosed in plain language, and you can turn it off — see
  `docs/intelligence-library-opt-in.md`.

## If you get stuck

Your AI assistant should be able to work through almost anything using this repo alone —
that's what it's built for. If it genuinely can't help, reach out to
**{{DAILY_PRACTICE_SUPPORT_CONTACT}}**.

---

*For Daily Practice maintainers evolving this repo itself (not installing it for a
client): see `specs/001-self-install/` and `.specify/memory/constitution.md`.*
