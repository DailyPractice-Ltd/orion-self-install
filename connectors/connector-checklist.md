# Connector Checklist

Authenticated setup for the three connector families: **CRM** (Attio or HubSpot, or
whatever you set up manually), **Gmail**, and **Google Calendar**. "Connecting" a service
just means giving n8n (see below) permission to read and write to it on your behalf —
the same kind of "Sign in with Google" or "Allow access" screen you've clicked through for
other apps before. Work through this top to bottom; the install status only moves from
`configured` to `connected` once **every** item is actually confirmed working, not just
"probably fine."

> **The rule that cannot bend**: any connector that isn't confirmed working means stop,
> fix that one, and try again — never move on to validation and plan to "fix it later."
> If you're the installing agent: never mark `status/status.json`'s `connector_*_live`
> fields `true` off an assumption — only once you've actually seen it work.

All connector credentials live **in your own n8n account** — never in this repository,
never sent to Daily Practice. Your Orion agent itself (the chat surface — Claude/ChatGPT/
Copilot) never holds anything capable of sending a message or writing to your CRM; every
external action routes through n8n, where the "did you actually say yes" gates live.

## Step zero — if you don't have n8n yet

n8n is the tool that actually connects your agent's drafts to your real Gmail, Calendar,
and CRM — think of it as the wiring behind the scenes, not something you'll spend much
time looking at directly. If you've never used it:

1. Go to n8n.io and sign up for a free account (their free tier is enough to start with).
2. Once logged in, you'll land on a blank screen — that's normal, you're about to import
   two ready-made workflows (see `n8n/README.md`) rather than build anything from scratch.

**Worth knowing now, not as a surprise later**: those two workflows also need their own
separate Anthropic account (different from claude.ai, and billed separately based on
actual use) to do their research/drafting work automatically. `n8n/README.md` walks
through getting that — just flagging it exists before you're deep into the steps below.

If your AI assistant is code-capable, it can walk you through the rest of this checklist
step by step, confirming each one works as you go.

## Pre-flight

- [ ] n8n account created (above)
- [ ] Willing to add a card for a small, usage-based Anthropic account (see above) — this
      is the one step in this whole install that costs anything beyond what you already pay
- [ ] You can log into your CRM as an admin or owner (needed to generate an access token)
- [ ] You know your Google account password and have your phone handy — Google will
      likely ask for a second confirmation code sent to your phone (this is called
      **2FA**, short for two-factor authentication, and it's the step that most often
      stalls if your phone isn't nearby)
- [ ] If your Google account is a work or school one (not a personal Gmail): check with
      whoever manages it that outside apps aren't blocked from connecting, before you start

## 1 · CRM

### Attio

- [ ] Attio template applied (see [`crm/attio/README.md`](../crm/attio/README.md)) —
      lists, stages, attributes exist
- [ ] In n8n, create a new credential of type **Attio API**, and paste in the access
      token you generated earlier
- [ ] **You'll know it's connected when**: n8n shows the credential as saved without an
      error. If it shows a red error instead, the token was probably copied incorrectly —
      go back to Attio and generate a fresh one
- [ ] Name the credential in n8n something you'll recognise later, e.g. `attio-orion`

### HubSpot (alternative)

- [ ] Stages/properties configured per [`crm/hubspot/README.md`](../crm/hubspot/README.md)
- [ ] In n8n, create a credential of type **HubSpot** and sign in with your HubSpot
      account when prompted (or paste your access token, if you generated one)
- [ ] **You'll know it's connected when**: n8n shows the credential as saved without an
      error

### Something else, or no CRM template

- [ ] Follow [`crm/other-crm-manual-setup.md`](../crm/other-crm-manual-setup.md) instead —
      whether n8n can connect directly depends on which tool you use; if not, this step
      can wait, since the knowledge-base and agent-assembly work don't depend on it

## 2 · Gmail

- [ ] In n8n, create a credential of type **Gmail**, and sign in with the Google account
      you actually send from (double-check this is the address prospects will see)
- [ ] When Google asks what to allow, say yes to reading, drafting, and sending email —
      sending is only ever used **after** you personally approve a specific draft; the
      default output is always a draft, nothing sends on its own
- [ ] **You'll know it's connected when**: n8n shows the credential as saved without an
      error

## 3 · Google Calendar

- [ ] In n8n, create a credential of type **Google Calendar** — same Google account as
      Gmail, unless you keep your calendar somewhere else (some people do — check)
- [ ] **You'll know it's connected when**: n8n shows the credential as saved without an
      error

## The real test: run the actual workflow

Once all three credentials above show as connected, the true test isn't a special
separate check — it's running the real thing, once, for real (see
[`n8n/README.md`](../n8n/README.md) and
[`validation/validation-tasks.md`](../validation/validation-tasks.md) VT-01 and VT-04):
submit a real prospect through the research workflow, or debrief a real call. If a
prospect summary and draft show up (or a call summary and updated CRM entry do), every
connector genuinely works. If something's missing or looks wrong, that specific connector
is where to look first.

## Failure path (any connector fails, or one stops working later)

1. Note down which connector and when — a line in `status/status.json`'s `notes` field is
   fine. Nothing proceeds to validation until it's fixed.
2. In n8n: delete that credential and create it fresh, rather than trying to edit the
   broken one — this avoids old, half-working login info getting stuck. Then confirm it
   shows as connected again.
3. If a Google credential stops working later on (you changed your password, revoked
   access, or Google flagged the connection) — n8n will show a clear error on the next
   run, not fail silently, and nothing will be sent on a broken connection. Re-authenticate
   the same way as step 2.

## Sign-off

| Connector | Credential named in n8n | Connected without error | Confirmed via a real run | Date |
|---|---|---|---|---|
| CRM ({{CLIENT_CRM}}) | | | | |
| Gmail | | | | |
| Google Calendar | | | — | |

All rows filled in → set `status/status.json`'s `connector_crm_live`,
`connector_email_live`, and `connector_calendar_live` to `true`, and the install may move
to **`connected`**. Proceed to [n8n workflows](../n8n/README.md), then
[validation](../validation/validation-tasks.md).
