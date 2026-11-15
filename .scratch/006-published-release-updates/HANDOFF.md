# Handoff — implement spec 006

User requested `/goal /implement-spec /Users/henriterrasse/Code/daily-practice/orion-self-install/.scratch/006-published-release-updates/issues`, then `/handoff another agent will keep going`. Goal is unfinished. Continue implementation; do not publish or deploy.

## Checkout and workflow
- Repository: /Users/henriterrasse/Code/daily-practice/orion-self-install
- Integration branch: `implement/006-published-release-updates`, currently `c12c174`.
- Initial scope commit before implementation: `080ff14` (use as final review base).
- Spec: `specs/006-published-release-updates/spec.md`; local issue tracker: `.scratch/006-published-release-updates/issues/` (11 Markdown tickets; close by completed status, checked acceptance items, and evidence).
- Explicitly invoked skill was found outside initial catalog: `/Users/henriterrasse/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.2/skills/engineering/implement-spec/SKILL.md`. Read it. Requires fresh implementer per ticket, separate branch/worktree, TDD skill, merge integration tip before completion, merger subagent, final code-review skill (two axes), fresh fix agent, cleanup worktrees. This explicitly authorizes subagents despite default no-proactive-delegation instruction.
- TDD skill: sibling `tdd/SKILL.md`; code-review skill: sibling `code-review/SKILL.md`.
- This is maintainer implementation, not a client install session. Do not run live radio or modify client state. Preserve preexisting modified `status/work-log.md` and untracked `.scratch/orion-release-updates/`.
- No PR created: local Markdown tracker, no user request for PR. No remote push/publication/tag/deployment done.

## Completed
1. Ticket01 implemented `8fd55e6`, merged `de58554`. Fixed complete 11-skill/support-file inventory, retired deleted Notion source, required historical fingerprints, real historic retirement test fixture. Full suite 255/255. Worktree `/private/tmp/orion-006-01`, branch `implement/006-01`, clean.
2. Ticket02 implemented `eaa461a`, merged `c12c174`. Explicit dispatch publication workflow, maintainer `.github/scripts/publish-release.mjs`, exact candidate tag/manifest/changelog/CI gate, six expected matrix jobs, trusted workflow definition comparison, Henri local disposable-harness trial evidence for major/migrations, immutable Github releases setting and final remote tag check. Setup `docs/publishing.md`; 7 publication fixture journeys; full suite 262/262. Worktree `/private/tmp/orion-006-02`, branch `implement/006-02`, clean. Official GitHub docs verified endpoint, API version, per-job head_sha. Requires configured protected environment/token; no live action done.
3. Ticket03 implemented `97f5c7b`, then merged integration tip into its branch at **`f785789`**. **NOT YET MERGED INTO INTEGRATION.** Worktree `/private/tmp/orion-006-03`, branch `implement/006-03`, observed clean. New `install-published.mjs`, `update/published-release.mjs`, published-install docs, README default path, schema docs. Full suite 267/267 before publication merge; final focused checks 33/33 after formatting. Agent was reconciling publication merge; check latest agent report/test result. Next action: fresh merger agent inspect and merge `implement/006-03` into integration, regenerate pristine if needed.

## Remaining task graph
- 04 depends 03: pinned transactional update, no-migration supported starting state, pairing required, identity comparison/no-op/downgrade, declared compatibility/tool/changes/checks, staging/backups/journal/smoke/rollback.
- After04: 05 pairing opt-in/resume; 06 declared migrations+legacy verification; 08 failed restoration/recovery (can run separate worktrees in parallel; coordinate updater seams).
- After06: 07 required edit resolution; 09 real bridge/client newest eligible release notices.
- After09: 10 withdrawal and notices (coordinate publisher).
- After08+10: 11 restore/corrected release recovery with later client edits preserved.
- Final review/fixes, full appropriate tests, tickets marked complete, cleanup implementer worktrees. No goal complete until all implemented.

