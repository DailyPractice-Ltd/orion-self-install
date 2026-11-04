#!/usr/bin/env node
/**
 * Send Risk: the one place a message's risk is scored against the level the
 * client chose (spec 007, K16).
 *
 *   node status/send.mjs score --agent <name> --to <address> --channel <c> --relationship <r> --content <l> [--customer] [--replied]
 *   node status/send.mjs set-level <off|low|medium|high|pause|resume> [--agent <name> <harness|never>] [--cap-email N] [--cap-dm N] [--cap-sms N] [--by <who>]
 *   node status/send.mjs outcome <sent|failed|waiting> --agent <name> --score <n>
 *   node status/send.mjs verdict <approved|rejected> --agent <name> --channel <c> --content <l> --score <n>
 *   node status/send.mjs no-contact --add <address or domain>
 *   node status/send.mjs migrate [--backup <dir>]
 *
 * What it is for: every message to a person outside this folder is scored 0 to
 * 100. The client sets one level for the harness (`scopes.send_risk` in
 * status/status.json): a message at or under it sends on its own, unattended
 * too; one above it waits for them, under one exact sentence. Nothing here
 * sends anything: the agent sends, after this script says it may.
 *
 *   score      Applies the matrix (status/shapes.mjs, in plain words in
 *              agent/risk-matrix.md), adds the history from the client's own
 *              verdicts, applies the hard stops, compares with the level, and
 *              prints the score, the factors, the level, the decision and, for
 *              a wait, the sentence. One content-free line goes to
 *              status/send-log.md: never the content, never the recipient.
 *              --to is used only to check the no-contact list; it is never
 *              written anywhere.
 *   set-level  Writes the harness level (or, with --agent, the role's line on
 *              its job sheet), who set it and when; records the pacing caps
 *              once; re-renders every wired wake-up so the allowlist follows
 *              the level; and prints the one line the client hears.
 *   outcome    What happened after a decision: sent, failed, or left waiting.
 *   verdict    The client's yes or no on a waiting message: this is what the
 *              history factor reads.
 *   no-contact Adds an address or a domain to status/no-contact.md, for good.
 *   migrate    Replaces the kit's own retired never-send sentences in the files
 *              an update keeps (the agent definition, AGENTS.md, the adapters,
 *              the per-agent files), backs up first, lists what it could not
 *              place, and writes the level when the status file has none.
 *
 * Dependency-free: node built-ins and status/shapes.mjs only.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, copyFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEND_LEVELS, SEND_THRESHOLDS, SEND_CEILING, WAITING_SENTENCE, LEVEL_SENDS, LEVEL_WAITS, CONTENT_SHORT, HISTORY_DAYS,
  RISK_MATRIX, SEND_TOOL, riskLabel, riskScore, lowestLevelFor, levelSends, labelProblem, countProblem,
} from './shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(here, '..');
const STATUS_PATH = join(here, 'status.json');
const LOG_PATH = join(here, 'send-log.md');
const NO_CONTACT_PATH = join(here, 'no-contact.md');

const USAGE = [
  'Usage: node status/send.mjs score --agent <name> --to <address> --channel <c> --relationship <r> --content <l> [--customer] [--replied]',
  '       node status/send.mjs set-level <off|low|medium|high|pause|resume> [--agent <name> <harness|never>] [--cap-email N] [--cap-dm N] [--cap-sms N] [--by <who>]',
  '       node status/send.mjs outcome <sent|failed|waiting> --agent <name> --score <n>',
  '       node status/send.mjs verdict <approved|rejected> --agent <name> --channel <c> --content <l> --score <n>',
  '       node status/send.mjs no-contact --add <address or domain>',
  '       node status/send.mjs migrate [--backup <dir>]',
].join('\n');

// ── Shared pieces ───────────────────────────────────────────────────────────

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function readStatus() {
  if (!existsSync(STATUS_PATH)) return null;
  try { return JSON.parse(readFileSync(STATUS_PATH, 'utf8')); } catch { return null; }
}

function writeStatus(status) {
  status.updated_at = new Date().toISOString();
  writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
}

/** The harness level as recorded: off, low, medium, high, or null when there is none yet. */
function harnessLevel(status) {
  const value = status?.scopes?.send_risk;
  return typeof value === 'string' && SEND_LEVELS.includes(value.toLowerCase()) ? value.toLowerCase() : null;
}

