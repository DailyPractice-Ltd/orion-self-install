#!/usr/bin/env node
/**
 * A hired agent's schedule, on this machine's own scheduler.
 *
 *   node status/schedule.mjs wire --agent <roster name> --surface <claude-code|codex>
 *                                 --at <HH:MM> [--days <mon,tue,wed,thu,fri>] [--bin <full path>]
 *   node status/schedule.mjs on   --agent <roster name>
 *   node status/schedule.mjs run  --agent <roster name>
 *   node status/schedule.mjs off  --agent <roster name>
 *
 * What it is for: library/HIRING.md step 6, rung B. When the client's agent
 * software has no scheduled tasks of its own, the computer's scheduler has to
 * start that software at the right time, in this folder, with nobody watching.
 * Writing that by hand means nesting quotes inside quotes for two shells and an
 * XML file, and it used to assume Claude Code was the software. This script
 * does it instead, for the software named in --surface, and it talks to the
 * scheduler itself, so nothing depends on which shell the assistant happens to
 * be typing into.
 *
 * wire   Writes the wake-up, inside this folder only, under status/shifts/:
 *          <name>.sh  (Mac, Linux) or <name>.cmd (Windows): go to this folder
 *                     and start the software with the shift prompt.
 *          world.dailypractice.orion.<name>.plist (Mac): the launchd entry.
 *          <name>.json: what was asked for, so on, run and off need only a name.
 *        It changes nothing outside this folder and switches nothing on.
 * on     Switches the schedule on. This is the change to the client's machine:
 *        tell them what wire printed and run this only on their yes. Safe to
 *        run again after a new wire: it replaces what was there.
 * run    Fires the schedule once, now, through the scheduler itself. This is
 *        the wake-up check of HIRING.md step 7.
 * off    Switches the schedule off. The files stay, so on brings it back.
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
 * On Claude Code the wake-up allows the tools on the agent's job sheet (its
 * `tools:` line), plus the few things every shift needs to read its job and
 * report, and nothing else. It never stops to ask: there is nobody to ask.
 * On Codex it runs in the workspace sandbox with the network allowed, because
 * the shift's report has to reach the radio.
 *
 * Anything it cannot do is one plain explanation and exit 1, with nothing
 * written. Then library/HIRING.md, Part D, "Scheduler failure" is the lane:
 * the agent is hired, works when asked, and its schedule reads "not yet wired".
 *
 * Dependency-free: node built-ins and status/shapes.mjs only.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, statSync, realpathSync, copyFileSync, rmSync,
  openSync, closeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, delimiter, isAbsolute, win32, posix } from 'node:path';
import { homedir } from 'node:os';
import { labelProblem, unattendedRunner, PROMPT_SLOT } from './shapes.mjs';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Windows refuses a scheduled task whose command is longer than this. */
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

/** Split on the commas between tools, not the ones inside Bash(a, b). */
function splitTools(text) {
  const tools = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { tools.push(current); current = ''; continue; }
    current += ch;
  }
  tools.push(current);
  return tools;
}

/**
 * The tools a job sheet allows, as a list. Reads `tools: A, B`, `tools: [A, B]`
 * and the form with one `- A` per line. A trailing `# note` is not a tool.
 * Null when the sheet has no tools at all.
 */
export function jobSheetTools(jobSheet) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(jobSheet);
  if (!front) return null;
  const lines = front[1].split(/\r?\n/);
  const at = lines.findIndex((l) => /^tools:/.test(l));
  if (at === -1) return null;
  const clean = (t) => t.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim();
  const inline = lines[at].slice('tools:'.length).replace(/\s+#.*$/, '').trim();
  let tools;
  if (inline) {
    tools = splitTools(inline.replace(/^\[|\]$/g, ''));
  } else {
    tools = [];
    for (const line of lines.slice(at + 1)) {
      const item = /^\s+-\s+(.*)$/.exec(line);
      if (!item) break;
      tools.push(item[1]);
    }
  }
  const kept = tools.map(clean).filter(Boolean);
  return kept.length > 0 ? kept : null;
}

