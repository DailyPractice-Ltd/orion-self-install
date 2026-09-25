# Connector Checklist

Authenticated setup for the three connector families: **CRM** (Attio or HubSpot, or
whatever you set up manually), **your email**, and **your calendar**. "Connecting" a
service just means giving your AI assistant permission to read and draft on your behalf —
the same kind of "Sign in with Google" or "Allow access" screen you've clicked through for
other apps before. Work through this top to bottom; the install status only moves from
`configured` to `connected` once **every** item is actually confirmed working, not just
"probably fine."

> **The rule that cannot bend**: any connector that isn't confirmed working means stop,
> fix that one, and try again — never move on to validation and plan to "fix it later."
> If you're the installing agent: never mark `status/status.json`'s `connector_*_live`
> fields `true` off an assumption — only once you've actually seen it work.

Connectors live **in your AI assistant itself** — Claude, ChatGPT, or Copilot each have
their own "connectors" or "integrations" settings, and that is where these sign-ins
happen and where the credentials stay. Nothing is stored in this repository and nothing
is sent to Daily Practice. The safety is not the tool: it is your agent's own
non-negotiable rules — everything external is a draft staged for your yes, and nothing
sends on its own (`agent/agent-definition.md`; constitution Article III). Your yes is
the gate, every time.

If your AI assistant is code-capable, it can walk you through this checklist step by
step, confirming each one works as you go. Your adapter file
(`agent/adapters/`) says exactly where the connector settings live on your surface.

## Pre-flight

- [ ] You can log into your CRM as an admin or owner (needed to generate an access token
      or approve the connection)
- [ ] **Which email and calendar do you actually use?** Almost everyone is one of two:
      **Google** (Gmail, Google Calendar) or **Microsoft** (Outlook, Microsoft 365,
      sometimes called Office 365). If you run your meetings in Teams, you're almost
      certainly Microsoft. If you're not sure, look at what your own email address ends
      in and what you open every morning. Pick your side below and skip the other: steps
      2 and 3 each have a Google version and a Microsoft version, and they do the same job.
- [ ] You know the password for that account and have your phone handy — you'll likely be
      asked for a second confirmation code sent to your phone (this is called **2FA**,
      short for two-factor authentication, and it's the step that most often stalls if
      your phone isn't nearby)
- [ ] If that account belongs to your company rather than to you personally: check with
      whoever manages it that outside apps aren't blocked from connecting, before you
      start. Both Google Workspace and Microsoft 365 can block this by default, and it is
      the one item here that you cannot fix yourself in the moment

## 1 · CRM

### Attio

- [ ] Attio template applied (see [`crm/attio/README.md`](../crm/attio/README.md)) —
      lists, stages, attributes exist
- [ ] Connect Attio in your AI assistant's connector settings (or hand your agent the
      access token you generated, on a surface that takes one)
- [ ] **You'll know it's connected when**: you ask your agent "what stages does my
      pipeline have?" and it reads back your actual Attio stages, by name. If it can't,
      the token was probably copied incorrectly — go back to Attio and generate a fresh
      one

### HubSpot (alternative)

- [ ] Stages/properties configured per [`crm/hubspot/README.md`](../crm/hubspot/README.md)
- [ ] Connect HubSpot in your AI assistant's connector settings and sign in with your
      HubSpot account when prompted
- [ ] **You'll know it's connected when**: you ask your agent "what stages does my
      pipeline have?" and it reads back your actual HubSpot stages, by name

### Something else, or no CRM template

- [ ] Follow [`crm/other-crm-manual-setup.md`](../crm/other-crm-manual-setup.md) instead —
      whether your assistant can connect directly depends on which tool you use; if not,
      this step can wait, since the knowledge-base and agent-assembly work don't depend
      on it

## 2 · Your email

Do **one** of these two, whichever matches the answer you gave in Pre-flight. They achieve
exactly the same thing; the rest of the install doesn't care which one you picked.

### If you're on Google (Gmail)

- [ ] Connect Gmail in your AI assistant's connector settings, signing in with the
      Google account you actually send from (double-check this is the address prospects
      will see)
- [ ] When Google asks what to allow, say yes to reading and drafting — your agent's
      standing rule is drafts only: nothing sends without your yes on that specific
      message, ever
- [ ] **You'll know it's connected when**: you ask your agent to stage a one-line test
      draft to yourself, and it appears in your **Drafts** folder — and nowhere else

### If you're on Microsoft (Outlook / Microsoft 365)

- [ ] Connect Outlook in your AI assistant's connector settings, signing in with the
      Microsoft account you actually send from (double-check this is the address
      prospects will see)
- [ ] When Microsoft asks what to allow, say yes to reading and drafting — same promise
      as above: drafts only, nothing sends without your yes on that specific message
- [ ] If you see a message about needing an administrator's approval, that's your
      company's Microsoft 365 settings, not a mistake you made. Whoever manages your IT
      can approve it in a minute. This is the most common stall on the Microsoft path
- [ ] **You'll know it's connected when**: you ask your agent to stage a one-line test
      draft to yourself, and it appears in your **Drafts** folder — and nowhere else

## 3 · Your calendar

Same again: pick the one that matches your email above.

### If you're on Google

- [ ] Connect Google Calendar in your AI assistant's connector settings — same Google
      account as Gmail, unless you keep your calendar somewhere else (some people do —
      check)
- [ ] **You'll know it's connected when**: you ask your agent "what's on my calendar
      today?" and it reads back your actual day, correctly

### If you're on Microsoft

- [ ] Connect Outlook Calendar in your AI assistant's connector settings — same
      Microsoft account as your mail, unless you keep your calendar somewhere else (some
      people do — check)
- [ ] **You'll know it's connected when**: you ask your agent "what's on my calendar
      today?" and it reads back your actual day, correctly

## The real test: do the real thing once

Once all three checks above pass, the true test isn't a special separate check — it's
the first two validation tasks
([`validation/validation-tasks.md`](../validation/validation-tasks.md) VT-01 and VT-04):
hand your agent a real prospect and watch the staged draft land in your Drafts, or
debrief a real call and watch the CRM update wait for your yes. If those work, every
connector genuinely works. If something's missing or looks wrong, that specific
connector is where to look first.

## Failure path (any connector fails, or one stops working later)

1. Note down which connector and when — a line in `status/status.json`'s `notes` field is
   fine. Nothing proceeds to validation until it's fixed.
2. In your AI assistant's connector settings: disconnect that service and connect it
   fresh, rather than half-fixing it — this avoids old, half-working login info getting
   stuck. Then re-run its "you'll know it's connected when" check above.
3. If a connector stops working later on (you changed your password, revoked access, or
   the provider flagged the connection) — your agent will tell you plainly the moment a
   task needs it and it can't reach it, and nothing is ever sent over a broken
   connection. Reconnect the same way as step 2.

## Sign-off

Fill in only the two rows that match what you actually use: Google or Microsoft, not
both.

| Connector | Connected on (your AI surface) | Read-back check passed | Confirmed via a real task | Date |
|---|---|---|---|---|
| CRM ({{CLIENT_CRM}}) | | | | |
| Email (Gmail or Outlook) | | | | |
| Calendar (Google or Microsoft) | | | — | |

All rows filled in → set `status/status.json`'s `connector_crm_live`,
`connector_email_live`, and `connector_calendar_live` to `true`, and the install may move
to **`connected`**. Proceed to [validation](../validation/validation-tasks.md).
