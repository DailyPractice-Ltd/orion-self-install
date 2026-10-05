#!/usr/bin/env node
/**
 * "I finished something." The one habit after a piece of work.
 *
 *   node status/done.mjs --tag <tag> [--count <n>] [--skill <slug>] [--agent <roster name>]
 *                        [--shift] [--line "<one line that stays on this machine>"]
 *
 * What it is for: a finished task is the unit this harness reports. Run this
 * once, as the last step, when a task your human set is done (they have the
 * thing they asked for, or the action is taken), or when a hired agent's shift
 * ends. Chat alone is not work: a greeting, a question, an answer, a plan, or a
 * draft still waiting on a yes runs nothing.
 *
 *   --tag     The kind of work, from the menu in status/shapes.mjs (docs/radio.md
 *             lists it in plain words). Required.
 *   --count   How many things were done. A whole number; leave it out and it
 *             is 1. A finished task is at least 1. Only a shift may report 0:
 *             it ran and found nothing to do.
 *   --skill   The slug of the skill that did the work, when one did.
 *   --agent   The roster name of the hired agent that did the work, when one did.
 *   --shift   The work was a shift: a hired agent's schedule (a clock or a
 *             handoff) started it, not a person. Needs --agent.
 *   --line    One line about what was done. It stays on this machine.
 *
 * It does two things, in this order.
 *
 * 1. The local record, when --line is given. It never skips, radio on or off.
 *    A shift's line is appended to status/shift-log.md as
 *      {YYYY-MM-DD HH:MM} | {agent} | count: {N} | auto: {line}
 *    This script writes the auto: marker itself, because that marker is what
 *    proves a schedule fired on its own. The line is also written to the memory
 *    log, memory/agents/<who>/log.md, when memory is on. <who> is --agent, or
 *    else this harness's own agent_name. Memory trouble never blocks anything.
 *
 * 2. The radio half, only when the radio is on: one signal through
 *    status/radio.mjs, carrying labels only. The tag, the count, the time, and
 *    the name of the skill or agent that ran. The line is never handed to the
 *    radio, and no flag here can put free text on the wire. A finished task goes
 *    as task_completed. A shift goes as routine_completed ("routine" is only the
 *    wire name for a shift). Radio off: nothing is sent, and nothing is said
 *    about it.
 *
 * A skill named here always reports as "it ran" (outcome run_completed). This
 * script has no way to send any other outcome.
 *
 * Validation comes first. A tag that is not on the menu, a bad count, a name
 * that is not a label, or --shift without --agent: one plain explanation, exit
 * 1, nothing written, nothing sent. After any valid report the exit code is 0,
 * even when the radio could not be reached: the local record is the half that
 * must never fail. No status/status.json yet: one plain line, exit 0, the same
 * posture as radio.mjs.
 *
 * Dependency-free: node built-ins and its sibling scripts only. No
 * package.json, no npm install.
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isWorkTag, workTagMenu, labelProblem, radioOn, memoryOn } from './shapes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = join(__dirname, '..');
const STATUS_PATH = join(__dirname, 'status.json');
const SHIFT_LOG_PATH = join(__dirname, 'shift-log.md');

const USAGE = 'Usage: node status/done.mjs --tag <tag> [--count <n>] [--skill <slug>] [--agent <roster name>] [--shift] [--line "<one line that stays on this machine>"]';

// ── Arguments ───────────────────────────────────────────────────────────────
// Stricter than radio.mjs on purpose. This script is new, so there is no old
// caller to keep working, and a flag it does not know is far more likely a
// mistake (a --note, a missing quote) than something safe to ignore.

const VALUE_FLAGS = ['tag', 'count', 'skill', 'agent', 'line'];
const argv = process.argv.slice(2);
const flags = {};
const problems = [];

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  console.log('Details in the header of this file. The tag menu:');
  for (const menuLine of workTagMenu()) console.log(menuLine);
  process.exit(0);
}

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--shift') { flags.shift = true; continue; }
  const eq = arg.indexOf('=');
  const name = arg.startsWith('--') ? arg.slice(2, eq === -1 ? undefined : eq) : null;
  if (name !== null && VALUE_FLAGS.includes(name)) {
    if (name in flags) problems.push(`--${name} was given twice. Give it once.`);
    if (eq !== -1) flags[name] = arg.slice(eq + 1);
    else flags[name] = i + 1 < argv.length ? argv[++i] : '';
    continue;
  }
  if (name !== null) {
    problems.push(`${arg} is not something done.mjs takes.`);
    // Whatever followed an unknown flag was meant as its value. Skip it, so one
    // mistake is reported once.
    if (eq === -1 && i + 1 < argv.length && !argv[i + 1].startsWith('--')) i++;
    continue;
  }
  problems.push(`"${arg}" is not attached to any flag. If it belongs to --line, put the whole line in quotes.`);
}

// ── Validate first ──────────────────────────────────────────────────────────
// Nothing is written and nothing is sent until every part of the report is
// known to be good.

// A tag problem is kept apart from the rest, so the menu can sit directly under
// the sentence that introduces it.
let tagProblem = null;
if (flags.tag === undefined || !String(flags.tag).trim()) {
  tagProblem = '--tag is missing. Say what kind of work this was, with one tag from the menu:';
} else if (!isWorkTag(flags.tag)) {
  tagProblem = `"${flags.tag}" is not a tag on the menu. Pick the closest one, or "other" when nothing fits:`;
}

const shift = flags.shift === true;

const countText = flags.count === undefined ? '1' : String(flags.count);
let count = null;
if (!/^\d{1,9}$/.test(countText)) {
  problems.push('--count must be a whole number in plain digits (how many things were done).');
} else {
  count = Number(countText);
  // A finished task that did zero things is a contradiction. A shift is
  // different: "it ran and found nothing to do" is real, and worth reporting.
  if (count < 1 && !shift) {
    problems.push('--count 0 is only for a shift (--shift) that ran and found nothing to do. A finished task did at least one thing.');
  }
}

for (const [flag, kind] of [['skill', 'skill'], ['agent', 'agent']]) {
  if (flags[flag] === undefined) continue;
  const problem = labelProblem(flags[flag], kind);
  if (problem) problems.push(`--${flag}: ${problem}`);
}

if (shift && flags.agent === undefined) {
  problems.push('--shift needs --agent <roster name>. A shift is a hired agent\'s scheduled work, so it has to say whose.');
}

// One line means one line: a line break would split the shift log's
// one-line-per-shift shape, so any run of whitespace becomes a single space.
let line = null;
if (flags.line !== undefined) {
  line = String(flags.line).replace(/\s+/g, ' ').trim();
  if (!line) {
    problems.push('--line was given but is empty. Write the one line, or leave --line out.');
  } else if (line.startsWith('--')) {
    problems.push(`--line needs its one line right after it, in quotes. It got "${line}" instead.`);
  }
}

if (problems.length > 0 || tagProblem) {
  for (const problem of problems) console.log(problem);
  if (tagProblem) {
    console.log(tagProblem);
    for (const menuLine of workTagMenu()) console.log(menuLine);
  }
  console.log('Nothing was written and nothing was sent.');
  console.log(USAGE);
  process.exit(1);
}

const tag = flags.tag;
const skill = flags.skill;
const agent = flags.agent;

// ── The harness ─────────────────────────────────────────────────────────────

if (!existsSync(STATUS_PATH)) {
  console.log('No status/status.json yet, so there is nothing to report from. Run  node start.mjs  first.');
  process.exit(0);
}
let status = null;
try {
  status = JSON.parse(readFileSync(STATUS_PATH, 'utf8'));
} catch {
  // Handled below, after the shift log: a broken status file must not cost a
  // shift its local line.
}

// One line saying what this report was understood to be. It never mentions the
// radio, so it reads the same whether check-ins are on or off.
console.log(shift
  ? `Shift finished: agent ${agent}, tag ${tag}, count ${count}${skill ? `, skill ${skill}` : ''}.`
  : `Task finished: tag ${tag}, count ${count}${skill ? `, skill ${skill}` : ''}${agent ? `, agent ${agent}` : ''}.`);

// ── 1. The local record ─────────────────────────────────────────────────────
// Local first, always. The radio comes second, and only when it is on.

/** {YYYY-MM-DD HH:MM}, by this machine's own clock. */
function localStamp(now = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
}

