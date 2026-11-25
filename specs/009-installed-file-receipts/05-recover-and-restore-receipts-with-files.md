# 05: Recover and restore receipts with files

**What to build:** Failed, interrupted and explicitly restored updates keep installed-file ownership evidence aligned with the files that actually remain on disk, including later client edits selectively preserved during restore.

**Blocked by:** [03: Apply receipt-aware updates safely](03-apply-receipt-aware-updates-safely.md).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Extend existing backups and journals to recover receipt changes alongside file changes without introducing a separate transaction system.
- [x] Failed writes and interrupted updates cannot leave a receipt that trusts a replacement that did not complete.
- [x] Automatic rollback and recovery restore prior baselines with restored files, including restoring receipt absence when appropriate.
- [x] Explicit restore keeps later edited ordinary files unchanged while restoring eligible files and their corresponding ownership metadata.
- [x] Selectively preserved later edits remain distinguishable from installed content on a subsequent update; do not adopt the edited bytes or blindly replace the entire receipt with an older snapshot.
- [x] Preserve existing collision protection and reporting for files or package content that cannot safely be restored.
- [x] Exercise failure, interruption, recovery, rollback and explicit restore through existing behavioral seams for both tools, then verify a subsequent update uses accurate baselines.