/**
 * What every shift needs whatever its job: read its job sheet, and run the
 * three scripts its report uses. `echo` is here because of a habit, found by
 * running real shifts: an assistant likes to end a command with
 * `; echo "exit $?"`, and without this the whole line, report included, is
 * refused. It cannot write a file: sending output to a file stays refused.
 */
export const SHIFT_TOOLS = Object.freeze([
  'Read',
  'Bash(node status/done.mjs *)',
  'Bash(node status/memory.mjs *)',
  'Bash(node status/radio.mjs *)',
  'Bash(echo *)',
]);

/**
 * The job sheet's tools plus whatever of SHIFT_TOOLS it does not already
 * cover, as the one comma-separated value Claude Code takes. A sheet that
 * allows all of Bash already covers the three scripts.
 */
export function allowedTools(sheetTools) {
  const all = [...sheetTools];
  for (const tool of SHIFT_TOOLS) {
    const base = tool.split('(')[0];
    if (!all.includes(tool) && !all.includes(base)) all.push(tool);
  }
  return all.join(',');
}

/** One argument, safe inside a POSIX shell script: single quotes, with any single quote inside closed, escaped and reopened. */
export function shQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

/**
 * One argument, safe inside a Windows command file: double quotes. Three
 * characters cannot be carried there without being changed on the way (a
 * double quote ends the argument, a percent sign is read as a variable, and a
 * caret is doubled by `call`), so they are refused rather than mangled.
 */
export function cmdQuote(text) {
  const value = String(text);
  const bad = ['"', '%', '^'].find((ch) => value.includes(ch));
  if (bad) throw new Error(`the character ${bad} cannot be written safely into a Windows command file (found in: ${value.slice(0, 80)})`);
  return `"${value}"`;
}

/** The wake-up file for a Mac or Linux machine. */
export function buildShellWakeUp({ os, folder, bin, args, name, pathDirs = [] }) {
  return [
    os === 'darwin' ? '#!/bin/zsh -l' : '#!/bin/bash -l',
    `# The wake-up for the ${name} agent's schedule. Written by status/schedule.mjs.`,
    '# It goes to this folder and starts the agent software with the shift prompt.',
    `# Switch the schedule off with:  node status/schedule.mjs off --agent ${name}`,
    // A scheduler starts with a bare PATH and reads no .zshrc, so node (and
    // an agent command that is itself a node script) would not be found.
    ...(pathDirs.length > 0 ? [`export PATH=${pathDirs.map(shQuote).join(':')}:"$PATH"`] : []),
    `cd ${shQuote(folder)} || exit 1`,
    // Nobody is there to type, so nothing is waiting on the keyboard.
    `exec ${[bin, ...args].map(shQuote).join(' ')} < /dev/null`,
    '',
  ].join('\n');
}

/** The wake-up file for a Windows machine. Throws when a path holds a character a command file cannot carry. */
export function buildCmdWakeUp({ folder, bin, args, name, logPath, pathDirs = [] }) {
  for (const dir of pathDirs) cmdQuote(dir);
  return [
    '@echo off',
    // The file is written as UTF-8. Without this, a name like Zoë is misread.
    'chcp 65001 >NUL',
    `rem The wake-up for the ${name} agent's schedule. Written by status/schedule.mjs.`,
    'rem It goes to this folder and starts the agent software with the shift prompt.',
    `rem Switch the schedule off with:  node status/schedule.mjs off --agent ${name}`,
    ...(pathDirs.length > 0 ? [`set "PATH=${pathDirs.join(';')};%PATH%"`] : []),
    `cd /d ${cmdQuote(folder)} || exit /b 1`,
    // `call`, because the software's command is often a command file itself.
    // What it prints is kept beside it, or a failed start leaves nothing to read.
    `call ${[bin, ...args].map(cmdQuote).join(' ')} < NUL >> ${cmdQuote(logPath)} 2>&1`,
    '',
  ].join('\r\n');
}

