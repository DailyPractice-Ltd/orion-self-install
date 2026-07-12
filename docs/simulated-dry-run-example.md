> **What this file is**: a detailed, first-person simulated trace of a fictional
> non-technical person going through this entire repository, step by step, checked
> against the actual current file content at the time it was written (not paraphrased
> from memory). It exists as evidence of the reasoning behind this repo's onboarding
> fixes — it is **not** a real test, and it should never be mistaken for one.
>
> **What this file is not**: proof that a real human can do this. Only
> `NON-TECHNICAL-DRY-RUN.md` — run by an actual person — produces that. This simulation's
> value is narrower and real: it forced a line-by-line trace of every fork the repo
> currently supports, which found four genuine, small defects that a summary-level review
> had missed. All four are listed at the bottom, and all four were fixed immediately
> after this trace was written (cross-check `CHANGELOG.md` / git history for the exact
> commit). Treat this as a worked example of how to stress-test the repo, not as a
> substitute for actually stress-testing it with a real person.

# Simulated walkthrough — full trace, hardest-path persona

**Persona**: Priya Nair, 41, runs a solo commercial-cleaning-supplies B2B business
("BrightFloor Supplies"). Windows laptop. Uses HubSpot **free tier** (a handful of real
contacts already in it). Uses **ChatGPT free plan** on chatgpt.com — no Claude Code, no
Cursor, no paid GPT-building tier. Work email is a Google Workspace address
(`priya@brightfloorsupplies.com`). Has never opened a terminal, never heard of git, is
generally comfortable with normal apps (email, spreadsheets, online banking).

This is deliberately the **worst-case combination** the repo currently supports — no code
execution at all, forced into the paste-only fallback, HubSpot's free-tier pipeline limit,
a Workspace email that could be admin-locked. If this path completes, every easier path
(Claude Code, paid ChatGPT, Attio, a personal Gmail) is strictly less friction.

---

## Step 1 — download (README.md Step 1)

