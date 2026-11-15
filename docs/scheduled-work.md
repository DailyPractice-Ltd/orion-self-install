# Schedule Orion

Orion runs recurring work through [Codex scheduled tasks](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) or [Claude Routines](https://claude.com/resources/articles/introducing-routines-in-claude-code). Choose the time and timezone in the native scheduler and attach the Orion project and the connectors used by the task. For Codex work that needs local files, select the local Orion folder. A Claude Routine needs access to the Orion GitHub repository and its own connectors. Check that the scheduled environment can read the required knowledge base and skill before enabling it.

Give the task a specific prompt:

> In this Orion project, read AGENTS.md and run the Friday Report skill for the current reporting window. Read CRM, calendar, and email evidence. Return the report as a private draft in this run. If required evidence is unavailable, say what is missing. Apply Orion's existing permissions and the limits in the skill.

Try the exact prompt once with the intended data and permissions. Check the first scheduled run in the native scheduler. To record completed scheduled work from a script-capable run, use `node status/done.mjs --shift --skill friday-report --tag reporting --line "Drafted the weekly scorecard"`. Use the named completion signal instead when one applies. A scheduled run that checked its sources and found no work may report count zero.

## Migrate a legacy schedule

1. Review the update report's `legacy_schedules` list and check Codex and Claude for native schedules whose prompts open old job sheets. Look in `agents/`, `team/`, or `legacy/claude-agents/` for the old procedure. Keep the job sheets and logs as history.
2. Use `node status/schedule.mjs off --agent <legacy-name>` in the original folder on the original computer for a computer schedule. Pause an old native task in the app that owns it. Confirm each old schedule is off and any run already in progress has finished before enabling its replacement.
3. Choose the procedures you still use. Teach Orion each private skill from its old job sheet, carrying over its data sources, output, and action limits. A draft-only job stays draft-only. Then schedule the skill in Codex or Claude if it still needs to recur. Test the converted procedure with real input before enabling the schedule.
