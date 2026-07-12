# HubSpot Template

The HubSpot equivalent of the Attio template — shapes a client's HubSpot portal into the
Orion pipeline. Stage definitions should match knowledge base §4.

## First time generating a HubSpot private app token? Do this first

You'll need to be an admin on your HubSpot account for this step — if you're not sure,
that's worth checking before you start (whoever set up your HubSpot account will know).

1. In HubSpot, go to **Settings** (gear icon, top-right) → **Integrations** →
   **Private Apps**.
2. Click **Create a private app**. Name it something like "Orion install."
3. Under the **Scopes** tab, search for and enable: `crm.schemas.contacts.write`,
   `crm.schemas.companies.write`, `crm.objects.deals.write`, `crm.objects.contacts.write`,
   `crm.objects.companies.write`.
4. Click **Create app**, confirm, then copy the access token shown — HubSpot only shows it
   once. Paste it somewhere temporary; you'll use it in one command below, then can forget
   it.

**If your screen doesn't match this exactly**: HubSpot's exact menu wording shifts between
account types and over time. Search Settings for "private app," or ask your AI assistant
to help you find it — the end result (a token you copy once) is what matters, not the
exact click path.

## How this differs from the Attio template

HubSpot's funnel stage lives on a **standard property** (`lifecyclestage`) every portal
already has — there's no "create a pipeline list" step like Attio. What this template
actually does:

1. **Ensures `lifecyclestage` has the right option set** (1. Prospect … 9. Subscriber) —
   adds missing options, leaves existing ones alone.
2. **Creates the assessment-profile properties** (industry, product, ICP, motion, AI
   tools, CRM, team size, maturity, agent name, template version, installed on) as a
   custom property group on Contacts (and Companies, for a B2B motion) — mirrors
   `status/status.json` so the same information is visible inside your own CRM.
3. **Creates (or flags for manual rename) a Deal pipeline** — see the plan-tier note
   below, this is the one step that may need a manual Settings action.

## Plan-tier caveat (important)

HubSpot's Starter/Free tiers support **only one Deal pipeline per portal**. If you're on
that tier:
- The apply script detects it and skips pipeline creation.
- **Rename your existing default pipeline instead**, in Settings → Objects → Deals →
  Pipelines. This is a Settings-level action, not reachable via the API — expect the same
  boundary on most CRMs, including Attio (its views have the identical limitation).

## Apply it — two ways, pick whichever fits

**If your AI assistant can run scripts for you** (Claude Code, Cursor, or similar — see
`agent/adapters/claude-code.md`): it can create all of this automatically once you've
pasted in the token you just generated. No further reading needed — it'll handle the
command below itself.

**If not — no terminal, no code, entirely by hand in HubSpot's normal screens:**

You don't need to run anything. Just recreate the same shape yourself, directly in
HubSpot's settings — it takes about 10 minutes:

1. Go to **Settings → Properties**, find the **Lifecycle Stage** property on Contacts, and
   edit it to make sure these options all exist (add any that are missing, leave any
   existing ones alone): 1. Prospect, 2. Lead, 3. MQL, 4. SQL, 5. Deals (Opportunity),
   6. Customer, 7. Evangelist, 8. Closed/Lost, 9. Subscriber.
2. Still in **Settings → Properties**, create a new group called **Orion Harness
   Install**, and add these fields to it: Industry / vertical, Product / service, ICP
   description, Sales motion, AI tools in use, CRM in use, Team size, AI-sales maturity
   (1–5), Agent name, Template version, Installed on.
3. Go to **Settings → Objects → Deals → Pipelines**. If you're allowed to add a new one,
   create **Orion Pipeline** with stages: Prospect, Lead, MQL, SQL, Deal, Closed Won,
   Closed Lost. **If HubSpot won't let you add a new pipeline** (this is normal on
   free/starter plans — HubSpot allows only one per account), just rename your existing
   default pipeline's stages to match instead.
4. That's it — skip to "After applying" below. You've just done, by hand, exactly what the
   script would have done automatically.

**If your assistant offered to run the script and you're not sure whether it worked**: ask
it to show you the Lifecycle Stage options on a Contact — if the nine options above are
there, it worked.

<details>
<summary>For the technically inclined: the command the script runs</summary>

```bash
# From this directory (crm/hubspot/):
HUBSPOT_API_KEY=<the token you just generated> node apply-hubspot-template.mjs

# Re-runnable: existing properties/options are skipped, so it's safe to run again if
# something failed partway.
```
</details>

Once validated (either way), deactivate the private app — ongoing workflows use their own
separate credential (see `connectors/connector-checklist.md`).

## After applying

1. Fill the assessment-profile properties on your own Harness Install contact/company
   record — same fields as `status/status.json`.
2. Set `hs_buying_role = DECISION_MAKER` on the decision-maker contact, associated to
   their company (standard HubSpot property — no new field needed) — B2B motions only.
3. If the pipeline step was skipped (plan tier), rename the default pipeline by hand and
   confirm the stages match `hubspot-template.json`'s `deal_pipeline.stages` (or your own
   equivalent — the funnel→lifecyclestage mapping is what must match exactly, the Deal
   pipeline stage *names* can vary).
4. Currency: HubSpot portals default to whatever was set at signup — check Settings →
   Currency if you'll be quoting in a currency the portal doesn't support yet.

## Attio vs HubSpot at a glance

| | Attio | HubSpot |
|---|---|---|
| Funnel stage | Custom `Stage` attribute on a new `Sales Pipeline` list | Standard `lifecyclestage` property (options extended) |
| Assessment profile | New `Harness Install` list, one entry | Custom property group on Contact/Company |
| Deal tracking | Same pipeline list carries it | Separate native Deal object + pipeline |
| Views | Manual, UI-only (3 views) | Native list/board views, same manual UI step |
| Decision-maker flag | New attribute if wanted | Existing `hs_buying_role` property — no new field |
| Multi-pipeline | Not applicable (single list) | Tier-gated — Starter/Free = 1 pipeline only |

Either CRM produces the same underlying profile shape — pick based on what you already
use, not a default.

## Mark this done

Once applied, set `status/status.json`'s `crm_choice_made` and `crm_template_applied` to
`true`.