function frontmatter(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return front ? front[1].split(/\r?\n/) : null;
}
function frontValue(lines, key) {
  const line = lines?.find((l) => l.startsWith(`${key}:`));
  if (!line) return undefined;
  return line.slice(key.length + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

/** The role's own send line and go-live flag, from its job sheet; a name with no sheet is the harness's own agent. */
function roleOf(name) {
  const path = join(FOLDER, '.claude', 'agents', `${name}.md`);
  if (!existsSync(path)) return { sheet: null, sendRisk: 'harness', live: true };
  const text = readFileSync(path, 'utf8');
  const lines = frontmatter(text);
  const raw = frontValue(lines, 'send_risk');
  const sendRisk = raw === undefined || ['harness', 'with the harness', 'on', 'true', 'yes'].includes(raw.toLowerCase()) ? 'harness' : 'never';
  const goLive = frontValue(lines, 'go_live');
  const live = goLive === undefined ? true : ['true', 'yes', 'on'].includes(goLive.toLowerCase());
  return { sheet: path, text, sendRisk, live };
}

function appendLog(line) {
  const gap = existsSync(LOG_PATH) && !readFileSync(LOG_PATH, 'utf8').endsWith('\n') ? '\n' : '';
  appendFileSync(LOG_PATH, `${gap}${line}\n`);
}

function readLog() {
  return existsSync(LOG_PATH) ? readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean) : [];
}

function parseFlags(rest, { values = [], switches = [] }) {
  const flags = {};
  const problems = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const name = arg.startsWith('--') ? arg.slice(2) : null;
    if (name !== null && switches.includes(name)) { flags[name] = true; continue; }
    if (name !== null && values.includes(name)) {
      if (name in flags) problems.push(`--${name} was given twice. Give it once.`);
      flags[name] = i + 1 < rest.length ? rest[++i] : '';
      continue;
    }
    if (name !== null) {
      problems.push(`${arg} is not something this command takes.`);
      if (i + 1 < rest.length && !rest[i + 1].startsWith('--')) i++;
      continue;
    }
    problems.push(`"${arg}" is not attached to any flag.`);
  }
  return { flags, problems };
}

const plainLevel = (level) => `${level}, which sends up to ${SEND_THRESHOLDS[level]}`;

// ── score ───────────────────────────────────────────────────────────────────

/** The no-contact list: one address or domain per line, matched whole, case-insensitively. */
function onNoContact(address) {
  if (!existsSync(NO_CONTACT_PATH)) return false;
  const who = String(address).trim().toLowerCase();
  const domain = who.includes('@') ? who.slice(who.indexOf('@') + 1) : null;
  return readFileSync(NO_CONTACT_PATH, 'utf8').split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, '').replace(/\s+#.*$/, '').trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'))
    .some((entry) => entry === who || (domain !== null && (entry === domain || entry === `@${domain}`)));
}

/** The most recent verdict in the window on this kind of message: same agent, channel and content label. */
function historyFor({ agent, channel, content }, now = new Date()) {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86400000);
  let found = null;
  for (const line of readLog()) {
    const cells = line.split('|').map((c) => c.trim());
    // {date} | {agent} | {channel} | {relationship} | {content} | {score} | verdict | {approved|rejected}
    if (cells.length < 8 || cells[6] !== 'verdict') continue;
    if (cells[1] !== agent || cells[2] !== channel || cells[4] !== content) continue;
    const when = new Date(cells[0].replace(' ', 'T'));
    if (Number.isNaN(when.getTime()) || when < since) continue;
    if (Object.hasOwn(RISK_MATRIX.history, cells[7])) found = cells[7];
  }
  return found;
}

/** The channel group a cap counts: email (with calendar), dm (LinkedIn, Slack, any DM), sms (WhatsApp, SMS). */
function capGroup(channel) {
  if (channel === 'email' || channel === 'calendar') return 'email';
  if (channel === 'whatsapp' || channel === 'sms') return 'sms';
  return 'dm';
}

/** How many messages went on their own today on this channel group, from the log's send decisions. */
function sentTodayOn(group, now = new Date()) {
  const today = stamp(now).slice(0, 10);
  return readLog().filter((line) => {
    const cells = line.split('|').map((c) => c.trim());
    return cells.length === 7 && cells[0].startsWith(today) && capGroup(cells[2]) === group && cells[6] === 'send';
  }).length;
}