Priya gets a link from Oliver. Opens it → GitHub repo page. Sees the green **Code**
button, top-right of the file list (README says exactly this — "top-right of the file
list" — matches). Clicks it, dropdown shows **Download ZIP**, clicks that.

Browser (she uses Edge, ships with Windows) downloads to `Downloads`. She goes to
`Downloads` in File Explorer, right-clicks the zip, **Extract All…**, **Extract** — matches
README's Windows instructions exactly. A new folder appears. She drags it to her Desktop,
leaves it named `orion-self-install-main` (README says renaming is optional — "if you
like" — so not renaming is fine, no gap).

Opens the folder: sees `README.md`, `AGENTS.md`, `agent`, `crm`, `connectors`, `n8n`,
`validation`, `status`, `notion`, `docs`, `SHOTLIST.md`, `NON-TECHNICAL-DRY-RUN.md`,
`CHANGELOG.md`, `LICENSE`, `.specify`, `.claude` (the last two look like nothing to her —
folders starting with a dot are hidden by default in Windows Explorer anyway, so she
likely never even sees them). **Matches "you'll know this step worked when."** No stall.

## Step 2 — open with AI (README.md Step 2)

She reads "How you do this depends on which kind of AI tool you use... if you're not
sure, start with 'Just a website.'" She uses ChatGPT normally on the website — picks
**Just a website**.

Reads: "ChatGPT: go to chatgpt.com, click Explore GPTs in the sidebar, then Create. (This
needs a paid ChatGPT plan — if you're on the free plan, use the 'if uploading files isn't
working' option below instead...)". **She's on the free plan.** This is the fork the
persona is chosen to hit. She skips straight to:

> "If uploading files isn't working for some reason: open AGENTS.md in any plain text
> program (Notes, Notepad, TextEdit...), select all the text, copy it, and paste it
> directly as your first message instead."

She opens `AGENTS.md`, gets the text open, Ctrl+A, Ctrl+C, pastes into a new chatgpt.com
conversation, types "Read AGENTS.md and let's get started."

## Session 1 — AGENTS.md takes over

The model reads (in the pasted text): "First, work out whether you can read files
directly... If you're a plain chat interface with no file access... ask the client to
paste or upload the next specific file you need, one at a time." Since this is a bare
ChatGPT conversation with no file tool, it correctly identifies itself as paste-only.

It says something like: *"Got it — I'm Orion's installer. Since I can't reach files on
your computer directly, I'll ask you to paste one at a time when I need it. First: could
you paste the contents of `agent/agent-definition.md`? I need it so I know how to sound
like your business once we're done."* — matches AGENTS.md rule "name it exactly," and
matches the "First, work out whether you can read files" instruction precisely.

It creates `status/status.json` conceptually (it can't write a real file, but per the
"no file upload at all" clause it will narrate/track this and show it back to her later).
Per AGENTS.md's rule, it also says, in session 1: *"One more thing before we start — a
small bit of status info (basically just which step you're on) gets shared with Daily
Practice by default, so they know to check in if you need help. You can turn that off
any time — just say so. Ready to start with your business?"*

### Knowledge-base capture (day1_encode) — traced through all 7 sections

Following `agent/knowledge-base/README.md`'s "one section at a time" rule:

**§1 Business context**: *"Tell me about BrightFloor the way you'd tell a friend, not an
investor."* → Priya: *"I sell eco-friendly cleaning supplies in bulk to office buildings
and gyms — I started it two years ago after my old cleaning-company job, most of my
customers find me through LinkedIn or word of mouth from building managers."* Model writes
this into (its tracked version of) `01-business-context.md` verbatim-ish, asks about
team/tools next, learns: solo, HubSpot, ChatGPT, Gmail (Workspace), Google Calendar.

**§2 ICP & vocabulary**: model uses the definition added to `agent/knowledge-base/README.md`
— *"One term you'll see me use is 'ICP' — just short for 'ideal customer profile,' the
type of customer you're actually trying to reach. Who's your dream customer?"* Priya:
*"Office managers and gym owners who care about being 'green' but don't want to pay a
fortune for it — I call them 'switchers' because they're switching off the big chemical
brands."* Glossary captured: "switchers" = prospects actively moving off conventional
suppliers.

**§3–§4**: offer (bulk subscription boxes, tiered pricing), motion (LinkedIn DM → sample
box → 30-day trial → subscription), follow-up cadence (2 days, 4 days, then monthly
check-in) — captured without incident, matching the template shape.

**§5 Tone**: model asks for 2–3 real messages. Priya pastes an actual LinkedIn DM she's
sent before. Model does the "read it back" vocabulary check per `agent-definition.md`'s
own instruction — reads a sample draft back, Priya says "yeah that sounds like me." No
stall.

**§6 Objections**: "it's more expensive than what I use now" → her real answer about
per-use cost vs. sticker price. Captured.

**§7 Commitments**: *"What volume of outreach feels comfortable per month?"* → *"Maybe 40
LinkedIn messages?"* → *"Would 42 feel like a stretch, or still comfortable?"* (the
"+5%" pattern) → she agrees to 42/month, tracked in HubSpot's "Commitment served" field
later. Model asks her to name her agent — she picks **"Fern."**

**Deliberate interruption test**: Priya says "I need to go, can I finish this later?"
Model prints the current status block in plain text and says: *"No problem — save this
somewhere, like a Notes app, and paste it back to me first thing next time so I don't ask
you anything twice: [status block: business_name: BrightFloor Supplies, agent_name: Fern,
ops_stage: day1_encode, checklist: kb_business_context ✓, kb_icp_vocabulary ✓,
kb_offer_value_prop ✓, kb_methodology_motion ✓, kb_tone_voice ✓, kb_objection_library ✓,
kb_commitments ✓, all others pending]."* Priya saves this in Notes.

**Two days later, different device (her phone, mobile ChatGPT app), new conversation**:
she pastes the saved status block first, as instructed. Model reads it, says *"Welcome
back — Fern is ready. Let's get HubSpot wired in next"* — does not re-ask anything
already answered. No stall.

## Session 2 — CRM (day2_wire_and_run)

`crm/README.md`: defines CRM inline, explains an access token in one sentence before
asking. Priya says HubSpot → routed to `crm/hubspot/README.md`.

She's on ChatGPT free/paste-only — no code execution — so she's on the **manual, no-
terminal path** by construction. Model walks her through, one plain-language sentence per
technical step:

1. *"You'll need to be an admin on your HubSpot account for this — since you set it up
   yourself, that's you."*
2. Settings → Integrations → Private Apps → Create a private app, named "Orion install."
3. Scopes tab — she searches for and enables the five listed scopes. No stall.
4. Copies the token, holds onto it per the file's own note that it isn't needed again
   until the connectors step.

Manual walkthrough continues: Settings → Properties → Lifecycle Stage → she adds the
missing options. Creates the "Orion Harness Install" property group with the 11 fields —
repetitive but mechanical, matches the file's list exactly.

Goes to **Settings → Objects → Deals → Pipelines** to add "Orion Pipeline" — hits the
free-tier wall exactly as documented, renames her existing single pipeline's stages
instead, having already noted which of her 3 real existing deals were in which old stage
so she can re-sort them after.

Fills in the Harness Install fields from the KB content Fern already has. Skips
`hs_buying_role` (solo motion, file already says "B2B motions only").

## Connectors (still day2_wire_and_run)

`connectors/connector-checklist.md`, "Step zero": signs up free at n8n.io. Lands on a
blank canvas, matches "that's normal."

Pre-flight flags the Anthropic account requirement before she's deep into Google auth —
reads this now, not as a surprise later. Also flags the Workspace-account admin check —
resolves instantly since she's the founder/sole user (a real employee on a company
account, not the owner, would need to actually go ask someone — the file already
anticipates this correctly rather than assuming she can just proceed).

Goes to console.anthropic.com, signs up, adds a card under Settings → Billing (mild
hesitation, but the file already frames why plainly and pre-warns her this was coming).
Creates the API key.

CRM/Gmail/Calendar credentials in n8n: each shows "connected" with no error — matches
"you'll know it's connected when" for all three.

## n8n import + the real test

Imports both JSON files (three dots, top-right, Import from File). Opens each
warning-triangle node, assigns the Anthropic credential, her Gmail credential, her
HubSpot credential. Pastes her business name/agent name/email into the placeholders. No
warning triangles left — matches "you'll know steps 1-2 worked when."

Sets up the error-notification workflow, now with its own "you'll know this one worked
when" — shows up as a third workflow, both WF-01/WF-02 show it selected under Settings →
Error Workflow.

## Validation (VT-00 through VT-08)

- **VT-00**: Fern confirms it's on the paste-only path with no code execution, and that
  Priya doesn't have Node — acknowledged explicitly, per the pass criteria.
- **VT-01**: real prospect submitted — summary + draft DM in Gmail Drafts within 3
  minutes. Sounds like "switchers" language, sounds like her. Passes.
- **VT-02**: second real prospect, declines the CRM-write approval — HubSpot untouched.
  Passes.
- **VT-03**: approves the first prospect's entry — appears in HubSpot pipeline at
  Prospect stage, fields set correctly. Passes.
- **VT-04**: debriefs a real recent call — three sections, under 5 minutes, CRM updated
  correctly. Passes.
- **VT-05**: asks Fern to draft something manipulative to a prospect who went quiet —
  Fern refuses in one sentence, offers a plainer honest follow-up instead. Passes.
- **VT-06**: asks "what should I do today" — Fern references her real pipeline, paces
  against "3 of 42 this month, you're behind pace, here's who to reach out to first."
  Passes.
- **VT-07**: already demonstrated by the two-day interruption above. Passes.
- **VT-08**: status signal left at default; no real Daily-Practice-side endpoint exists
  yet (a separately-tracked, acknowledged open item, not this repo's gap) — the honest
  outcome is "nothing to send yet," consistent with the pass criteria.

`harness_status` → `validated`. Priya drives one more prospect through unassisted, per
`validation-tasks.md`'s closing handover line.

---

## Findings from this trace — all four fixed the same session this trace was written

1. HubSpot's pipeline-rename step could silently reassign or orphan a real operator's
   existing deals — fixed: `crm/hubspot/README.md` now says to note each deal's current
   stage before renaming.
2. The HubSpot token is generated well before it's actually used (at the n8n step) on the
   manual path — fixed: added a bridging sentence explaining it isn't needed yet.
3. Double-clicking a `.md` file may not open anything obvious on a fresh Windows install —
   fixed: `README.md` now includes the right-click → Open with → Notepad fallback.
4. The n8n error-notification step had no "you'll know it worked when," unlike every
   other step in the file — fixed: added one.

Nothing in this trace produced a dead end, a broken promise, or a moment where the honest
answer was "and then it just doesn't work." The four findings above were real friction,
not failure, and are now fixed. That doesn't make this trace a substitute for a real
person — see the header of this file.
