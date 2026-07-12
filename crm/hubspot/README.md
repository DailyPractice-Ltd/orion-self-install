# HubSpot Template

The HubSpot equivalent of the Attio template — shapes a client's HubSpot portal into the
Orion pipeline. Stage definitions should match knowledge base §4.

## First time generating a HubSpot private app token? Do this first

1. In HubSpot, go to **Settings** (gear icon, top-right) → **Integrations** →
   **Private Apps**.
2. Click **Create a private app**. Name it something like "Orion install."
3. Under the **Scopes** tab, search for and enable: `crm.schemas.contacts.write`,
   `crm.schemas.companies.write`, `crm.objects.deals.write`, `crm.objects.contacts.write`,
   `crm.objects.companies.write`.
4. Click **Create app**, confirm, then copy the access token shown — HubSpot only shows it
   once. Paste it somewhere temporary; you'll use it in one command below, then can forget
   it.

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

## Apply it

If your AI assistant can run scripts (see `agent/adapters/claude-code.md`), it can do this
step directly once you've pasted in the token. Otherwise, run this yourself in a terminal —
your assistant can tell you exactly how to open one for your operating system:

```bash
# From this directory (crm/hubspot/):
HUBSPOT_API_KEY=<the token you just generated> node apply-hubspot-template.mjs

# Re-runnable: existing properties/options are skipped, so it's safe to run again if
# something failed partway.
```

Once validated, deactivate the private app — ongoing workflows use their own separate
credential (see `connectors/connector-checklist.md`).

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
