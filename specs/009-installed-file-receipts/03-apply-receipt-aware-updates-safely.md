# 03: Apply receipt-aware updates safely

**What to build:** A harness with a valid receipt updates untouched Orion files while preserving client customizations. Modified managed runtime or plugin content stops the update before release-file mutation, and receipt changes describe only installation actions that succeeded.

**Blocked by:** [01: Record fresh-install receipts](01-record-fresh-install-receipts.md).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Compare receipt-tracked content with its recorded installed baseline; a matching historical shipped hash cannot override a receipt-detected edit.
- [x] Preserve edited ordinary files byte-for-byte and retain their previous baselines, including across a second update and when an edit matches another known shipped version.
- [x] Preserve and report existing files with unknown ownership rather than adopting their bytes as an installed baseline.
- [x] Preflight managed runtime and plugin changes, including package replacement, and identify conflicting destinations before any other release file is changed; replace unconditional overwrite exceptions.
- [x] Distinguish absent receipts from malformed, unreadable or unsupported receipts; invalid receipts stop the update before release-file mutation.
- [x] Advance baselines only for successful installation actions; successful managed additions and removals leave no false claim that a removed file is installed.
- [x] Include receipt changes in the existing update lock, backup, staging and journal flow, using atomic receipt writes; concurrent operations cannot overwrite another operation's receipt.
- [x] A failed apply restores files and receipt state together using the existing transaction machinery. Detailed interruption and explicit-restore journeys are completed in ticket 05.
- [x] Verify the observable behavior through deployed-harness updates for both tools, including normalized line endings and candidates with ordinary changes alongside runtime or plugin conflicts.