const xml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** launchd and cron both count Sunday as 0 and Monday as 1. */
const WEEKDAY_NUMBER = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * Eight characters that stand for this folder. One machine can hold several
 * harness folders, each with an agent of the same name. Without this, the
 * second schedule would quietly replace the first.
 */
export function folderTag(folder) {
  return createHash('sha256').update(String(folder)).digest('hex').slice(0, 8);
}
export function launchdLabel(name, tag) {
  return `world.dailypractice.orion.${name}.${tag}`;
}
export function windowsTaskName(name, tag) {
  return `Orion ${name} shift (${tag})`;
}
/** How this folder's line is found again in a crontab: by this marker, never by the path. */
export function cronMarker(name, tag) {
  return `# orion-shift:${name}:${tag}`;
}

/** The launchd entry: run the wake-up file at the chosen time. Every string is escaped for XML. */
export function buildPlist({ label, wakeUpPath, logPath, folder, days, hour, minute }) {
  const when = (weekday) => [
    '    <dict>',
    ...(weekday === null ? [] : ['      <key>Weekday</key>', `      <integer>${weekday}</integer>`]),
    '      <key>Hour</key>',
    `      <integer>${hour}</integer>`,
    '      <key>Minute</key>',
    `      <integer>${minute}</integer>`,
    '    </dict>',
  ];
  const slots = days.length === 0 ? when(null) : days.flatMap((d) => when(WEEKDAY_NUMBER[d]));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${xml(label)}</string>`,
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

/**
 * One crontab line for a Linux machine, with the wake-up's own output kept in a
 * log beside it and a marker at the end to find the line by. Throws for a path
 * with a percent sign: cron reads one as a line break.
 */
export function buildCronLine({ wakeUpPath, logPath, days, hour, minute, marker }) {
  if (wakeUpPath.includes('%')) throw new Error('the character % cannot be written safely into a crontab line');
  const dow = days.length === 0 ? '*' : days.map((d) => WEEKDAY_NUMBER[d]).join(',');
  return `${minute} ${hour} * * ${dow} ${shQuote(wakeUpPath)} >> ${shQuote(logPath)} 2>&1 ${marker}`;
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

/** Folders on a Mac that the system guards: the first scheduled run there brings up a question. */
function guardedMacFolder(folder, home) {
  if (!home) return null;
  const guarded = { Documents: 'Documents', Desktop: 'Desktop', Downloads: 'Downloads', 'Library/Mobile Documents': 'iCloud Drive' };
  for (const [dir, words] of Object.entries(guarded)) {
    if (folder === posix.join(home, dir) || folder.startsWith(`${posix.join(home, dir)}/`)) return words;
  }
  return null;
}

/**
 * Everything wire would write, worked out without touching the disk. Returns
 * { problems } when it cannot, or the files, the record, and any notes.
 */
export function plan({ os, folder, name, surface, at, days, bin, sheetTools, nodeDir = null, home = null }) {
  const problems = [];
  const path = os === 'win32' ? win32 : posix;

  const nameTrouble = labelProblem(name, 'agent');
  if (nameTrouble) problems.push(`--agent: ${nameTrouble}`);

  const time = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(at ?? ''));
  if (!time) problems.push('--at needs a time of day as HH:MM on the 24-hour clock, for example 07:00.');

  const badDays = days.filter((d) => !DAYS.includes(d));
  if (badDays.length > 0) problems.push(`--days takes ${DAYS.join(',')}. Not understood: ${badDays.join(', ')}.`);

  // Claude Code is allowed the job sheet's tools and the report's three
  // commands. A sheet with no tools at all is not a finished job sheet.
  if (surface === 'claude-code' && !sheetTools) {
    problems.push(`The job sheet .claude/agents/${name}.md has no tools: line. An agent that runs with nobody watching is allowed what its job sheet names, so add that line first.`);
  }
  const tools = sheetTools ? allowedTools(sheetTools) : undefined;
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
  // Where node and the agent command live, so the wake-up can find both.
  const pathDirs = [...new Set([nodeDir, path.dirname(bin)].filter(Boolean))];
  const wakeUpPath = path.join(shifts, os === 'win32' ? `${name}.cmd` : `${name}.sh`);
  const logPath = path.join(shifts, `${name}.log`);
  const files = [];
  const notes = [];
  const tag = folderTag(folder);
  const record = { agent: name, surface, os, at: atPadded, days: ordered, wake_up: wakeUpPath, log: logPath, tag };

  if (os === 'win32') {
    let text;
    try {
      text = buildCmdWakeUp({ folder, bin, args, name, logPath, pathDirs });
    } catch (err) {
      return { problems: [`This cannot be written for Windows: ${err.message}. Rename or move what holds that character, then run this again.`] };
    }
    // What Windows counts is the task's command: the path and its two quotes.
    if (wakeUpPath.length + 2 > SCHTASKS_TR_MAX) {
      return { problems: [`Windows will not take a scheduled task whose command is longer than ${SCHTASKS_TR_MAX} characters, and this folder's path makes it ${wakeUpPath.length + 2}. Move the harness folder somewhere with a shorter path, then run this again.`] };
    }
    files.push({ path: wakeUpPath, text });
    record.task = windowsTaskName(name, tag);
    notes.push('On a laptop, Windows starts a scheduled task only while it is plugged in. To let it run on battery, open Task Scheduler, find this task, and untick that under Conditions.');
  } else {
    files.push({ path: wakeUpPath, text: buildShellWakeUp({ os, folder, bin, args, name, pathDirs }), executable: true });
    if (os === 'darwin') {
      record.label = launchdLabel(name, tag);
      record.plist = path.join(shifts, `${record.label}.plist`);
      files.push({ path: record.plist, text: buildPlist({ label: record.label, wakeUpPath, logPath, folder, days: ordered, hour, minute }) });
      const guarded = guardedMacFolder(folder, home);
      if (guarded) {
        notes.push(`This folder is in ${guarded}, which macOS guards. The first time the schedule fires, macOS asks once whether zsh may open files there. The answer has to be yes, or the wake-up cannot start. Running  node status/schedule.mjs run --agent ${name}  straight after switching on brings that question up while the client is at the keyboard.`);
      }
    } else {
      record.marker = cronMarker(name, tag);
      try {
        record.cron = buildCronLine({ wakeUpPath, logPath, days: ordered, hour, minute, marker: record.marker });
      } catch (err) {
        return { problems: [`This cannot be written for this machine: ${err.message}. Rename or move what holds that character, then run this again.`] };
      }
    }
  }
  files.push({ path: path.join(shifts, `${name}.json`), text: `${JSON.stringify(record, null, 2)}\n` });
  return {
    problems: [], files, notes, record,
    command: [bin, ...runner.args.map((arg) => (arg === PROMPT_SLOT ? '"<the shift prompt>"' : arg))],
  };
}

