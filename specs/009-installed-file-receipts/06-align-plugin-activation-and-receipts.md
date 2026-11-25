# 06: Keep plugin activation and receipts aligned

**What to build:** Ownership receipts describe applied plugin and managed metadata contents independently of whether the AI tool has activated that version. Confirmed activation failure that rolls back files also restores ownership evidence.

**Blocked by:** [05: Recover and restore receipts with files](05-recover-and-restore-receipts-with-files.md).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Pending plugin activation retains baselines for files already successfully applied and retains the existing resumable activation flow.
- [x] Successful activation or activation resumption does not falsely advance baselines for untouched or preserved content.
- [x] A confirmed activation failure that restores the previous package and managed files also restores their previous receipt state.
- [x] Include generated harness catalog or other managed metadata in ownership bookkeeping while protecting unrelated client registration settings and credentials.
- [x] Preserve existing status semantics for applied, pending, failed and restored outcomes rather than redesigning activation.
- [x] Verify pending, successful and failed activation journeys for both tools, including a subsequent update or restore demonstrating aligned file and receipt state.