function score(rest) {
  const { flags, problems } = parseFlags(rest, { values: ['agent', 'to', 'channel', 'relationship', 'content'], switches: ['customer', 'replied'] });
  for (const needed of ['agent', 'to', 'channel', 'relationship', 'content']) {
    if (flags[needed] === undefined || !String(flags[needed]).trim()) problems.push(`--${needed} is missing.`);
  }
  if (flags.agent !== undefined) {
    const trouble = labelProblem(flags.agent, 'agent');
    if (trouble) problems.push(`--agent: ${trouble}`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.log(p);
    console.log('Nothing was scored and nothing was written.');
    console.log(USAGE);
    return 1;
  }
  const status = readStatus();
  if (!status) {
    console.log('No status/status.json yet, so there is no level to score against. Run  node start.mjs  first.');
    return 1;
  }
  const agent = flags.agent;
  const labels = {
    relationship: riskLabel('relationship', flags.relationship),
    content: riskLabel('content', flags.content),
    channel: riskLabel('channel', flags.channel),
  };
  const unknown = [];
  for (const kind of ['relationship', 'content', 'channel']) {
    if (labels[kind] !== String(flags[kind]).trim().toLowerCase()) unknown.push(`--${kind} "${flags[kind]}" is not a label I know, so it counts as ${labels[kind]} (the safe side). The labels: ${Object.keys(RISK_MATRIX[kind]).join(', ')}.`);
  }
  const history = historyFor({ agent, channel: labels.channel, content: labels.content });
  const { score: points, factors } = riskScore({ ...labels, customer: flags.customer === true, history });

  const level = harnessLevel(status);
  const role = roleOf(agent);
  // The hard stops, in the order the client would want to hear them.
  const stops = [];
  if (onNoContact(flags.to)) stops.push('This person is on your no-contact list, so nothing goes to them on its own, ever.');
  if (flags.replied === true && labels.relationship === 'follow-up') stops.push('They have replied in this thread, so a follow-up never goes on its own: answer them instead.');
  const caps = status.scopes?.send_caps || {};
  const group = capGroup(labels.channel);
  if (Number.isInteger(caps[group]) && sentTodayOn(group) >= caps[group]) stops.push(`Today's ${group} cap of ${caps[group]} is reached, so the rest wait for you.`);
  if (!role.live) stops.push(`${agent} is not live yet (go_live is off on its job sheet), so its messages wait for you.`);
  if (role.sendRisk === 'never') stops.push(`${agent} never sends on its own (send_risk: never on its job sheet). Say "let ${agent} send" to change that.`);
  if (level === null) stops.push('Your harness has no send level yet, so everything waits for you. Say "set my risk to low" to let replies and logistics go on their own.');
  else if (level === 'off') stops.push(`Sending is paused (your level is off), so everything waits for you.${status.scopes?.send_risk_resume ? ` Say "resume sending" to go back to ${status.scopes.send_risk_resume}.` : ''}`);

  const inside = stops.length === 0 && levelSends(level, points);
  const decision = inside ? 'send' : 'waiting';

  for (const u of unknown) console.log(u);
  console.log(`Score ${points}: ${factors.map(([word, n]) => `${word} ${n > 0 ? '+' : ''}${n}`).join(', ')}.`);
  if (level && level !== 'off') console.log(`Your level is ${plainLevel(level)}.`);
  for (const stop of stops) console.log(stop);
  if (inside) {
    console.log('Decision: send. Send it now, then record it:');
    console.log(`  node status/send.mjs outcome sent --agent ${agent} --score ${points}`);
  } else {
    console.log('Decision: waiting. Leave it as an unsent draft and end with, word for word:');
    console.log(WAITING_SENTENCE);
    if (stops.length === 0) {
      const first = lowestLevelFor(points);
      const without = CONTENT_SHORT[labels.content] ? lowestLevelFor(points - RISK_MATRIX.content[labels.content]) : null;
      const parts = [];
      if (first === null) parts.push(`It is above ${SEND_CEILING}, which always waits for you`);
      else parts.push(`It would send on its own at ${first}`);
      if (without && (first === null || ['low', 'medium', 'high'].indexOf(without) < ['low', 'medium', 'high'].indexOf(first))) parts.push(`at ${without} without ${CONTENT_SHORT[labels.content]}`);
      console.log(`${parts.join(', or ')}.`);
    }
    console.log(`When ${status.client_name || 'your human'} says "send it", send that one message and record it:  node status/send.mjs verdict approved --agent ${agent} --channel ${labels.channel} --content ${labels.content} --score ${points}`);
  }
  appendLog(`${stamp()} | ${agent} | ${labels.channel} | ${labels.relationship} | ${labels.content} | ${points} | ${decision}`);
  return 0;
}

// ── outcome, verdict, no-contact ────────────────────────────────────────────

function agentAndScore(flags, problems) {
  if (flags.agent === undefined || !String(flags.agent).trim()) problems.push('--agent is missing.');
  else {
    const trouble = labelProblem(flags.agent, 'agent');
    if (trouble) problems.push(`--agent: ${trouble}`);
  }
  if (flags.score === undefined) problems.push('--score is missing: the score the message was given.');
  else if (!/^\d{1,3}$/.test(String(flags.score).trim())) problems.push(`--score needs the whole number the score command printed, not "${flags.score}".`);
}

function refuse(problems) {
  for (const p of problems) console.log(p);
  console.log('Nothing was written.');
  console.log(USAGE);
  return 1;
}

function outcome(rest) {
  const [what, ...more] = rest;
  const { flags, problems } = parseFlags(more, { values: ['agent', 'score', 'why'] });
  if (!['sent', 'failed', 'waiting'].includes(what)) problems.unshift(`outcome takes sent, failed or waiting, not "${what ?? ''}".`);
  agentAndScore(flags, problems);
  const why = flags.why === undefined ? '' : String(flags.why).replace(/\s+/g, ' ').trim();
  if (why.length > 120) problems.push('--why is one short line, at most 120 characters.');
  if (problems.length > 0) return refuse(problems);
  appendLog(`${stamp()} | ${flags.agent} | outcome | ${what} | ${Number(flags.score)}${why ? ` | ${why}` : ''}`);
  console.log(`Recorded: ${what}.`);
  return 0;
}

function verdict(rest) {
  const [what, ...more] = rest;
  const { flags, problems } = parseFlags(more, { values: ['agent', 'channel', 'content', 'score'] });
  if (!['approved', 'rejected'].includes(what)) problems.unshift(`verdict takes approved or rejected, not "${what ?? ''}".`);
  agentAndScore(flags, problems);
  for (const needed of ['channel', 'content']) if (flags[needed] === undefined) problems.push(`--${needed} is missing: the label the message was scored with.`);
  if (problems.length > 0) return refuse(problems);
  const channel = riskLabel('channel', flags.channel);
  const content = riskLabel('content', flags.content);
  appendLog(`${stamp()} | ${flags.agent} | ${channel} | - | ${content} | ${Number(flags.score)} | verdict | ${what}`);
  console.log(`Recorded: ${what}. This kind of message (${flags.agent}, ${channel}, ${content}) scores ${what === 'rejected' ? '+20' : '-10'} for the next ${HISTORY_DAYS} days.`);
  return 0;
}

function noContact(rest) {
  const { flags, problems } = parseFlags(rest, { values: ['add'] });
  const who = String(flags.add ?? '').trim().toLowerCase();
  if (!who) problems.push('no-contact needs --add <address or domain>.');
  else if (/\s/.test(who) || !/^[^@\s]+(@[^@\s]+)?$/.test(who)) problems.push(`"${flags.add}" is not an address or a domain.`);
  if (problems.length > 0) return refuse(problems);
  if (onNoContact(who.includes('@') ? who : `anyone@${who}`)) {
    console.log(`${who} is already on the no-contact list.`);
    return 0;
  }
  const gap = existsSync(NO_CONTACT_PATH) && !readFileSync(NO_CONTACT_PATH, 'utf8').endsWith('\n') ? '\n' : '';
  if (!existsSync(NO_CONTACT_PATH)) writeFileSync(NO_CONTACT_PATH, '# No contact, for good. One address or domain per line. Nothing goes to these on its own, at any level.\n');
  appendFileSync(NO_CONTACT_PATH, `${gap}${who}\n`);
  console.log(`Added to the no-contact list, for good: ${who}.`);
  return 0;
}

// ── set-level ───────────────────────────────────────────────────────────────

/** Rewrites one frontmatter line on a job sheet, adding it after crm_write: (or last) when absent. */
function setSheetLine(text, key, value) {
  const front = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(text);
  if (!front) return null;
  const nl = front[1].endsWith('\r\n') ? '\r\n' : '\n';
  const lines = front[2].split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at !== -1) lines[at] = `${key}: ${value}`;
  else {
    const after = lines.findIndex((l) => l.startsWith('crm_write:'));
    lines.splice(after === -1 ? lines.length : after + 1, 0, `${key}: ${value}`);
  }
  return `${front[1]}${lines.join(nl)}${front[3]}${text.slice(front[0].length)}`;
}

