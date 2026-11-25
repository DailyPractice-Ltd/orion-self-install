# 04: Migrate receipt-free harnesses

**What to build:** Older deployed harnesses can update directly to receipt-based ownership without an intermediate release. Migration recognizes untouched legacy content conservatively and keeps unknown client content protected.

**Blocked by:** [02: Freeze compatibility fingerprints](02-freeze-compatibility-fingerprints.md); [03: Apply receipt-aware updates safely](03-apply-receipt-aware-updates-safely.md).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] A genuinely absent receipt enables compatibility fallback using the frozen historical registry, legacy source aliases and retirement identities.
- [x] Establish receipt entries only from recognized ownership evidence or successful installation actions; never bootstrap an unknown existing file from its current bytes.
- [x] Recognized ordinary files update automatically; unknown ordinary files remain unchanged and are reported.
- [x] Unknown or modified managed runtime and plugin content follows the same preflight conflict protection as receipt-based updates.
- [x] Preserve the documented incoming-updater execution path so a receipt-free harness can skip the release that introduced receipts.
- [x] Verify direct migration and skipped-release journeys for both tools, followed by another update proving migrated baselines remain usable.
- [x] Verify that damaged existing receipts never trigger legacy fallback and cause no release-file changes.
