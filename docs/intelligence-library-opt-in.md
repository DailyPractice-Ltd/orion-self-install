# Intelligence Library — opt-in disclosure

This is the second, separate data channel named in the constitution's Article V. It is
**off by default**. Nothing described here happens unless you explicitly turn it on.

## What it is

Daily Practice maintains an "Intelligence Library" — aggregated, anonymised patterns
across every Orion install, used to make future versions of this repository better
(which knowledge-base prompts actually work, which objections come up often enough to
deserve a template, which validation tasks catch real problems).

## Exactly what would be shared, if you opt in

- **Signal types and counts**: e.g. "a prospect-research task ran," "a validation task
  passed," with a timestamp. Not the content of any draft, message, or CRM record.
- **Never shared, under any circumstances, even if you opt in**: your knowledge-base
  content, your objection library, prospect names or data, message content, CRM contents,
  or anything from `agent/knowledge-base/`.

## What it is not

It is not the lifecycle status signal described in `README.md` and
`specs/001-self-install/spec.md` (US5) — that's a separate, much narrower channel (just
your install stage and a timestamp) that's on by default because it's how Daily Practice
knows to check in if you need help. This Intelligence Library channel is additional,
richer, and entirely separate — turning this off has no effect on that one, and vice
versa.

## How to opt in

Set `status/status.json`'s `sharing.intelligence_library_opt_in` to `true`. That's the
entire mechanism — there's no separate form, account, or agreement.

## How to opt out again

Set it back to `false`. Takes effect immediately; nothing further is collected. Data
already shared before you opted out isn't retroactively deleted by this switch — contact
**support@dailypractice.world** if you want to request removal of anything already
shared.