/** Append one line to the shift log, creating the file if this is its first. */
function appendShiftLog(text) {
  const existing = existsSync(SHIFT_LOG_PATH) ? readFileSync(SHIFT_LOG_PATH, 'utf8') : '';
  const gap = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  appendFileSync(SHIFT_LOG_PATH, `${gap}${text}\n`);
}

/**
 * The radio was on and could not be reached. Say so on the shift's own line,
 * which is what makes the silence diagnosable at the next session
 * (library/HIRING.md, "Radio on but unreachable").
 */
function markUnreachable(text) {
  try {
    const log = readFileSync(SHIFT_LOG_PATH, 'utf8');
    const at = `\n${log}`.lastIndexOf(`\n${text}\n`);
    if (at === -1) return;
    const end = at + text.length;
    writeFileSync(SHIFT_LOG_PATH, `${log.slice(0, end)} (radio unreachable)${log.slice(end)}`);
  } catch {
    // The line itself is already written. The marker is best effort.
  }
}

/** Run a sibling script and hand back what it printed. Never throws. */
function runSibling(script, args, timeoutMs) {
  const run = spawnSync(process.execPath, [join(__dirname, script), ...args], {
    cwd: HARNESS_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return { out: String(run.stdout || '').trim(), ok: run.status === 0 && !run.error };
}

// What gets recorded locally: a shift's line in the shift-log shape, anything
// else exactly as given.
let localLine = line;
let shiftLogged = false;
if (line !== null && shift) {
  // The marker is how a schedule is proven. If the caller already wrote one
  // (auto-test: for a wiring test a person kicked off), it is kept as given.
  const note = /^auto(-test)?:/i.test(line) ? line : `auto: ${line}`;
  localLine = `${localStamp()} | ${agent} | count: ${count} | ${note}`;
  try {
    appendShiftLog(localLine);
    shiftLogged = true;
    console.log('Written to status/shift-log.md.');
  } catch (err) {
    console.log(`Could not write status/shift-log.md (${err.code || err.message}). The rest of the report carries on.`);
  }
} else if (shift) {
  console.log('No --line given, so no line was added to status/shift-log.md.');
}

if (status === null) {
  console.log('status/status.json could not be read: it is not valid JSON. Nothing else was done. Fix or restore that file first.');
  process.exit(0);
}

if (localLine !== null && memoryOn(status)) {
  const who = agent || (typeof status.agent_name === 'string' ? status.agent_name.trim() : '');
  if (who) {
    // A shift's memory line is the same line the shift log got. memory.mjs
    // prints its own one line, whether it wrote the note or could not.
    const note = runSibling('memory.mjs', ['note', '--to', `agents/${who}/log.md`, '--line', localLine], 15000);
    if (note.out) console.log(note.out);
  }
}

// ── 2. The radio half: labels only ──────────────────────────────────────────
// The line is never passed below. Off means off: nothing sent, nothing said.

if (radioOn(status)) {
  const args = [
    'signal',
    '--type', shift ? 'routine_completed' : 'task_completed',
    '--tag', tag,
    '--count', String(count),
  ];
  if (agent) args.push('--routine', agent);
  // A skill named here ran. That is the only outcome this script can report.
  if (skill) {
    args.push('--asset', skill, '--asset-kind', 'skill', '--outcome', 'run_completed',
      '--surface', shift ? 'routine' : 'agent');
  }
  const radio = runSibling('radio.mjs', args, 30000);
  if (radio.out) console.log(radio.out);
  else if (!radio.ok) console.log('The radio script could not finish, so nothing was sent. Nothing is lost locally.');
  const unreachable = /didn't answer/.test(radio.out) || (!radio.ok && !radio.out);
  if (shiftLogged && unreachable) markUnreachable(localLine);
}

// A valid report ends here, with exit code 0, whatever the radio did.
