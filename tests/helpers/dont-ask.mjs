/**
 * What Claude Code does with --permission-mode dontAsk: a tool on the allowlist
 * runs, anything else is refused without asking. One rule per comma-separated
 * entry; `Bash(prefix *)` allows every command that starts with the prefix, and
 * `Bash(exact)` allows exactly that command. Used by every test that asks "would
 * this shift be allowed to do that?", so the question is answered one way.
 */
export function dontAsk(allowedCsv, tool, command = '') {
  const rules = allowedCsv.split(/,(?![^(]*\))/).map((r) => r.trim());
  return rules.some((rule) => {
    const open = rule.indexOf('(');
    if (open === -1) return rule === tool;
    if (rule.slice(0, open) !== tool) return false;
    const pattern = rule.slice(open + 1, -1);
    return pattern.endsWith(' *') ? command.startsWith(pattern.slice(0, -1)) : command === pattern;
  }) ? 'runs' : 'refused';
}

/** The connector tools a claude.ai login puts in a headless shift, by their real allow-rule names (#63, 4 November 2026). */
export const GMAIL_SEND = 'mcp__claude_ai_Gmail__send_message';
export const GMAIL_REPLY = 'mcp__claude_ai_Gmail__reply';
export const GMAIL_FORWARD = 'mcp__claude_ai_Gmail__forward';
export const GMAIL_DRAFT = 'mcp__claude_ai_Gmail__create_draft';
export const GMAIL_SEARCH = 'mcp__claude_ai_Gmail__search_threads';
export const SLACK_SEND = 'mcp__claude_ai_Slack__slack_send_message';
export const SLACK_DRAFT = 'mcp__claude_ai_Slack__slack_send_message_draft';
export const HUBSPOT_WRITE = 'mcp__claude_ai_HubSpot__manage_crm_objects';
export const GCAL_CREATE = 'mcp__claude_ai_Google_Calendar__create_event';
export const GCAL_LIST = 'mcp__claude_ai_Google_Calendar__list_events';
