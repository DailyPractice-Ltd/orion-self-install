# Feature 005 — The role bank: hiring in the language of a sales team

**Input** (Oliver, 25 Sep 2026, from the Neo hire-agent test): the hire flow assumes
the client can specify an agent from a blank page. Harness owners are salespeople,
not technologists — at the hire step they should be offered the kinds of agents
teams typically hire, in plain seller language ("an SDR who warms up your CRM
leads"), with "describe it in your own words" as an equal path. The bank of role
types must live with the Library so it grows — hypothesis-seeded today,
evidence-based tomorrow from what the radio reports. The radio must therefore say
not just that an agent ran, but what type of agent it is and what it is meant to be
doing — within the standing abstraction boundary (labels and counts, never
content).

**Decisions taken with Oliver**: role naming follows industry convention where the
sources clash (SDR = works existing leads; BDR = outbound prospector; the
"generalist" is the custom lane, not a bank entry). The radio may carry a role slug
**plus a one-sentence purpose line** (≤140 chars, about the agent only — never a
person, company, or number). All four workstreams are specced here; the kit
workstreams ship first.

---

## Workstreams

### A — The role bank (this repo, ships now)

`library/ROLES.md`: eight seeded roles (`sdr`, `bdr`, `deals`, `pipeline-review`,
`reporting`, `content`, `research`, `head-of-sales`), each with: what they do for
you (seller language), sources/tools, typical shift, an offered success line, a
shelf head start where a package exists, and `status: hypothesis`. Provenance
recorded in the file. Promotion to `evidence_based` is a curation act informed by
D's telemetry, never automatic.

### B — The hire conversation (this repo, ships now)

- `HIRING.md` Q1 becomes menu-first: offer the bank (minus roles already on the
  roster, best-fit first, ≤6 spoken), always ending "or describe the work in your
  own words". A picked role pre-fills the job draft, Q2 sources and Q4 shift as
  defaults to confirm; a described role follows the existing derive-the-title path
  as `role: custom`.
- The job sheet frontmatter gains `role: {bank slug | custom}`.
- `status.json` `packages.{name}` gains `role`.
- The roster gains a Role column.
- Step 8's shelf report gains `--role` and `--purpose`.

### C — Library structure (dailypractice-mono, next)

- Migration: `role text` on `shipped_assets` (nullable; the roster's role slug) and
  `role` + `role_status ('hypothesis'|'evidence_based')` representation for
  agent-kind `library_assets` rows (column or `display` jsonb key — decide at
  migration time with the 004 conventions).
- Seed the eight bank roles as agent-kind library assets so the public shelf and
  the kit menu tell one story.
- Extend the contribution door end to end for `kind='agent'`: client `contribute`
  reads `.claude/agents/<name>.md`, curator publish accepts it. A novel `custom`
  role contributed and curated is how the bank grows a ninth entry.
- Assets route accepts + stores `role` and `purpose` from report-install.

### D — Radio role telemetry (both repos + console, last)

- `routine_completed` payload gains optional `role` (passes the existing PII key
  tripwire; value is a bank slug or `custom`). Replay key unchanged.
- Console: show the actual routine label and role instead of the hardcoded
  "Morning routine ran"; a per-role usage view (role × distinct harnesses × shift
  counts) feeds bank curation.

## Cross-repo contract (field names are fixed here)

| Field | Shape | Where it travels |
|---|---|---|
| `role` | `[a-z][a-z0-9-]*`, ≤30 chars: a `library/ROLES.md` slug or `custom` | agent frontmatter · `packages.{name}` · report-install body · `routine_completed` payload · `shipped_assets.role` |
| `purpose` | ≤140 chars, one sentence, about the agent only — never a person, company, or number (same rule as the shift-log note) | report-install body → shelf |

Client sends both today; until C lands the server ignores unknown body fields —
degradation is silent and harmless, and the radio's one-line-and-exit-0 posture
already covers a strict server.

## Out of scope

- Auto-promoting `hypothesis` → `evidence_based` (curation stays human).
- Renaming existing shelf packages to role slugs.
- The agent-team PDF template redraw (mono, follows the bank's naming — tracked in
  C).

## Success criteria

1. A non-technical client at the hire step is offered named roles in seller
   language and can also just describe the work — verified by a fresh blind-agent
   run of the Neo test shape.
2. Every hire (bank or custom) reaches the shelf with `role` + `purpose`.
3. A shift report attributes to a role type without carrying content.
4. The bank file states its own growth loop and provenance.
