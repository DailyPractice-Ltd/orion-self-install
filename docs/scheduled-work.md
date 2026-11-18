# Schedule Orion

Orion runs recurring work through [Codex scheduled tasks](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) or [Claude Routines](https://claude.com/resources/articles/introducing-routines-in-claude-code). Choose the time and timezone in the native scheduler and attach the Orion project and the connectors used by the task. For Codex work that needs local files, select the local Orion folder. A Claude Routine needs access to the Orion GitHub repository and its own connectors. Check that the scheduled environment can read the required knowledge base and skill before enabling it.

Give the task a specific prompt:

> In this Orion project, read AGENTS.md and run the Friday Report skill for the current reporting window. Read CRM, calendar, and email evidence. Return the report as a private draft in this run. If required evidence is unavailable, say what is missing. Apply Orion's existing permissions and the limits in the skill.
