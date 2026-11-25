# 01: Record fresh-install receipts

**What to build:** Every fresh deployed harness records a versioned, harness-owned receipt describing the Orion-managed files actually installed. The receipt becomes reliable ownership evidence for later updates, including installations from a branch or a locally modified source checkout.

**Blocked by:** None (can start immediately).

**Status:** done (codex/installed-file-receipts @ c104728)

- [x] Derive the managed inventory from the existing deployment planner, recording stable source or fingerprint identity and actual deployed destination for the selected tool.
- [x] Choose a receipt location separate from release-file replacement and business data; define and validate a versioned schema suitable for subsequent update and recovery operations.
- [x] Generate the receipt in installation staging after copied and generated managed files have their final contents and before publishing the completed harness.
- [x] Record fingerprints of actual installed bytes using the existing normalized text convention, including generated tool-specific managed metadata and shipped plugin files.
- [x] Exclude business records, credentials, client templates, client-owned skills and unlisted client content from replaceable managed inventory.
- [x] Exercise real fresh installations for Codex and Claude Code, including a modified local source, and verify the receipt against deployed contents.
- [x] A failed installation does not publish a completed harness with a misleading receipt.
