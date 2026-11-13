# Maintainer Speckit skills

The tracked source for every Speckit skill is `skills/speckit-*/SKILL.md`.
These skills are release maintenance tools and have no entry in the client
deployment manifest.

Claude Code maintainers who want native skill discovery in this release checkout
can run `node .specify/scripts/generate-claude-skills.mjs`. It creates ignored copies
under `.claude/skills/`; rerun it after changing a source skill. Installed Claude
Code clients receive only the three client skills listed in
`update/manifest.json` under `deployment.entries`.
