# Connector Checklist

Authenticated setup for the three connector families: **CRM** (Attio or HubSpot, or
whatever you set up manually), **Gmail**, and **Google Calendar**. Work through this
top to bottom; the install status only moves from `configured` to `connected` once
**every** item passes its live test.

> **The rule that cannot bend**: a red ✗ anywhere below means stop, re-authenticate, and
> re-test — never proceed to validation "and fix it later." If you're the installing
> agent: never mark `status/status.json`'s `connector_*_live` fields `true` off an
> assumption, only off a test that actually passed.

All connector credentials live **in your own n8n instance** (n8n Cloud, your own
account) — never in this repository, never sent to Daily Practice. Your Orion agent
itself (the chat surface — Claude/ChatGPT/Copilot) holds no send-capable credentials at
all; every external action routes through n8n, where the approval gates live.

## Step zero — if you don't have n8n yet

n8n is the automation tool that connects your agent's drafts to your actual Gmail,
Calendar, and CRM. If you've never used it:

1. Go to n8n.io and sign up for a free n8n Cloud account (their free tier is enough to
   start with).
2. Once logged in, you'll land on a blank canvas — that's normal, you're about to import
   the two workflows in `n8n/` rather than build one from scratch.

If your AI assistant is code-capable, it can guide you through the rest of the connector
setup below step by step, checking each one live as you go.

## Pre-flight

- [ ] n8n Cloud account created (above)
- [ ] You can log into your CRM as an admin/owner (needed to generate an API key)
- [ ] You know your Google account password and have your 2FA device handy — this is
      the step that most often stalls if the device isn't nearby
- [ ] If your Google account is a Workspace (work/school) account: check with whoever
      manages it that third-party app connections aren't blocked, before starting

## 1 · CRM

### Attio

- [ ] Attio template applied (see [`crm/attio/README.md`](../crm/attio/README.md)) —
      lists, stages, attributes exist
- [ ] In your n8n: create credential → **Attio API** → paste the API key you generated
      earlier, scopes: read/write records + lists
- [ ] **Live test**: run a one-node n8n test — list entries of `sales_pipeline` → returns
      200 with the list (empty is fine)
- [ ] **Write test**: create + delete a throwaway entry via n8n → both succeed
- [ ] Name the credential in n8n something you'll recognise later, e.g. `attio-orion`

### HubSpot (alternative)

- [ ] Stages/properties configured per [`crm/hubspot/README.md`](../crm/hubspot/README.md)
- [ ] In your n8n: credential → **HubSpot OAuth2** (or a private-app token, either works)
- [ ] **Live test**: fetch contacts (200) · **Write test**: create + archive a test contact

### Something else, or no CRM template

- [ ] Follow [`crm/other-crm-manual-setup.md`](../crm/other-crm-manual-setup.md) instead —
      the n8n connector for your specific tool depends on what it is; if n8n has a
      built-in node for it, use the same live-test/write-test pattern above; if not, this
      step can wait — the agent and knowledge-base work don't depend on it.

## 2 · Gmail

- [ ] In your n8n: credential → **Gmail OAuth2** → authorize with the address you
      actually send from (double-check this is the one prospects will see)
- [ ] Scopes: read, compose/draft, send. (Send is only ever used **after** you
      explicitly approve a specific draft in that session — the default output is
      always a draft. Nothing auto-sends, ever.)
- [ ] **Live test**: n8n Gmail node → "get labels" → returns a label list
- [ ] **Draft test**: create a draft addressed to yourself → check it appears in your
      Drafts folder → delete it once confirmed. This is a good moment to notice: this is
      exactly what "staged for approval" means in practice.

## 3 · Google Calendar

- [ ] In your n8n: credential → **Google Calendar OAuth2** → same Google account as
      Gmail, unless you calendar somewhere else (some people split this — check)
- [ ] **Live test**: list calendars → your primary calendar is visible
- [ ] **Read test**: fetch this week's events → matches what you see in your own
      calendar app
- [ ] Note which calendar is "the" sales calendar if you run more than one

## Failure path (any test fails, or a credential later expires)

1. Note down which connector failed and when — a line in `status/status.json`'s `notes`
   field is fine. The install does not proceed to validation until this connector
   re-tests green.
2. In n8n: delete the credential and recreate it rather than editing it in place (n8n
   caches token state, so editing can leave stale data behind), then re-run the live
   test for that connector only.
3. If a Google credential expires later on (password change, revoked access, an OAuth
   app stuck in "testing" mode): the n8n workflows will fail loudly with an error, not
   silently — they never retry a send on a stale credential. Re-authenticate the same way
   as step 2.

## Sign-off

| Connector | Credential named in n8n | Live test | Write/draft test | Date |
|---|---|---|---|---|
| CRM ({{CLIENT_CRM}}) | | | | |
| Gmail | | | | |
| Google Calendar | | | — | |

All rows green → set `status/status.json`'s `connector_crm_live`, `connector_email_live`,
and `connector_calendar_live` to `true`, and the install may move to **`connected`**.
Proceed to [n8n workflows](../n8n/README.md), then
[validation](../validation/validation-tasks.md).