/**
 * What switching on, off or firing once means on each kind of machine, as a
 * list of steps. Nothing here touches the machine: apply() does. Commands are
 * given as a name and separate arguments and are never passed through a shell,
 * so no shell's quoting rules can change them.
 *
 * Every list ends by looking. A scheduler can say yes and do nothing (launchd)
 * or say no for a reason that matters (a task that would not delete), so "on"
 * checks the schedule is really there and "off" checks it is really gone.
 */
export function steps(action, record, { home, uid }) {
  const { os } = record;
  if (os === 'darwin') {
    const service = `gui/${uid}/${record.label}`;
    const installed = posix.join(home, 'Library', 'LaunchAgents', `${record.label}.plist`);
    const loaded = ['launchctl', ['print', service]];
    if (action === 'on') {
      return [
        { mkdir: posix.dirname(installed) },
        // Whatever is loaded under this name goes first, or launchd keeps the old times.
        { exec: ['launchctl', ['bootout', service]], mayFail: true },
        { copy: [record.plist, installed] },
        { exec: ['launchctl', ['enable', service]], mayFail: true },
        { exec: ['launchctl', ['bootstrap', `gui/${uid}`, installed]] },
        { exec: loaded, failure: 'launchd took the schedule and then did not keep it.' },
      ];
    }
    if (action === 'off') {
      return [
        { exec: ['launchctl', ['bootout', service]], mayFail: true },
        { remove: installed },
        { gone: loaded, failure: 'launchd still has the schedule loaded. Logging out and back in clears it.' },
      ];
    }
    return [
      { exec: loaded, failure: 'The schedule is not switched on, so there is nothing to fire. Switch it on first.' },
      { exec: ['launchctl', ['kickstart', service]] },
    ];
  }
  if (os === 'win32') {
    const there = ['schtasks', ['/Query', '/TN', record.task]];
    if (action === 'on') {
      const when = record.days.length === 0 ? ['/SC', 'DAILY'] : ['/SC', 'WEEKLY', '/D', record.days.map((d) => d.toUpperCase()).join(',')];
      return [
        // The task's command is only the wake-up file's path, in its own quotes.
        { exec: ['schtasks', ['/Create', '/F', '/TN', record.task, ...when, '/ST', record.at, '/TR', `"${record.wake_up}"`]] },
        { exec: there, failure: 'Windows accepted the task and then did not keep it.' },
      ];
    }
    if (action === 'off') {
      return [
        { exec: ['schtasks', ['/Delete', '/F', '/TN', record.task]], mayFail: true },
        { gone: there, failure: 'Windows would not delete the task, so it will still run. Delete it by hand in Task Scheduler.' },
      ];
    }
    return [
      { exec: there, failure: 'The schedule is not switched on, so there is nothing to fire. Switch it on first.' },
      { exec: ['schtasks', ['/Run', '/TN', record.task]] },
    ];
  }
  // Linux: one line in the user's crontab, found again by its marker.
  if (action === 'on') return [{ crontab: { marker: record.marker, add: record.cron } }];
  if (action === 'off') return [{ crontab: { marker: record.marker, add: null } }];
  // cron has no run-now. Start the wake-up the way cron would, in a bare
  // environment, and only when the line is really in the crontab.
  return [
    { crontab: { marker: record.marker, mustHave: true }, failure: 'The schedule is not switched on, so there is nothing to fire. Switch it on first.' },
    { start: ['env', ['-i', `HOME=${home}`, 'PATH=/usr/bin:/bin', '/bin/bash', '-l', record.wake_up]], log: record.log },
  ];
}

