# The risk matrix, in plain words

Every message your agent wants to send to a person outside this folder gets a score
from 0 to 100 before it goes. The score is the sum of the rows below, never under 0.
You set one level for your harness; a message at or under it goes on its own, one above
it waits for you. The script that applies this is `status/send.mjs` and the numbers live
in `status/shapes.mjs`; a test holds this page equal to them, so what you read here is
what runs.

## Who it is to

| In words | Label | Points |
|---|---|---|
| a reply in a thread they answered | `reply` | 0 |
| a follow-up with no reply yet | `follow-up` | 15 |
| first contact to a known lead | `known` | 25 |
| cold, a stranger | `cold` | 50 |

A message to your own team (an address at your own business) is `reply`: relationship
0, logged like any other, not exempt.

## What it says

One label, the highest that applies. An attachment counts as the last row.

| In words | Label | Points |
|---|---|---|
| logistics | `logistics` | 0 |
| standard information | `information` | 10 |
| a results claim or a third party named | `claim` | 20 |
| price, discount, commitment, signature, deadline or an attachment | `money` | 25 |

## Where it goes

| In words | Label | Points |
|---|---|---|
| email | `email` | 0 |
| a calendar invite | `calendar` | 0 |
| LinkedIn | `linkedin` | 10 |
| Slack | `slack` | 10 |
| a DM | `dm` | 10 |
| WhatsApp | `whatsapp` | 20 |
| SMS | `sms` | 20 |

## What you decided before, and who they are

Your own verdicts feed back. A kind of message is the same agent, the same channel and
the same content label; the script reads your verdicts on it from `status/send-log.md`
over the last 30 days, and a draft you changed and sent yourself counts as an
approval.

| In words | Label | Points |
|---|---|---|
| this kind of message rejected in the last 30 days | `rejected` | +20 |
| this kind of message approved in the last 30 days | `approved` | -10 |
| an existing customer | `customer` | -10 |

## The levels

Low sends up to 20, medium up to 45, high up to 70. Above 70 always waits, whatever
the level. In words:

- **low**: replies and logistics.
- **medium**: replies, logistics, and first contact to known leads with standard information.
- **high**: replies, logistics, first contact to known leads, and cold logistics and cold information.
- **off** (paused): everything waits for you.

Say "set my risk to medium", "pause sending" or "resume sending" and your agent moves it.
A hired agent can be kept apart ("the Friday report never sends"); it can never go above
your level.

## What never goes on its own, at any level

- Anyone on `status/no-contact.md`, for good.
- A follow-up to someone who has replied in that thread: answer them instead.
- Anything past a pacing cap you set with the level (`--cap-email`, `--cap-dm`, `--cap-sms`, per day).
- A hired agent that is not live yet, or whose job sheet says `send_risk: never`.
- Anything that would harm your reputation (rule 2 of the agent definition): that is
  refused before it is scored, not scored.

## What a waiting message says

Word for word, under the draft: "This message falls outside of your risk parameters, and you need to approve this manually." Then the score, your level, and
what would bring it inside, for example: "Score 55. Your level is low, which sends up to
20. It would send on its own at high, or at medium without the price."

## Where the labels come from

Your agent labels who the message is to, what it says and where it goes, and whether the
person is an existing customer; the script adds the history and applies the stops. A
label the script does not know counts as the riskiest of its kind, and the script says
so. Where your agent cannot run scripts (a plain chat), it scores by hand from this page
and tells you.
