# Research: The Production Line

**Phase 0 output** | **Date**: 2026-07-25 | **Spec**: [spec.md](spec.md)

Seven decisions had to be made before design. Each is recorded as
decision / rationale / alternatives considered, per the plan workflow.

---

## R1 — How the wizard detects AI surfaces without asking

**Decision**: best-effort filesystem and PATH probes, per OS, using `node:` built-ins only:

- **Claude Desktop** — macOS: `/Applications/Claude.app`; Windows:
  `%LOCALAPPDATA%\AnthropicClaude`. Config dir (`~/Library/Application Support/Claude`,
  `%APPDATA%\Claude`) accepted as secondary evidence.
- **Claude Code** — `claude` resolvable on PATH (`spawnSync`, never a shell string), or
  `~/.claude` directory present.
- **ChatGPT app** — macOS: `/Applications/ChatGPT.app`; Windows:
  `%LOCALAPPDATA%\Programs\ChatGPT`.
- **GitHub Copilot** — a VS Code install plus a `~/.vscode/extensions/github.copilot*`
  directory (reported as "GitHub Copilot in VS Code").
- **Cursor** — macOS: `/Applications/Cursor.app`; any OS: `~/.cursor`.
- **OS / Node / git** — `process.platform` + `os.release()`, `process.version`,
  `spawnSync('git', ['--version'])` (ENOENT → absent, reported plainly, never fatal).

Detection is explicitly *best-effort and honest*: what it finds it reports in plain words;
what it can't see it never claims to have ruled out ("I didn't find X" — not "you don't
have X"). A website-only surface (claude.ai, chatgpt.com, M365 Copilot) is not detectable
from the filesystem and is always offered as the fallback lane.

**Rationale**: FR-001 forbids asking the client anything the machine can answer. Probes of
well-known install paths answer "which AI tools live here" with zero questions and zero
new dependencies.

**Alternatives considered**: asking the client (violates FR-001); `mdfind`/Spotlight or
Windows registry queries (slower, can trigger permission prompts, adds per-OS failure
modes for marginal gain); parsing running processes (flaky, privacy-adjacent, overkill).

---

## R2 — Masked input for the one secret the wizard itself handles

The only credential moment inside the wizard is the **welcome-pack key** (the install
token for the radio). Every other credential (CRM key, email auth) happens later, inside
the AGENTS.md sequence, in the destination tool — the wizard stops and waits, it never
collects.

**Decision**: `node:readline` with echo muted during the token prompt (a Writable that
suppresses the typed characters), value written directly into `status/status.json`'s
`sharing` object — its documented home (FR-008) — and never printed back. The
confirmation message shows only the last 4 characters.

**Rationale**: FR-002 — never requested in plain chat, never echoed, stored only where the
consuming tool (the radio client) reads it. `status.json` is the client's own file on the
client's own machine; the token is a machine token minted by Daily Practice, revocable at
any time (sister spec FR-B02).

**Alternatives considered**: plain visible input (fails FR-002's "never echoed" — terminal
scrollback and over-shoulder exposure); a prompt library (violates the repo-wide
dependency-free rule); environment variables (not resumable, not readable back — fails
Article II).

---

## R3 — Building the radio while the doors don't exist yet

The sister feature (`002-intelligence-bridge` in `dailypractice-mono`) is **spec-committed
but not built** as of 2026-07-25 (verified: its worktree has only the spec commit; no
`/api/bridge/*` routes exist).

**Decision**: build the entire client side against the sister spec's contracts, with the
endpoint config **stubbed off by default**: `sharing.bridge_url` and
`sharing.install_token` ship as `null`, every outbound call is a silent no-op until both
are set, and [contracts/bridge-radio.md](contracts/bridge-radio.md) records the exact
client-side expectations plus the short list of items the bridge build must confirm.
Live radio verification (SC-005) is explicitly deferred and marked.

**Rationale**: the spec's own Assumptions section anticipates this ordering; the null-safe
no-op is identical to the "client declined" path, so nothing here is throwaway.

**Alternatives considered**: waiting for the bridge (blocks all four user stories on one);
inventing our own endpoint shapes (guaranteed drift — the sister spec already names the
routes, auth, and idempotence rule).

---

## R4 — The radio versus Article V's two named channels

