# 06: Apply declared migrations and verify legacy identity

**What to build:** Let a client update from a declared older starting state using the selected release's migration path. A supported same-folder harness moves to a separate deployed folder while its original stays available.

**Blocked by:** 04 — Apply a pinned update to a paired harness

**Status:** completed

- [x] Before writes, verify one complete ordered path for the starting version and tool. Reject missing or ambiguous steps and missing declarations of intended local changes or required checks.
- [x] Run only migration scripts from the pinned commit and preserve the recorded tool and existing radio choice. Migrations operate on staged local harness content and make no writes to live external accounts.
- [x] Back up every changed file before promotion and report the actual changes. Failures and interruptions use the update journal to keep or restore the prior state and identity.
- [x] A supported legacy same-folder migration stages and applies into a separate deployed folder, leaving the original intact.
- [x] A legacy template_version or missing selected_tool requires a declared migration that verifies the installed bytes and layout before backfilling identity or tool and deciding whether to apply or do nothing.
- [x] An unsupported or unverifiable starting state gets a separate clean-install recommendation without automatic transfer of status or configuration.

## Implementation evidence

- `update/published-migrations.mjs` verifies the declared starting version and
  tool layout before interpreting pinned JSON instructions. The published update
  transaction stages the declared edits, backs up prior bytes, reports actual
  changes, and uses its journal to recover interrupted promotions.
- The manifest declares a verified path from the historical v1.5.0 same-folder
  harness. Its migration stages a separate deployment and leaves the original
  intact. Same-version backfill for Claude Code and Codex checks the exact
  installed publication before recording the missing identity or tool.
- Disposable deployed-harness tests exercised ordered edits, backups, smoke-check
  rollback, interruption, the historical layout, pairing choice preservation,
  exact same-version backfill, and clean-install guidance for unverifiable
  state. They also checked rejection of ambiguous paths, missing required checks,
  and undeclared writes before promotion.
- Validation on integration merge `c5ce082` passed all **294 tests** with
  `node --test tests/*.test.mjs` and loopback access for disposable fixtures.
  `node tests/helpers/pristine.mjs` confirmed current fingerprints, and
  `git diff-tree --check HEAD^1 HEAD` passed.
