# 02: Freeze compatibility fingerprints

**What to build:** Historical shipped fingerprints remain available as frozen compatibility evidence. Normal development and release validation stop rebuilding ownership evidence from Git ancestry, so merges, squashes and shallow history do not change validation results.

**Blocked by:** None (can start immediately).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Retain valid existing historical fingerprints, including legacy aliases and retirement identities needed by deployed harnesses.
- [x] Replace history-based registry generation and exact-regeneration assertions with structural and compatibility-data validation.
- [x] Normal validation does not add arbitrary working-tree bytes as historical shipped evidence or remove hashes merely because their commits are unreachable.
- [x] Release preparation and version-bump workflows validate frozen compatibility data without reconstructing it from Git history.
- [x] Regression coverage proves that changing reachable history or merge topology alone requires no registry rewrite and that validation works without full history.
- [x] Update maintainer guidance and generation instructions to describe frozen compatibility data and remove requirements to regenerate historical fingerprints after every change.