/** Every wired wake-up follows the level: re-render each one in place, when the scheduler can. */
async function rerenderShifts() {
  const shifts = join(here, 'shifts');
  if (!existsSync(shifts)) return [];
  let schedule = null;
  try { schedule = await import('./schedule.mjs'); } catch { return []; }
  if (typeof schedule.rerender !== 'function') return [];
  const done = [];
  for (const f of readdirSync(shifts).filter((n) => n.endsWith('.json'))) {
    const name = f.slice(0, -5);
    const result = schedule.rerender({ folder: FOLDER, name });
    if (result && result.written) done.push(name);
    else if (result && result.problem) console.log(`The wake-up for ${name} was not re-rendered: ${result.problem}`);
  }
  return done;
}

async function setLevel(rest) {
  const [what, ...more] = rest;
  const { flags, problems } = parseFlags(more, { values: ['agent', 'cap-email', 'cap-dm', 'cap-sms', 'by'] });
  const word = String(what ?? '').trim().toLowerCase();
  const forRole = flags.agent !== undefined;
  if (forRole) {
    const trouble = labelProblem(flags.agent, 'agent');
    if (trouble) problems.push(`--agent: ${trouble}`);
    if (!['harness', 'never'].includes(word)) problems.unshift(`For a role, set-level takes harness (sends with the harness level) or never, not "${what ?? ''}".`);
  } else if (!SEND_LEVELS.includes(word) && !['pause', 'resume'].includes(word)) {
    problems.unshift(`set-level takes off, low, medium, high, pause or resume, not "${what ?? ''}".`);
  }
  const caps = {};
  for (const group of ['email', 'dm', 'sms']) {
    const given = flags[`cap-${group}`];
    if (given === undefined) continue;
    const trouble = countProblem(String(given), { allowZero: true });
    if (trouble) problems.push(`--cap-${group}: ${trouble}`);
    else caps[group] = Number(given);
  }
  if (problems.length > 0) return refuse(problems);
  const status = readStatus();
  if (!status) {
    console.log('No status/status.json yet. Run  node start.mjs  first.');
    return 1;
  }
  const left = residue();
  if (left.length > 0) {
    console.log('The old rule is still in this folder, so the level cannot take effect yet:');
    for (const r of left) console.log(`  ${r.file}:${r.line}  ${r.text}`);
    console.log('Run  node status/send.mjs migrate  first (it backs up, then replaces the kit\'s own old sentences), then set the level again.');
    return 1;
  }
  status.scopes = status.scopes && typeof status.scopes === 'object' ? status.scopes : { crm_write: true };
  const by = String(flags.by ?? status.client_name ?? 'the client');
  const today = stamp().slice(0, 10);
  const current = harnessLevel(status) ?? 'off';

  if (forRole) {
    const role = roleOf(flags.agent);
    if (!role.sheet) {
      console.log(`There is no job sheet at .claude/agents/${flags.agent}.md, so there is no role to set. The harness level is set without --agent.`);
      return 1;
    }
    writeFileSync(role.sheet, setSheetLine(role.text, 'send_risk', word));
    const levelNow = harnessLevel(status) ?? 'off';
    if (word === 'never') console.log(`${flags.agent} never sends on its own. The rest of the harness is still at ${levelNow}.`);
    else console.log(`${flags.agent} now sends with the harness, at ${levelNow}${LEVEL_SENDS[levelNow] ? `: ${LEVEL_SENDS[levelNow]}` : ''}.`);
    const tools = (frontValue(frontmatter(role.text), 'tools') || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (word === 'harness' && !tools.some((t) => SEND_TOOL.test(t.split('(')[0]) || t === 'Bash')) {
      console.log(`Its job sheet names no tool that sends, so on a scheduled shift its messages wait for you until a promotion adds one.`);
    }
    if (tools.includes('Bash')) console.log('Its job sheet allows all of Bash, which can send from the shell on its own: the level is the rule there, with nothing at the tool boundary.');
    for (const name of await rerenderShifts()) console.log(`Re-rendered the wake-up for ${name}, so the next scheduled run follows this.`);
    return 0;
  }

  let level = word;
  if (word === 'pause') level = 'off';
  if (word === 'resume') {
    level = SEND_LEVELS.includes(status.scopes.send_risk_resume) && status.scopes.send_risk_resume !== 'off' ? status.scopes.send_risk_resume : 'low';
  }
  if (level === 'off') {
    if (current !== 'off') status.scopes.send_risk_resume = current;
  } else {
    delete status.scopes.send_risk_resume;
  }
  status.scopes.send_risk = level;
  status.scopes.send_risk_set_by = by;
  status.scopes.send_risk_set_on = today;
  if (Object.keys(caps).length > 0) status.scopes.send_caps = { ...(status.scopes.send_caps || {}), ...caps };
  writeStatus(status);

  if (level === 'off') {
    console.log(`Sending is paused. Everything waits for you.${status.scopes.send_risk_resume ? ` Say 'resume sending' to go back to ${status.scopes.send_risk_resume}.` : ''}`);
  } else {
    console.log(`Set to ${level}. On its own it now sends ${LEVEL_SENDS[level]}. ${LEVEL_WAITS[level]}`);
  }
  if (Object.keys(caps).length > 0) console.log(`Caps per day, on its own: ${Object.entries(status.scopes.send_caps).map(([g, n]) => `${g} ${n}`).join(', ')}.`);
  if (level !== 'off' && status.checklist && status.checklist.connector_email_live === false) {
    console.log('No email connector is live yet, so nothing can send until one is. When it is, grant reading, drafting and sending in one go.');
  }
  for (const name of await rerenderShifts()) console.log(`Re-rendered the wake-up for ${name}, so the next scheduled run follows this.`);
  return 0;
}

// ── migrate ─────────────────────────────────────────────────────────────────
//
// Every sentence the kit itself ever shipped that banned sending (v0.5.3 to
// v1.4.1), each with the words that replace it. A client's name inside one is
// matched as a capture group and written back into the replacement. Only
// these exact wordings are touched: a line the client wrote is never one of
// them, and a hand-edited copy of one is listed as residue, not changed.

const NAME = '{{CLIENT_NAME}}';

/** Rule 1 as the current template has it, placeholders and all. The template's own rule 1 is held equal to this by test. */
export const RULE_ONE = `1. SEND INSIDE ${NAME}'S RISK LEVEL, NEVER ABOVE IT. Every message to a person
   outside this folder (email, a calendar invite, LinkedIn, Slack, WhatsApp, SMS, any DM)
   is scored before it goes. Run
   \`node status/send.mjs score --agent {{AGENT_NAME}} --to <address> --channel <email|linkedin|slack|dm|whatsapp|sms>
   --relationship <reply|follow-up|known|cold> --content <logistics|information|claim|money>
   [--customer] [--replied]\` and do what its decision says. "send": send it, record it
   (\`node status/send.mjs outcome sent ...\`) and report it in one line. "waiting": leave it
   as an unsent draft (in ${NAME}'s own Drafts folder when the email connector is
   live, in the conversation otherwise) and end with, word for word: "This message falls
   outside of your risk parameters, and you need to approve this manually." then the
   score, the level and what would bring it inside, as the script printed them. Never say
   "I can't". When ${NAME} says "send it" to a waiting message, that is their yes
   for that one message: send it and record \`node status/send.mjs verdict approved ...\`;
   "no" records \`rejected\`. Never claim something was sent that was not. Where you cannot
   run scripts, score by hand from agent/risk-matrix.md and say so. ${NAME} moves
   the level in plain words ("set my risk to medium", "pause sending", "resume sending"):
   run \`node status/send.mjs set-level <level>\` and read back the one line it prints. The
   level lives in \`status/status.json\` (\`scopes.send_risk\`): read it there, never restate it.`;

/** The CRM paragraph of rule 1 since 1.4.0, appended when a tree from before it is migrated. */
const CRM_PARAGRAPH = `   CRM WRITES NEED NO YES. While \`scopes.crm_write\` in \`status/status.json\` is true,
   write notes, tasks, contact, company and deal properties and meeting outcomes straight
   away (a folder with no \`scopes\` block yet counts as true), then report in one line and log it. Read that switch; never restate it. If it is
   false, stage the write as a draft instead. This is the one place the irreversible list
   lives: a delete, a merge, an owner change or a lifecycle-stage move is never covered by
   the scope. Read back exactly what will change, and wait for ${NAME}'s yes.
   If a property does not exist and the connector cannot create it, follow
   the property route in the README for this harness's CRM under \`crm/\`;
   never stop to ask for a key.`;

const OLD_RULE_ONE_TAIL = `external communication you produce is a STAGED DRAFT for explicit approval. Never
   claim something was sent. Never instruct a tool to send. End every staged draft with:
   "Staged for your approval — nothing has been sent."`;

const AGENTS_RULE_THREE = `3. **Nothing sends above the risk level your human chose. CRM writes need none.** Once
   the client's own Orion agent is installed, every message to a person outside the folder
   is scored and goes, or waits for them, by rule 1 of \`agent/agent-definition.md\`: read
   the rule there, never restate it. A CRM write is different: it is internal and
   reversible, so it is done, then reported in one line and logged. That is the standing
   \`crm_write\` scope, set once in \`status/status.json\` (\`scopes.crm_write\`) and, for a
   hired agent, in its job sheet. Writes that cannot be undone (deletes, merges, owner
   changes, lifecycle-stage moves) are read back to the client and wait for their yes,
   scope or no scope. This rule governs the *installed* agent's behaviour, and it governs
   you too: never call a script or API that writes to a live external account without
   telling the client first what it's about to do.`;

const OLD_AGENTS_RULE_THREE_TAIL = `every outreach draft, CRM write, or external communication is staged for their approval
   in that session{{SEP}} never sent or written automatically. This rule governs the *installed*
   agent's behaviour, and it governs you too: never call a script or API that writes to a
   live external account without telling the client first what it's about to do.`;

/**
 * [which files, the old words, the new words]. {{CLIENT_NAME}} in the old words
 * captures the name; {{SEP}} and {{OR}} stand for the small differences between
 * releases. Whitespace between words is matched loosely, so a CRLF checkout
 * still matches.
 */
export const RETIRED = [
  ['agent/agent-definition.md',
    `1. NOTHING SENDS WITHOUT ${NAME}'S YES. Every outreach message, CRM change, and\n   ${OLD_RULE_ONE_TAIL}`,
    `${RULE_ONE}\n${CRM_PARAGRAPH}`],
  ['agent/agent-definition.md',
    `1. NOTHING SENDS WITHOUT ${NAME}'S YES. Every outreach message and every other\n   ${OLD_RULE_ONE_TAIL}`,
    RULE_ONE],
  ['agent/agent-definition.md',
    `Label the draft clearly as STAGED FOR APPROVAL —\n   and when the email connector is live, stage it as an unsent draft in\n   ${NAME}'s own Drafts folder (never send it); otherwise stage it in the\n   conversation.`,
    `Then send it or leave it\n   waiting, by rule 1: scored first; inside ${NAME}'s level it goes, otherwise it\n   waits as an unsent draft in ${NAME}'s own Drafts folder when the email\n   connector is live, in the conversation otherwise.`],
  ['agent/agent-definition.md',
    'Label the draft clearly as STAGED FOR APPROVAL.',
    'Then send it or leave it waiting, by rule 1.'],
  ['agent/agent-definition.md',
    '(b) CRM Update — the exact field changes and note to write, STAGED FOR APPROVAL;',
    `(b) CRM Update — the exact field changes and note, WRITTEN to the CRM now (the standing\n   \`crm_write\` scope in \`status/status.json\`) and reported in one line, for example\n   "Wrote 1 note and 1 task on Acme." Never staged, never waiting for a yes. A change that\n   cannot be undone is the exception: see rule 1;`],
  ['agent/agent-definition.md',
    `(c) Follow-up Draft — the next message, in tone, STAGED FOR APPROVAL — staged as an\n   unsent draft in ${NAME}'s Drafts folder when the email connector is live,\n   in the conversation otherwise.`,
    `(c) Follow-up Draft — the next message, in tone, sent or left waiting by rule 1 (a\n   waiting draft sits unsent in ${NAME}'s Drafts folder when the email connector\n   is live, in the conversation otherwise).`],
  ['agent/agent-definition.md',
    '(c) Follow-up Draft — the next message, in tone, STAGED FOR APPROVAL.',
    '(c) Follow-up Draft — the next message, in tone, sent or left waiting by rule 1.'],
  ['agent/agent-definition.md',
    'in knowledge base §4, drafted in tone, STAGED FOR APPROVAL.',
    'in knowledge base §4, drafted in tone, sent or left waiting by rule 1.'],
  ['agent/agent-definition.md',
    `5. STAY IN YOUR LANE. You draft, research, summarise, and stage. Decisions, sending, and\n   relationships belong to ${NAME}.`,
    `5. STAY IN YOUR LANE. You draft, research, summarise, and send inside ${NAME}'s risk\n   level. Decisions above it, and relationships, belong to ${NAME}.`],
  ['agent/agent-definition.md',
    `${NAME} says yes to a staged outreach draft → \`outreach_approved\``,
    `${NAME} says "send it" to a waiting message → \`outreach_approved\``],
  ['AGENTS.md',
    `3. **Nothing sends without an explicit yes.** Once the client's own Orion agent is {{OR:running|installed}},\n   ${OLD_AGENTS_RULE_THREE_TAIL}`,
    AGENTS_RULE_THREE],
  ['AGENTS.md',
    `3. **Nothing sends without an explicit yes. CRM writes need none.** Once the client's own
   Orion agent is installed, every outreach draft and every other outbound message is
   staged for their approval in that session, never sent automatically. A CRM write is
   different: it is internal and reversible, so it is done, then reported in one line
   and logged. That is the standing \`crm_write\` scope, set once in
   \`status/status.json\` (\`scopes.crm_write\`) and, for a hired agent, in its job sheet.
   Read it there, never restate it. Writes that cannot be undone (deletes, merges, owner
   changes, lifecycle-stage moves) are read back to the client and wait for their yes,
   scope or no scope. This rule governs the *installed* agent's behaviour, and it
   governs you too: never call a script or API that writes to a live external account
   without telling the client first what it's about to do.`,
    AGENTS_RULE_THREE],
  ['AGENTS.md',
    '- **Go-live**: until your human flips `go_live`, an agent reads and stages only.\n  Outbound sends are never automatic, live or not.',
    '- **Go-live**: until your human flips `go_live`, an agent reads and stages only, and\n  sends nothing. Once live, its messages go or wait by the harness\'s risk level (rule 1).'],
  ['agent/adapters/claude-code.md',
    "- Nothing sends without explicit approval — a code-capable surface makes it *easier* to\n  accidentally automate past that gate (e.g. by piping a script's output straight into a\n  send call). Don't. Every send/write path still stops for a yes.",
    '- Sending follows the risk level, and here the allowlist is a real tool boundary: a\n  scheduled shift is given the send tools on its job sheet only while the level allows\n  (`status/schedule.mjs`), and in a session rule 1 of the agent definition is the gate.\n  Never pipe anything into a send tool without the score line that allows it.'],
  ['agent/adapters/claude.md',
    "approval gate is the agent's own non-negotiable rules (drafts only, explicit yes;\n  Article III), not the tool: connectors read and stage drafts; **sending stays the\n  client's own act, from their own Drafts folder** — the agent never instructs a tool\n  to send (agent-definition rule 1).",
    "gate is rule 1 of the agent definition, not the tool: every message is scored, goes\n  inside the client's risk level, and waits for them above it (agent-definition rule 1)."],
  ['agent/adapters/codex.md',
    "- Everything outbound still stages for the client's yes. A code-capable surface makes it\n  easier to automate past that gate; don't. Same rule as `claude-code.md`.",
    "- Sending follows the risk level (rule 1 of the agent definition). Codex's headless run\n  loads no mail, Slack or calendar tool, so on Codex every message waits for the client\n  with that reason; there is no tool gate here, only the prompt and the script."],
  ['agent/adapters/chatgpt.md',
    "gate is the agent's own rules — drafts only; sending stays the client's own act,\n   from their own Drafts folder, never the agent instructing a tool\n   (agent-definition rule 1).",
    'gate is rule 1 of the agent definition: every message is scored; a custom GPT\n   cannot send on its own, so here every message waits for the client\n   (agent-definition rule 1).'],
  ['agent/adapters/copilot.md',
    "The approval gate is the agent's own rules — drafts only; sending\n   stays the client's own act, from their own Drafts folder, never the agent\n   instructing a tool (agent-definition rule 1).",
    'The gate is rule 1 of the agent definition: every message is scored; a\n   Copilot agent cannot send on its own, so here every message waits for the\n   client (agent-definition rule 1).'],
  ['.claude/agents/*.md',
    '- Never send anything. Drafts only. Sending is always a separate yes.',
    "- Send only what rule 1 of the agent definition allows at this harness's risk level, scored first; everything else waits for a yes."],
  ['.claude/agents/*.md',
    'Outbound messages are never automatic, live or not. That rule has no flip.',
    'Sending follows the harness\'s risk level (`send_risk:` in the frontmatter, scored message by message), not go-live; while `go_live: false` nothing sends.'],
  ['.claude/agents/*.md',
    ' Lists and drafts only.',
    ' Sends inside the risk level.'],
];

/** An old rule in a wording this script does not know. The lines that still match after the table ran. */
const RESIDUE_RE = /NOTHING SENDS WITHOUT|Never instruct a tool to send|nothing has been sent|Never send anything\. Drafts only|never sent (or written )?automatically|never automatic, live or not|That rule has no flip|Nothing sends without (an explicit yes|explicit approval)|sending stays the client's own act|Everything outbound still stages|stage every message and send nothing/i;

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The old words as a regular expression: loose whitespace, the name captured, the small per-release differences allowed. */
export function retiredRe(oldWords) {
  let re = escapeRe(oldWords)
    .replace(/\\\{\\\{CLIENT_NAME\\\}\\\}/g, "([^\\n]+?)")
    .replace(/\\\{\\\{SEP\\\}\\\}/g, '(?:,| —)')
    .replace(/\\\{\\\{OR:([^}]+)\\\}\\\}/g, (_, alts) => `(?:${alts.split('|').map(escapeRe).join('|')})`)
    .replace(/\s+/g, '\\s+');
  return new RegExp(re, 'g');
}

