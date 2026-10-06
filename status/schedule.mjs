#!/usr/bin/env node
/**
 * Build the wake-up for a hired agent's schedule, on this machine's own scheduler.
 *
 *   node status/schedule.mjs wire --agent <roster name> --surface <claude-code|codex>
 *                                 --at <HH:MM> [--days <mon,tue,wed,thu,fri>] [--bin <full path>]
 *
 * What it is for: library/HIRING.md step 6, rung B. When the client's agent
 * software has no scheduled tasks of its own, the computer's scheduler has to
 * start that software at the right time, in this folder, with nobody watching.
 * Writing that entry by hand means nesting quotes inside quotes for two shells
 * and an XML file, and it used to assume Claude Code was the software. This
 * script writes it instead, for the software named in --surface.
 *
 *   --agent    The roster name of the hired agent. Its job sheet must exist at
 *              .claude/agents/<name>.md.
 *   --surface  The agent software that is running this hire right now. Not what
 *              was recorded on day one: a machine can have two, and the client
 *              may have moved. Only claude-code and codex can be started with
 *              nobody watching. Anything else is refused, plainly.
 *   --at       The time of day, 24-hour, this machine's own clock.
 *   --days     Which days, as mon,tue,wed,thu,fri,sat,sun. Leave it out for
 *              every day. A schedule finer than a time of day (every 30
 *              minutes, say) is beyond this script: use a scheduled task inside
 *              the agent software (rung A).
 *   --bin      The full path of the software's command, when it is not on PATH.
 *
 * What it writes, and where. Only inside this folder, under status/shifts/:
 *   <name>.sh  (Mac, Linux)   the wake-up: go to this folder, start the software
 *   <name>.cmd (Windows)      with the shift prompt.
 *   world.dailypractice.orion.<name>.plist (Mac only)   the launchd entry that
 *                             runs the wake-up at the chosen time.
 * It changes nothing outside this folder and switches nothing on. It prints the
 * one command that switches the schedule on, and the one that switches it off.
 * A scheduled task is a change to the client's machine: show them the first
 * command and run it only on their yes.
 *
 * On Claude Code the wake-up allows exactly the tools on the agent's job sheet
 * (its `tools:` line) and nothing else, and never stops to ask: there is nobody
 * to ask. On Codex it runs in the workspace sandbox with the network allowed,
 * because the shift's report has to reach the radio.
 *
 * Anything it cannot do is one plain explanation and exit 1, with nothing
 * written. Then library/HIRING.md, Part D, "Scheduler failure" is the lane:
 * the agent is hired, works when asked, and its schedule reads "not yet wired".
 *
 * Dependency-free: node built-ins and status/shapes.mjs only.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, statSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, delimiter, win32, posix } from 'node:path';
import { labelProblem, unattendedRunner, PROMPT_SLOT } from './shapes.mjs';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Windows refuses a /TR value longer than this. */
export const SCHTASKS_TR_MAX = 261;

// ── The pieces, as plain functions (tests call these directly) ───────────────

/**
 * The words the woken software is given. Kept free of quote characters, and
 * word for word the prompt library/HIRING.md gives for a scheduled task inside
 * the agent software, so both rungs wake the agent the same way.
 */
export function shiftPrompt({ folder, name }) {
  return `Open ${folder} and run the ${name} shift: first open the agent/adapters file for the software you are running in, so you know how to reach the radio here; then read .claude/agents/${name}.md, do the job section, then the report section with --shift. Stage everything; ask no questions.`;
}

