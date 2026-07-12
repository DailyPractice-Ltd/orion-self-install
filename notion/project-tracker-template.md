# Your Notion project tracker — page structure

A page the client sets up in their own Notion, to see their install progress and their
day-to-day commitments in one place, without needing to open `status/status.json`
directly. Optional but recommended — set it up around the same time as US1 (agent
identity), not as a blocker to anything else.

## Page structure

### 🚀 Install Progress

A simple checklist mirroring `status/status.json`'s `checklist` keys, grouped by stage:

- **Meet your agent**: business context, ICP & vocabulary, offer, methodology, tone,
  objections, commitments
- **Wire your CRM**: CRM chosen, template applied
- **Connect & validate**: CRM/email/calendar connected, workflows imported, VT-00
  through VT-08

The installing agent can update this checklist directly if it has Notion access, or the
client can tick items off themselves as their agent tells them each is done.

### 📊 My Commitments

A table mirroring knowledge base §7 — one row per commitment, columns: Activity, Monthly
target, This month's count so far, Pace (on/behind/ahead). This is the page the client
opens each morning, alongside their CRM's own Daily Drive view.

### 📝 Notes & Decisions

Free-form space for anything the client wants to remember between sessions with their
agent — a lighter-weight companion to `status/status.json`'s own `notes` field, in a place
the client actually looks at daily.

### 🔗 Quick Links

- Their CRM (Attio or HubSpot, or wherever their pipeline lives)
- Their n8n workspace
- This repository (their local copy)
- Support: **{{DAILY_PRACTICE_SUPPORT_CONTACT}}**

## Setting it up

1. Create a new Notion page, name it after the client's business (e.g. "Orion — Sugar
   Free Sundays").
2. Recreate the four sections above — a simple page with headings and a table is enough;
   no database or template gallery needed.
3. Fill "Install Progress" from whatever's already true in `status/status.json` at the
   time this page is created — don't start it from zero if the client is partway through.

## Why this exists separately from `status/status.json`

`status/status.json` is the machine-readable source of truth the installing agent reads
and writes automatically — it's not meant to be a pleasant page for a human to check daily.
This Notion page is the human-facing view of the same underlying progress, kept by the
client in a tool they already use for planning, not something this repository maintains
for them.
