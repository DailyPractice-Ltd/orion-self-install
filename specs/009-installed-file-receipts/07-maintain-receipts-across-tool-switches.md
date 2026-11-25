# 07: Maintain receipts across tool switches

**What to build:** Switching between Codex and Claude Code maintains trustworthy installed baselines for generated, retained and retired managed files. A failed switch does not leave ownership metadata claiming that the transition completed.

**Blocked by:** [01: Record fresh-install receipts](01-record-fresh-install-receipts.md); [05: Recover and restore receipts with files](05-recover-and-restore-receipts-with-files.md).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Use the existing deployment planner and tool mappings to maintain receipt identities and destinations during a switch in either direction.
- [x] Record successful generation or installation of target-tool managed files and remove installed claims for successfully retired managed files.
- [x] Retain accurate baselines for preserved files and exclude client-owned skills, business records and credentials.
- [x] Coordinate receipt writes with the switch's existing lock, backup and failure recovery; a failed switch restores aligned files and receipt state.
- [x] Exercise successful switches in both directions and a failed switch through the existing behavioral seams.
- [x] Run another update after successful and failed switches to prove the resulting receipt remains usable and protects client edits.
