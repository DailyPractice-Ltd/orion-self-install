# 08: Verify pinned commits and complete release contracts

**What to build:** The complete receipt-based update experience works for main and explicitly selected full commits outside main, with the same ownership and recovery guarantees. Both supported deployment contracts and maintainer instructions reflect the final behavior.

**Blocked by:** [04: Migrate receipt-free harnesses](04-migrate-receipt-free-harnesses.md); [06: Keep plugin activation and receipts aligned](06-align-plugin-activation-and-receipts.md); [07: Maintain receipts across tool switches](07-maintain-receipts-across-tool-switches.md).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Keep main as the default source and preserve explicit source-repository and full-commit selection without requiring a release tag or main ancestry.
- [x] A deployed-harness journey installs the exact committed contents selected from outside main and exercises the same preservation, runtime/plugin preflight, packaging and recovery rules.
- [x] Complete integrated journey coverage for both tools, including legacy migration, later updates, normalized line endings, recovery, activation and switching; reuse earlier ticket coverage rather than duplicating it.
- [x] Verify ordinary ownership validation remains stable without full Git history or changes to frozen compatibility data caused solely by ancestry.
- [x] Run the appropriate full test suite and release contracts for Codex and Claude Code; resolve failures and review whitespace and the complete diff.
- [x] Record user-visible behavior in the current Unreleased changelog and reconcile updater, deployment and maintainer guidance with installed-file receipts and frozen compatibility data.
- [x] Keep specifications and ticket records out of deployed content and runtime/test inputs. Do not change versions, publish a release, merge a PR or send changes to an external tracker as part of this work.