The radio sends three outbound message kinds (install-stage signals, "I did real work"
heartbeats, package-install reports) and reads one inbound mailbox (nudges; replies go
back only on the client's explicit yes). Article V as ratified names channel 1 as stage +
identity + timestamp only.

**Decision**: amend the constitution (MINOR, 1.0.0 → 1.1.0): channel 1 becomes **the
radio** — same single toggle, on by default, one click to decline, and its contents are
enumerated in writing (stage signals, work heartbeats as type+timestamp, package
name/kind/version reports, and the two-way mailbox). The "never" list is restated
unchanged: no message content, no KB content, no prospect data. Channel 2 (Intelligence
Library, off by default) is untouched.

**Rationale**: Articles IV/V gate every new data flow; FR-007/FR-008/FR-009 (committed
spec) require these flows under the pre-ticked check-in. Enumerating them in the
constitution keeps the "disclosed in plain language, in writing, in this repository"
promise true instead of stretching an old definition. Two channels remain two channels.

**Alternatives considered**: leaving Article V untouched (the asset report and heartbeat
would fail the Article IV gate honestly read); declaring a third channel (violates "two
channels, and only two"); pushing asset reports into channel 2 (wrong posture — the spec
wants them under the pre-ticked radio, and channel 2 is off by default).

---

## R5 — Extracting the Call-Planner generator

The source generator (`build-workbook.mjs`, 22 Jul artifact) renders a four-sheet Excel
workbook via a sandbox-only spreadsheet library (`@oai/artifact-tool`) unavailable outside
that runtime, and its companion `call-data.json` holds live records.

**Decision**: extract the **schema and the logic, not the file**: a dependency-free
`library/agents/call-planner/build-call-plan.mjs` that reads a client-local
`call-data.json` (same shape: `today[]`, `history[]`, `enrichment[]`, `lists`) and emits
a markdown day-sheet plus CSVs — same triage order, same dial/connect/rate arithmetic,
same hold-out rule ("not safe enough to present as call-ready" contacts stay out of
today's list), same outcome vocabulary. The workbook styling is treated as presentation,
not behaviour, and dropped.

**Rationale**: the constitution's dependency-free constraint and FR-006's scrub rule both
rule out shipping the original; the *battle-tested part* is the schema, the triage rules,
and the honesty split between "call-ready" and "needs enrichment" — all of which survive
re-expression exactly.

**Alternatives considered**: shipping the original file (cannot run anywhere a client has;
imports a proprietary runtime lib; workbook title and validation lists contain source
identifiers); no generator at all, prose only (loses the re-runnable, checkable artifact —
Article VIII wants something a live check can verify).

---

## R6 — Filling all four Library shelves without inventing anything

US2 acceptance 1 requires every Library button to land on a page whose first block is an
install prompt — an empty "Skills" or "Programs" shelf can't satisfy that.

**Decision**: day-one Library is seven packages, every one traceable to something already
running:

| Kind | Package | Source (battle-tested) |
|---|---|---|
| Agent | `prospecting` | Source harness's weekly prospecting methodology + this repo's wf-01 |
| Agent | `call-planner` | Source harness's daily calling command-center artifact (R5) |
| Agent | `friday-report` | Source harness's weekly report pack methodology |
| Workflow | `prospect-research-outreach` | This repo's existing `n8n/wf-01` (packaged, not changed) |
| Workflow | `post-call-debrief` | This repo's existing `n8n/wf-02` (packaged, not changed) |
| Skill | `meeting-sizing` | Source harness's scheduling policy (already generic) |
| Program | `revenue-operating-cadence` | Source harness's revenue-operations cadence + project controls |

**Rationale**: the operating standard is *nothing ships that isn't battle-tested*. The two
workflows already live in this repo (feature 001); the skill and program are lifted from
the same named preference files as the Chief-of-Staff umbrella pattern and are already
written generically (light scrub only).

**Alternatives considered**: empty-shelf pages ("coming soon") — fails US2 acceptance 1;
inventing filler packages — violates FR-006's extraction rule and the operating standard.

---

## R7 — Prospecting: honest about what the source harness bought

At the source, top-of-funnel *supply* came from external data vendors and a contracted BDR
service; the harness's own battle-tested part is the **evidence discipline**: what counts
as a touch, a live conversation, a meeting; supply-versus-activity accounting; honest
zeros; ICP disqualification with a reason.

**Decision**: the `prospecting` agent package does what the harness itself actually did —
research prospects against the client's ICP from the client's own sources, produce ~20
candidates with a one-line "why them," stage drafts, count only evidence — and its
PACKAGE.md says plainly, in its own "What this doesn't do" section, that bulk contact-list
*supply* came from paid external services at the source and is not included; clients who
want volume supply bring their own list source.

**Rationale**: FR-006 (extraction, not invention) + US3 acceptance 1 (drafts and lists
only) + the spec's own instruction to be honest about agent-versus-vendor split.

**Alternatives considered**: bundling a scraping/list-buying integration (out of scope,
new vendor dependency, reputational risk); omitting the supply story entirely (dishonest —
a client would expect pipeline to fill itself).
