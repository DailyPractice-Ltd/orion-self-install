# Attio Template

Shapes a fresh (or messy) Attio workspace into the Orion pipeline in minutes: stages
`Prospect → Lead → MQL → SQL → Deal → Customer`, an assessment-profile record, and three
daily-driving views. Stage definitions should match knowledge base §4 — same names, same
entry criteria.

## First time generating an Attio API key? Do this first

1. Log into Attio, then go to **Settings** (bottom-left, usually a gear icon) →
   **Developers** → **API keys**.
2. Click **Create API key**. Give it a name like "Orion install" so it's easy to find
   later.
3. Grant it **full data access** and **full configuration access** when asked — this is
   what lets the setup script create lists and fields.
4. Copy the key somewhere temporary (a notes app is fine) — Attio only shows it once.
   You'll paste it into one command below, then you can forget it.

## What gets created

1. **`Sales Pipeline` list** — with a `Stage` status attribute (the six stages, Customer
   celebrates 🎉) and working attributes: Next action (+ due date), Source channel,
   Last touch, Commitment served, Objection open, Staged draft waiting.
2. **`Harness Install` list** — exactly one entry: the assessment profile (industry,
   product, ICP, motion, AI tools, CRM, team size, maturity 1–5) plus install metadata
   (agent name, template version, install date). This mirrors `status/status.json` so the
   same information is visible inside the client's own CRM, not just a local file.
3. **Three views** (manual — see below): Daily Drive, Pipeline, Waiting on approval.

## Apply it — two ways, pick whichever fits

**If your AI assistant can run scripts for you** (Claude Code, Cursor, or similar — see
`agent/adapters/claude-code.md`): it can create all of this automatically once you've
pasted in the API key you just generated. No further reading needed — it'll handle the
command below itself.

**If not — no terminal, no code, entirely by hand in Attio's normal screens:**

You don't need to run anything. Just recreate the same shape yourself, directly in Attio's
web interface — it takes about 10 minutes:

1. Create a new list. Name it **Sales Pipeline**.
2. Add a status field called **Stage** with these six options, in this order: Prospect,
   Lead, MQL, SQL, Deal, Customer.
3. Add these other fields to the list: **Next action** (text), **Next action due**
   (date), **Source channel** (dropdown: Instagram, LinkedIn, Referral, Community, Email,
   Event, Other), **Last touch** (date), **Commitment served** (dropdown — use your own
   monthly commitments from knowledge base §7 as the options), **Objection open** (text),
   **Staged draft waiting** (checkbox).
4. Create a second new list. Name it **Harness Install** — this will hold exactly one
   entry, ever. Add these fields: Industry / vertical, Product / service, ICP description,
   Sales motion, AI tools in use, CRM in use, Team size, AI-sales maturity (1–5), Agent
   name, Template version, Installed on.
5. That's it — skip to "Views" below. You've just done, by hand, exactly what the script
   would have done automatically.

**If your assistant offered to run the script and you're not sure whether it worked**: ask
it to show you the Sales Pipeline list in your Attio account — if the six stages and
fields above are there, it worked.

<details>
<summary>For the technically inclined: the command the script runs</summary>

```bash
# From this directory (crm/attio/):
ATTIO_API_KEY=<the key you just generated> node apply-attio-template.mjs

# Re-runnable: existing lists/attributes are skipped, so it's safe to run again if
# something failed partway (including "I closed my laptop").
```
</details>

Once it's validated and working (either way), delete the API key from wherever you pasted
it — the ongoing workflows use their own separate credential (see
`connectors/connector-checklist.md`).

**Person vs company pipeline**: the template defaults to `"parent_object": "people"` —
right for a founder or individual seller selling to individuals. For a B2B motion, change
`parent_object` to `"companies"` in `attio-template.json` before applying.

## Views (2 minutes, in the UI)

Attio's public API doesn't create views, so build these three yourself in the workspace
UI on the `Sales Pipeline` list:

| View | Type | Filter | Sort | Purpose |
|---|---|---|---|---|
| **Daily Drive** | Table | `Next action due` ≤ today AND `Stage` ≠ Customer | `Next action due` ↑ | The morning list — your agent's Daily Drive task narrates this view |
| **Pipeline** | Kanban | — (group by `Stage`) | — | The at-a-glance board. Show Next action + due on cards |
| **Waiting on approval** | Table | `Staged draft waiting` is checked | `Last touch` ↑ | Everything your agent has staged that needs your yes |

## After applying

1. Create the single **Harness Install** entry and fill it in from your own knowledge
   base — plus `Agent name`, `Template version` (from this repo's `CHANGELOG.md`), and
   `Installed on`.
2. Replace the placeholder options on **Commitment served** with your own commitment
   activities from knowledge base §7 (e.g. "IG DMs", "Blog posts", "Forum engagements").
3. If you have existing contacts to migrate, add them to the pipeline at their honest
   current stage — this doubles as a good moment to get familiar with how the pipeline
   works.

## Mark this done

Once applied and the views exist, set `status/status.json`'s `crm_choice_made` and
`crm_template_applied` to `true`.