function keptFiles() {
  const files = ['agent/agent-definition.md', 'AGENTS.md', 'agent/adapters/claude-code.md', 'agent/adapters/claude.md', 'agent/adapters/codex.md', 'agent/adapters/chatgpt.md', 'agent/adapters/copilot.md'];
  const agents = join(FOLDER, '.claude', 'agents');
  if (existsSync(agents)) {
    for (const f of readdirSync(agents).filter((n) => n.endsWith('.md') && n !== 'README.md').sort()) files.push(`.claude/agents/${f}`);
  }
  return files.filter((rel) => existsSync(join(FOLDER, rel)));
}

/** Apply the table to one file's text. Returns the new text and how many sentences changed. */
function migrateText(rel, text) {
  let out = text;
  let changed = 0;
  for (const [where, oldWords, newWords] of RETIRED) {
    const applies = where.endsWith('*.md') ? rel.startsWith(where.slice(0, -4)) : rel === where;
    if (!applies) continue;
    out = out.replace(retiredRe(oldWords), (...m) => {
      changed++;
      const name = m.slice(1, -2).find((g) => typeof g === 'string') || '';
      return newWords.replaceAll(NAME, name);
    });
  }
  return { text: out, changed };
}

/** Lines in the kept files that still carry the old rule in a wording this script does not know, as {file, line, text}. */
function residue(files = keptFiles()) {
  const found = [];
  for (const rel of files) {
    const lines = readFileSync(join(FOLDER, rel), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (RESIDUE_RE.test(line)) found.push({ file: rel, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

/** The client's own lines about sending on a hired agent's sheet: left alone, and named. */
function ownSendLines(files) {
  const found = [];
  for (const rel of files.filter((f) => f.startsWith('.claude/agents/'))) {
    const lines = readFileSync(join(FOLDER, rel), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^\s*[-*]\s/.test(line) && /\bsend/i.test(line) && !/rule 1 of the agent definition/.test(line) && !RESIDUE_RE.test(line)) found.push({ file: rel, line: i + 1, text: line.trim() });
    });
  }
  return found;
}

function migrate(rest) {
  const { flags, problems } = parseFlags(rest, { values: ['backup'] });
  if (problems.length > 0) return refuse(problems);
  const files = keptFiles();
  const backupDir = flags.backup ? join(FOLDER, flags.backup) : join(FOLDER, '.update-backup', `send-risk-${stamp().slice(0, 10)}`);
  const replaced = [];
  for (const rel of files) {
    const path = join(FOLDER, rel);
    const before = readFileSync(path, 'utf8');
    let { text, changed } = migrateText(rel, before);
    if (rel === 'agent/agent-definition.md' && changed > 0) {
      const agentName = (/^You are ([^,\n]+),/m.exec(before) || [])[1] || readStatus()?.agent_name || 'your-agent';
      text = text.replaceAll('{{AGENT_NAME}}', agentName.trim());
    }
    if (changed === 0 || text === before) continue;
    const bk = join(backupDir, rel);
    mkdirSync(dirname(bk), { recursive: true });
    copyFileSync(path, bk);
    writeFileSync(path, text);
    replaced.push(rel);
  }

  const status = readStatus();
  let levelWritten = false;
  if (status) {
    status.scopes = status.scopes && typeof status.scopes === 'object' ? status.scopes : { crm_write: true };
    if (typeof status.scopes.crm_write !== 'boolean') status.scopes.crm_write = true;
    if (harnessLevel(status) === null) {
      status.scopes.send_risk = 'low';
      status.scopes.send_risk_set_by = 'update';
      status.scopes.send_risk_set_on = stamp().slice(0, 10);
      writeStatus(status);
      levelWritten = true;
    }
  }

  if (replaced.length > 0) {
    console.log(`Replaced the old rule in ${replaced.length} files: ${replaced.join(', ')}. Backup: ${relative(FOLDER, backupDir)}/`);
    const level = harnessLevel(status) || 'low';
    console.log(`Your harness now sends on its own at ${level}: ${LEVEL_SENDS[level] || 'nothing, it is paused'}. The old rule that nothing sends without your yes has gone from ${replaced.length} files; the backup is in the folder. Say 'set my risk to medium' or 'pause sending' to change it.`);
  } else {
    console.log("Nothing to change: the kit's old rule is not in this folder.");
    if (levelWritten) console.log("Set the send level to low, since none was recorded: replies and logistics go on their own. Say 'set my risk to medium' or 'pause sending' to change it.");
  }
  const own = ownSendLines(files);
  if (own.length > 0) {
    console.log('Your own lines about sending, left as they are:');
    for (const o of own) console.log(`  ${o.file}:${o.line}  ${o.text}`);
  }
  const left = residue(files);
  if (left.length > 0) {
    console.log('Old rule still present, not a wording this script knows (left alone; set-level refuses until it is changed by hand):');
    for (const r of left) console.log(`  ${r.file}:${r.line}  ${r.text}`);
  }
  return 0;
}

// ── The command ─────────────────────────────────────────────────────────────

const COMMANDS = { score, outcome, verdict, 'no-contact': noContact, 'set-level': setLevel, migrate };

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    console.log('Details in the header of this file, and in agent/risk-matrix.md.');
    return 0;
  }
  if (!Object.hasOwn(COMMANDS, command)) {
    console.log(`"${command}" is not something send.mjs does.`);
    console.log(USAGE);
    return 1;
  }
  return COMMANDS[command](rest);
}

function runAsCommand() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (runAsCommand()) process.exit(await main(process.argv.slice(2)));
