# Scrub check — the defined grep list (FR-006 / SC-004)

The three day-one agent packages are extracted from a live operating harness. That
harness's data — companies, people, leads, prices, phone numbers, CRM links, internal
tags — must never appear in this public-bound repository. "Extracted" means the
behaviour came along; "scrubbed" means nothing else did. This file defines the check;
a package that fails it does not enter the repo, and a release does not ship until both
tiers return zero.

## Tier A — live data and source identifiers: zero hits anywhere in the repo

Company names, people, deal tags, sender domains, vendor channels, attribution fields,
and data patterns (phone numbers, currency amounts, CRM URLs) from the source harness:

```bash
grep -rniE 'tiber|umhlathuze|vulatel|salt contractors|hitachi|baseline civil|alpha construction|sasol|ruano|niven|skhumbuzo|jvz|quarta|hype digital|hype_bdr|cipc|sql_magic|mql_magic|mql_touch|workweek\.co\.za|workforce launch package|wlp fee|sequenzy|xero|apollo|fresh oxygen|app\.attio\.com|\+27[ 0-9]|zar[ ]?[0-9]' \
  --exclude-dir=.git \
  --exclude=scrub-check.md \
  . && echo 'TIER A: FAIL — hits above' || echo 'TIER A: PASS — zero hits'
```

Notes:
- `--exclude=scrub-check.md` exists because the list has to be written down somewhere;
  this file is the single sanctioned home for these strings, and nothing else gets the
  exemption.
- `\+27[ 0-9]` and `zar[ ]?[0-9]` catch the *patterns* (South African phone numbers,
  priced amounts), not just remembered examples — a new leak fails even if it isn't on
  the name list.
- `xero`, `apollo`, `cipc`, `sequenzy` are on the list deliberately: they are the source
  harness's stack and channel choices, not this template's. Packages speak generically
  ("your accounting tool", "a prospect-data service") so any hit is a leak, not an
  example.
- This tier applies to **every file, including `specs/`** — maintainer docs may name the
  source company, never its clients, people, prices, or tags.

## Tier B — the source company's name: zero hits in anything client-facing

The committed feature specs legitimately name the extraction source; nothing a client
reads may. Excluding `specs/` only:

```bash
grep -rni 'workweek' --exclude-dir=.git --exclude-dir=specs . \
  && echo 'TIER B: FAIL — hits above' || echo 'TIER B: PASS — zero hits'
```

## When to run

- Before any commit that adds or edits anything under `library/`.
- As release step: both tiers, from the repo root, recorded in the release notes.
- The check is deliberately a plain grep — no tooling to install, same rule for a human
  or an agent (Article I applies to maintainers too).

## If a term needs to become sayable

If a future package legitimately needs a Tier A word in a generic sense, the word comes
**off the list by an edit to this file in the same PR**, with one sentence of
justification — never by quietly ignoring a hit.
