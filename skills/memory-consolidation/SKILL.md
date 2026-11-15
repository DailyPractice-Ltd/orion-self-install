---
name: memory-consolidation
description: Consolidate Orion's notebook, resolve duplicate and superseded facts, and refresh the memory index. Use for notebook maintenance or a scheduled memory cleanup.
---

# Consolidate Orion's memory

1. Sync with `node status/memory.mjs sync`. Read `memory/INDEX.md`, the shared inbox, and changed facts and work-log entries since the last pass.
2. Consolidate duplicates. When evidence supersedes a fact, keep the prior record and point it to its replacement. Promote corroborated proposals into shared facts and keep uncertain proposals as candidates. Keep source and scope with each durable lesson.
3. Update `memory/INDEX.md` with current facts and distinct open hypotheses. Redact credential-shaped content without printing it.
4. Sync again. Verify the index points to the current facts and each supersession has a replacement. Report the number of items consolidated under the `ops` tag through Orion's usual completion step.

Keep changes inside the memory folder, apart from the standard report. The task uses local files and Orion's existing check-in setting.
