---
name: create-skill
description: Teach Orion a reusable business judgment or procedure when the user asks Orion to learn how they assess, decide, or do recurring work.
---

# Teach Orion a skill

Ask one question at a time for the trigger, the procedure or judgment, and an example of a good result. Read the knowledge base first and reuse answers it already contains. Write a `SKILL.md` with a clear name, description, evidence requirements, limits, and completion check in your AI assistant's skills directory. Resolve the directory with `runtimeLayout` from `update/destination-resolver.mjs` at the root of the active Orion folder (the project you are working in), never relative to this skill's location. Client skills go there, never into the shipped Orion plugin package.

Run the procedure on a user-approved real example and incorporate their correction before recording it as proven. The procedure inherits Orion's permissions and can further restrict its own actions. For recurring execution, use native scheduling as documented in `agent/scheduled-work.md` at the root of the active Orion folder.