/** The `tools:` line of a job sheet, as one comma-separated value with no stray spaces. Null when there is none. */
export function jobSheetTools(jobSheet) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(jobSheet);
  if (!front) return null;
  const line = /^tools:[ \t]*(.+)$/m.exec(front[1]);
  if (!line) return null;
  // Split on the commas between tools, not the ones inside Bash(a, b).
  const tools = [];
  let depth = 0;
  let current = '';
  for (const ch of line[1].trim().replace(/^\[|\]$/g, '')) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { tools.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  tools.push(current.trim());
  const kept = tools.map((t) => t.replace(/^["']|["']$/g, '')).filter(Boolean);
  return kept.length > 0 ? kept.join(',') : null;
}

/** One argument, safe inside a POSIX shell script: single quotes, with any single quote inside closed, escaped and reopened. */
export function shQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

/** One argument, safe inside a Windows batch file: double quotes, with % doubled. A double quote cannot be carried at all. */
export function cmdQuote(text) {
  const value = String(text);
  if (value.includes('"')) throw new Error('a double quote cannot be written into a Windows command file');
  return `"${value.replace(/%/g, '%%')}"`;
}

/** The wake-up file for a Mac or Linux machine. */
export function buildShellWakeUp({ os, folder, bin, args, name }) {
  return [
    os === 'darwin' ? '#!/bin/zsh -l' : '#!/bin/bash -l',
    `# The wake-up for the ${name} agent's schedule. Written by status/schedule.mjs.`,
    '# It goes to this folder and starts the agent software with the shift prompt.',
    '# To stop the schedule, use the "off" command status/schedule.mjs printed.',
    `cd ${shQuote(folder)} || exit 1`,
    // Nobody is there to type, so nothing is waiting on the keyboard.
    `exec ${[bin, ...args].map(shQuote).join(' ')} < /dev/null`,
    '',
  ].join('\n');
}

/** The wake-up file for a Windows machine. */
export function buildCmdWakeUp({ folder, bin, args, name }) {
  return [
    '@echo off',
    `rem The wake-up for the ${name} agent's schedule. Written by status/schedule.mjs.`,
    'rem It goes to this folder and starts the agent software with the shift prompt.',
    `cd /d ${cmdQuote(folder)} || exit /b 1`,
    // `call`, because the software's command is often a batch file itself.
    `call ${[bin, ...args].map(cmdQuote).join(' ')} < NUL`,
    '',
  ].join('\r\n');
}

const xml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** launchd counts Sunday as 0 and Monday as 1. */
const LAUNCHD_WEEKDAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function launchdLabel(name) {
  return `world.dailypractice.orion.${name}`;
}

/** The launchd entry: run the wake-up file at the chosen time. Every string is escaped for XML. */
export function buildPlist({ name, wakeUpPath, logPath, folder, days, hour, minute }) {
  const when = (weekday) => [
    '    <dict>',
    ...(weekday === null ? [] : ['      <key>Weekday</key>', `      <integer>${weekday}</integer>`]),
    '      <key>Hour</key>',
    `      <integer>${hour}</integer>`,
    '      <key>Minute</key>',
    `      <integer>${minute}</integer>`,
    '    </dict>',
  ];
  const slots = days.length === 0 ? when(null) : days.flatMap((d) => when(LAUNCHD_WEEKDAY[d]));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${xml(launchdLabel(name))}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    '    <string>/bin/zsh</string>',
    '    <string>-l</string>',
    `    <string>${xml(wakeUpPath)}</string>`,
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${xml(folder)}</string>`,
    '  <key>StartCalendarInterval</key>',
    '  <array>',
    ...slots,
    '  </array>',
    '  <key>StandardOutPath</key>',
    `  <string>${xml(logPath)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${xml(logPath)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** The Windows task: its /TR value is only the quoted path of the wake-up file, so it stays short. */
export function buildSchtasks({ name, wakeUpPath, days, at }) {
  const tr = `\\"${wakeUpPath}\\"`;
  // What Windows counts is the value itself: the path and its two quotes.
  const trLength = wakeUpPath.length + 2;
  const when = days.length === 0 ? '/SC DAILY' : `/SC WEEKLY /D ${days.map((d) => d.toUpperCase()).join(',')}`;
  return {
    trLength,
    on: `schtasks /Create /F /TN "Orion ${name} shift" ${when} /ST ${at} /TR "${tr}"`,
    off: `schtasks /Delete /F /TN "Orion ${name} shift"`,
  };
}

/** One crontab line for a Linux machine. cron counts Sunday as 0. */
export function buildCronLine({ wakeUpPath, days, hour, minute }) {
  const dow = days.length === 0 ? '*' : days.map((d) => LAUNCHD_WEEKDAY[d]).join(',');
  return `${minute} ${hour} * * ${dow} ${shQuote(wakeUpPath)}`;
}

/** Look for a command on PATH the way a shell would. Null when it is not there. */
export function findOnPath(bin, { env = process.env, platform = process.platform } = {}) {
  const exts = platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of String(env.PATH || env.Path || '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, bin + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

/**
 * Everything the script would write and print, worked out without touching the
 * disk. Returns { problems } when it cannot, or the files and the two commands.
 */
export function plan({ os, folder, name, surface, at, days, bin, tools }) {
  const problems = [];
  const path = os === 'win32' ? win32 : posix;

  const nameTrouble = labelProblem(name, 'agent');
  if (nameTrouble) problems.push(`--agent: ${nameTrouble}`);

  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(at ?? ''));
  if (!time) problems.push('--at needs a time of day as HH:MM on the 24-hour clock, for example 07:00.');

  const badDays = days.filter((d) => !DAYS.includes(d));
  if (badDays.length > 0) problems.push(`--days takes ${DAYS.join(',')}. Not understood: ${badDays.join(', ')}.`);

  // Claude Code is given the job sheet's own tools and nothing else. Without
  // that list there is nothing it may do, and nobody to ask.
  if (surface === 'claude-code' && !tools) {
    problems.push(`The job sheet .claude/agents/${name}.md has no tools: line. An agent that runs with nobody watching is allowed exactly the tools on its job sheet, so add that line first.`);
  }
  const runner = unattendedRunner(surface, { tools });
  if (!runner.schedulable) {
    problems.push(surface
      ? `"${surface}" cannot be started with nobody watching. ${runner.note}`
      : '--surface is missing. Name the agent software that is running this hire right now: claude-code or codex.');
  }
  if (problems.length > 0) return { problems };
  if (!bin) {
    return { problems: [`Could not find the ${runner.bin} command on this machine. If the client only uses the app, wire the schedule inside the app instead (library/HIRING.md step 6, rung A). If the command is installed somewhere unusual, give its full path with --bin.`] };
  }

  const hour = Number(time[1]);
  const minute = Number(time[2]);
  const atPadded = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const ordered = DAYS.filter((d) => days.includes(d));
  const shifts = path.join(folder, 'status', 'shifts');
  const prompt = shiftPrompt({ folder, name });
  const args = runner.args.map((arg) => (arg === PROMPT_SLOT ? prompt : arg));
  const files = [];
  let on;
  let off;

  if (os === 'win32') {
    const wakeUpPath = path.join(shifts, `${name}.cmd`);
    let text;
    try {
      text = buildCmdWakeUp({ folder, bin, args, name });
    } catch (err) {
      return { problems: [`This cannot be written for Windows: ${err.message}.`] };
    }
    const task = buildSchtasks({ name, wakeUpPath, days: ordered, at: atPadded });
    if (task.trLength > SCHTASKS_TR_MAX) {
      return { problems: [`Windows will not take a scheduled task whose command is longer than ${SCHTASKS_TR_MAX} characters, and this folder's path makes it ${task.trLength}. Move the harness folder somewhere with a shorter path, then run this again.`] };
    }
    files.push({ path: wakeUpPath, text });
    on = task.on;
    off = task.off;
  } else {
    const wakeUpPath = path.join(shifts, `${name}.sh`);
    files.push({ path: wakeUpPath, text: buildShellWakeUp({ os, folder, bin, args, name }), executable: true });
    if (os === 'darwin') {
      const label = launchdLabel(name);
      const plistPath = path.join(shifts, `${label}.plist`);
      const installed = `~/Library/LaunchAgents/${label}.plist`;
      files.push({
        path: plistPath,
        text: buildPlist({ name, wakeUpPath, logPath: path.join(shifts, `${name}.log`), folder, days: ordered, hour, minute }),
      });
      on = `mkdir -p ~/Library/LaunchAgents && cp ${shQuote(plistPath)} ${installed} && launchctl load -w ${installed}`;
      off = `launchctl unload -w ${installed}; rm -f ${installed}`;
    } else {
      const line = buildCronLine({ wakeUpPath, days: ordered, hour, minute });
      on = `(crontab -l 2>/dev/null; echo ${shQuote(line)}) | crontab -`;
      off = `crontab -l | grep -v -F ${shQuote(wakeUpPath)} | crontab -`;
    }
  }
  return {
    problems: [], files, on, off, at: atPadded, days: ordered,
    command: [bin, ...runner.args.map((arg) => (arg === PROMPT_SLOT ? '"<the shift prompt>"' : arg))],
  };
}

// ── The command ─────────────────────────────────────────────────────────────

const USAGE = 'Usage: node status/schedule.mjs wire --agent <roster name> --surface <claude-code|codex> --at <HH:MM> [--days <mon,tue,wed,thu,fri>] [--bin <full path>]';

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    console.log('Details in the header of this file, and in library/HIRING.md step 6.');
    return 0;
  }
  if (command !== 'wire') {
    console.log(`"${command}" is not something schedule.mjs does.`);
    console.log(USAGE);
    return 1;
  }
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--') || i + 1 >= rest.length) {
      console.log(`${arg} is not understood. Nothing was written.`);
      console.log(USAGE);
      return 1;
    }
    flags[arg.slice(2)] = rest[++i];
  }
  const unknown = Object.keys(flags).filter((k) => !['agent', 'surface', 'at', 'days', 'bin'].includes(k));
  if (unknown.length > 0) {
    console.log(`Not something schedule.mjs takes: ${unknown.map((k) => `--${k}`).join(', ')}. Nothing was written.`);
    console.log(USAGE);
    return 1;
  }

  const folder = join(dirname(fileURLToPath(import.meta.url)), '..');
  const name = String(flags.agent ?? '');
  const sheetPath = join(folder, '.claude', 'agents', `${name}.md`);
  if (!labelProblem(name, 'agent') && !existsSync(sheetPath)) {
    console.log(`There is no job sheet at .claude/agents/${name}.md, so there is no agent to schedule. Nothing was written.`);
    return 1;
  }
  const tools = existsSync(sheetPath) ? jobSheetTools(readFileSync(sheetPath, 'utf8')) : null;
  const wanted = unattendedRunner(flags.surface, { tools });
  const bin = flags.bin || (wanted.schedulable ? findOnPath(wanted.bin) : null);
  if (flags.bin && !existsSync(flags.bin)) {
    console.log(`--bin: there is no file at ${flags.bin}. Nothing was written.`);
    return 1;
  }
  const days = flags.days ? String(flags.days).toLowerCase().split(',').map((d) => d.trim()).filter(Boolean) : [];

  const result = plan({ os: process.platform, folder, name, surface: flags.surface, at: flags.at, days, bin, tools });
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.log(problem);
    console.log('Nothing was written. The schedule is not wired: library/HIRING.md, Part D, "Scheduler failure".');
    return 1;
  }

  for (const file of result.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.text);
    if (file.executable) chmodSync(file.path, 0o755);
    console.log(`Written: ${file.path}`);
  }
  console.log(`The ${name} agent will be started with: ${result.command.join(' ')}`);
  console.log(`When: ${result.at}, ${result.days.length === 0 ? 'every day' : result.days.join(', ')}, by this machine's clock.`);
  console.log('Nothing is switched on yet. This is a change to the machine, so show the client this command and run it on their yes:');
  console.log(`  ${result.on}`);
  console.log('To switch the schedule off again:');
  console.log(`  ${result.off}`);
  return 0;
}

// Run as a command, not when a test imports the builders. Compared as real
// paths: a folder reached through a link (a synced drive, /tmp on a Mac) has
// two spellings, and a plain comparison would make the command do nothing.
function runAsCommand() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (runAsCommand()) process.exit(main(process.argv.slice(2)));