/** The user's crontab as lines. Null when it could not be read: that is never the same as empty. */
function readCrontab(run) {
  const current = run('crontab', ['-l'], { encoding: 'utf8' });
  if (current.status === 0) return String(current.stdout).split('\n').filter((line) => line.trim());
  // A user with no crontab yet is the one failure that means "empty".
  if (/no crontab for/i.test(String(current.stderr || ''))) return [];
  return null;
}

/** Carry the steps out. Returns null on success, or one plain sentence saying what failed. */
export function apply(list, { run = spawnSync, start = spawn } = {}) {
  for (const step of list) {
    try {
      if (step.mkdir) mkdirSync(step.mkdir, { recursive: true });
      else if (step.copy) copyFileSync(step.copy[0], step.copy[1]);
      else if (step.remove) rmSync(step.remove, { force: true });
      else if (step.crontab) {
        const lines = readCrontab(run);
        if (lines === null) return 'This machine\'s crontab could not be read, so it was left exactly as it is.';
        const mine = (line) => line.includes(step.crontab.marker);
        if (step.crontab.mustHave) {
          if (!lines.some(mine)) return step.failure;
          continue;
        }
        const kept = lines.filter((line) => !mine(line));
        if (step.crontab.add) kept.push(step.crontab.add);
        const written = run('crontab', ['-'], { input: kept.length > 0 ? `${kept.join('\n')}\n` : '', encoding: 'utf8' });
        if (written.status !== 0) return `crontab would not take the change: ${String(written.stderr || '').trim() || 'no reason given'}`;
      } else if (step.start) {
        // A shift can run for minutes, so it is started and left to finish on
        // its own, with what it prints kept in the log beside the wake-up.
        const out = openSync(step.log, 'a');
        start(step.start[0], step.start[1], { detached: true, stdio: ['ignore', out, out] }).unref?.();
        closeSync(out);
      } else if (step.gone) {
        // This command has to fail: what it looks for must no longer be there.
        const still = run(step.gone[0], step.gone[1], { encoding: 'utf8' });
        if (!still.error && still.status === 0) return step.failure;
      } else if (step.exec) {
        const [command, args] = step.exec;
        const done = run(command, args, { encoding: 'utf8' });
        const said = String(done.stderr || done.stdout || done.error?.message || '').trim();
        if (!step.mayFail && (done.error || done.status !== 0)) {
          return step.failure || `${command} ${args[0]} did not work: ${said || 'no reason given'}`;
        }
      }
    } catch (err) {
      if (!step.mayFail) return err.message;
    }
  }
  return null;
}