## Shared interfaces / decisions
- `applied_release = {tag, commit, release_id, manifest_version, applied_at}`.
- Published release module exports `createReleaseClient({repository, apiBase, sourceUrl})`, `discoverRelease(client)`, `pinRelease(client, release, checkout)`, `verifyPinnedRelease(client, pin, checkout)`, `eligibleRelease`, `compareVersions`, `WITHDRAWAL_MARKER`.
- Withdrawal source marker in GitHub release body: `<!-- orion:withdrawn -->` (structured withdrawn:true also rejected).
- Semantic versions use valid vX.Y.Z, BigInt comparison; all release pages, exclude drafts/prereleases/withdrawn; annotated tags peeled; clean pinned checkout rechecked immediately prewrite; no branch/cache fallback.
- Install paused transaction in hidden sibling folder. Reuses original pin, validates staged bytes, binds repository/source/api origin, journal ready-to-promote recovery, requires real pair response and authenticated radio check before successful applied identity/atomic promotion. Inspect code for final semantics.
- Publication migration-script detection recursively recognizes keys `script`, `scripts`, `migration_script`, `migration_scripts`, plus executable files in migration(s) dirs. Use these names for migration metadata in04/06 or update publisher detection explicitly.
- `update/pristine.json` must regenerate after shipped changes (`node tests/helpers/pristine.mjs --write`). Full-history contract includes historical copies. Add/stage new source files before full tests: deployed fixture copies `git diff HEAD`, excludes untracked files otherwise. Do not weaken contract for this fixture detail.
- Current new scripts were reformatted with already available local prettier; keep future substantial logic readable.

## Actual bridge cross-repository dependency
Actual source repository (not another deployed harness): `/Users/henriterrasse/Code/daily-practice/dailypractice-mono`; main, clean when inspected; node_modules present. No code changes there yet. Spec explicitly requires bridge plus client together; fixture-only bridge is insufficient.
Read `/private/tmp/orion-006-bridge-notes.md` (completed exploration) for concrete routes/types/tests/migrations and proposed implementation.
Read mono `CLAUDE.md`, `PROJECT.md`, `specs/005-radio/plan.md`. Any bridge route change updates `specs/005-radio/contracts/radio.md`, plus types `specs/002-intelligence-bridge/contracts/bridge.ts`; mirror client contract `specs/002-production-line/contracts/bridge-radio.md`.
- Existing server `apps/enablement/app/api/bridge/nudges/route.ts` frozen legacy + v1 conversation; receipt on fetch is NOT durable notice display acknowledgment.
- Auth `apps/enablement/lib/bridge/auth.ts` binds token to harness; service-role queries must always scope harness.
- Need durable publication catalog/import from actual published GitHub releases, applied identity/check-in state, per-harness notice+withdrawal display ledger, dedicated release-check/display-ack endpoints; no process-memory substitute.
- Client `status/radio.mjs`: ordinary empty-message early exit and fatal network helper need care; release notices must not become ordinary reply-required nudges, trigger updater, or expose commit/ID. Local durable marker then retry ack without redisplay.
- Notices select newest compatible release only; withdrawal supersedes pending offer and reaches notified/applied clients.
- Stage database migration/source changes only. New spec explicitly calls fixture Git/GitHub/bridge journeys, so don't deploy or use other client harnesses to satisfy older live testing guidance.
- Mono gates: pnpm build:packages, pnpm lint, pnpm --filter enablement typecheck/test/build:compile. Use targeted gates as appropriate and report deployment not performed.

## Other notes
Baseline before implementation: 253 tests,235 passed,18 inventory-related failures. `/private/tmp/orion-006-baseline.log`.
Additional coordination notes `/private/tmp/orion-006-coordination.md`.
Prior subagents encountered usage limits twice; user said go and resumed. Work is saved, no need redo completed tickets. Latest active implementer ticket03 was asked to stop new work and report final status for this handoff.