/** Whether this schedule is switched on right now, asked of the scheduler itself. */
export function isOn(record, { uid, run = spawnSync } = {}) {
  if (record.os === 'darwin') return run('launchctl', ['print', `gui/${uid}/${record.label}`], { encoding: 'utf8' }).status === 0;
  if (record.os === 'win32') return run('schtasks', ['/Query', '/TN', record.task], { encoding: 'utf8' }).status === 0;
  const lines = readCrontab(run);
  return lines !== null && lines.some((line) => line.includes(record.marker));
}

// ── The command ─────────────────────────────────────────────────────────────

const USAGE = [
  'Usage: node status/schedule.mjs wire --agent <roster name> --surface <claude-code|codex> --at <HH:MM> [--days <mon,tue,wed,thu,fri>] [--bin <full path>]',
  '       node status/schedule.mjs on | run | off --agent <roster name>',
].join('\n');

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    console.log('Details in the header of this file, and in library/HIRING.md step 6.');
    return 0;
  }
  if (!['wire', 'on', 'run', 'off'].includes(command)) {
    console.log(`"${command}" is not something schedule.mjs does.`);
    console.log(USAGE);
    return 1;
  }
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--') || i + 1 >= rest.length || rest[i + 1].startsWith('--')) {
      console.log(`${arg} is not understood. Nothing was done.`);
      console.log(USAGE);
      return 1;
    }
    flags[arg.slice(2)] = rest[++i];
  }
  const taken = command === 'wire' ? ['agent', 'surface', 'at', 'days', 'bin'] : ['agent'];
  const unknown = Object.keys(flags).filter((k) => !taken.includes(k));
  if (unknown.length > 0) {
    console.log(`Not something schedule.mjs ${command} takes: ${unknown.map((k) => `--${k}`).join(', ')}. Nothing was done.`);
    console.log(USAGE);
    return 1;
  }

  const folder = join(dirname(fileURLToPath(import.meta.url)), '..');
  const name = String(flags.agent ?? '');
  const nameTrouble = labelProblem(name, 'agent');
  if (nameTrouble) {
    console.log(`--agent: ${nameTrouble}`);
    console.log(USAGE);
    return 1;
  }

  if (command !== 'wire') {
    const recordPath = join(folder, 'status', 'shifts', `${name}.json`);
    if (!existsSync(recordPath)) {
      console.log(`There is no wake-up for ${name} in status/shifts/ yet. Run  node status/schedule.mjs wire --agent ${name} ...  first.`);
      return 1;
    }
    let record = null;
    try {
      record = JSON.parse(readFileSync(recordPath, 'utf8'));
    } catch { /* said below */ }
    // The record holds full paths. If the folder has moved, or the record was
    // written on another machine, everything in it points somewhere else.
    const here = (p) => { try { return realpathSync(p); } catch { return null; } };
    const stale = !record || record.os !== process.platform || !record.wake_up
      || !here(record.wake_up) || here(dirname(record.wake_up)) !== here(dirname(recordPath))
      || (record.os === 'darwin' && !here(record.plist));
    if (stale) {
      console.log(`The wake-up for ${name} in status/shifts/ does not match this folder on this machine (the folder was moved, the files were copied from elsewhere, or one is damaged). Run  node status/schedule.mjs wire --agent ${name} ...  again here.`);
      return 1;
    }
    const failed = apply(steps(command, record, { home: homedir(), uid: process.getuid?.() ?? 0 }));
    if (failed) {
      console.log(`That did not work for ${name}: ${failed}`);
      console.log('The agent is still hired and still works when asked: library/HIRING.md, Part D, "Scheduler failure".');
      return 1;
    }
    const when = `${record.at}, ${record.days.length === 0 ? 'every day' : record.days.join(', ')}`;
    if (command === 'on') console.log(`The schedule for ${name} is on: ${when}, by this machine's clock. Now check it really fires:  node status/schedule.mjs run --agent ${name}`);
    else if (command === 'off') console.log(`The schedule for ${name} is off. Its files are still in status/shifts/, so  node status/schedule.mjs on --agent ${name}  brings it back.`);
    else console.log(`Fired once, now. A new line for ${name} should land in status/shift-log.md within a few minutes. What the wake-up itself printed is in status/shifts/${name}.log.`);
    return 0;
  }

  const sheetPath = join(folder, '.claude', 'agents', `${name}.md`);
  if (!existsSync(sheetPath)) {
    console.log(`There is no job sheet at .claude/agents/${name}.md, so there is no agent to schedule. Nothing was written.`);
    return 1;
  }
  const sheetTools = jobSheetTools(readFileSync(sheetPath, 'utf8'));
  const wanted = unattendedRunner(flags.surface);
  if (flags.bin) {
    let isFile = false;
    try { isFile = isAbsolute(flags.bin) && statSync(flags.bin).isFile(); } catch { /* not there */ }
    if (!isFile) {
      console.log(`--bin needs the full path of the command's own file. "${flags.bin}" is not one. Nothing was written.`);
      return 1;
    }
  }
  // The wake-up file is what a switched-on schedule runs. Rewriting it under a
  // live schedule would change what runs before anyone said yes.
  const oldRecordPath = join(folder, 'status', 'shifts', `${name}.json`);
  if (existsSync(oldRecordPath)) {
    let old = null;
    try { old = JSON.parse(readFileSync(oldRecordPath, 'utf8')); } catch { /* a damaged record is simply replaced */ }
    if (old && old.os === process.platform && isOn(old, { uid: process.getuid?.() ?? 0 })) {
      console.log(`The schedule for ${name} is switched on (${old.at}, ${old.days?.length ? old.days.join(', ') : 'every day'}). Switch it off first, then wire it again:  node status/schedule.mjs off --agent ${name}`);
      console.log('Nothing was written.');
      return 1;
    }
  }
  const bin = flags.bin || (wanted.schedulable ? findOnPath(wanted.bin) : null);
  const days = flags.days ? String(flags.days).toLowerCase().split(',').map((d) => d.trim()).filter(Boolean) : [];

  const result = plan({
    os: process.platform, folder, name, surface: flags.surface, at: flags.at, days, bin, sheetTools,
    nodeDir: dirname(process.execPath), home: homedir(),
  });
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
  const { record } = result;
  console.log(`The ${name} agent will be started with: ${result.command.join(' ')}`);
  console.log(`When: ${record.at}, ${record.days.length === 0 ? 'every day' : record.days.join(', ')}, by this machine's clock.`);
  for (const note of result.notes) console.log(note);
  console.log('Nothing is switched on yet. Switching on is a change to the machine, so tell the client what it does and run this on their yes:');
  console.log(`  node status/schedule.mjs on --agent ${name}`);
  console.log(`To switch it off again:  node status/schedule.mjs off --agent ${name}`);
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
