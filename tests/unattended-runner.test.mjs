/**
 * A hired agent's schedule on the computer's own scheduler (library/HIRING.md
 * step 6, rung B): status/shapes.mjs says how each agent software is started
 * with nobody watching, and status/schedule.mjs writes the wake-up and talks to
 * the scheduler. The wake-up used to be written by hand as `claude -p` whatever
 * the machine ran, so a Codex machine was handed a task that could never start.
 *
 * These tests call the real builders, run a real wake-up file through a real
 * shell, and hold HIRING.md and the adapters to what the code does. Nothing
 * here switches anything on: the scheduler is always a stand-in.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { unattendedRunner, PROMPT_SLOT } from '../status/shapes.mjs';
import {
  shiftPrompt, jobSheetTools, allowedTools, SHIFT_TOOLS, shQuote, cmdQuote, buildShellWakeUp, buildPlist,
  plan, steps, apply, isOn, folderTag, SCHTASKS_TR_MAX,
} from '../status/schedule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

// ── How each agent software is started ───────────────────────────────────────

test('claude-code: the prompt comes straight after -p, before the tool list', () => {
  const r = unattendedRunner('claude-code', { tools: 'Read,Bash' });
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'claude');
  // --allowedTools takes every word after it as a tool name. A prompt placed
  // after it is swallowed, and the run stops with "no prompt".
  assert.ok(r.args.indexOf(PROMPT_SLOT) < r.args.indexOf('--allowedTools'));
  assert.deepEqual(r.args, ['-p', PROMPT_SLOT, '--permission-mode', 'dontAsk', '--allowedTools', 'Read,Bash']);
});

test('codex: exec, outside a git repo, sandboxed, with the network allowed', () => {
  const r = unattendedRunner('codex');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'codex');
  assert.equal(r.args[0], 'exec');
  assert.ok(r.args.includes('--skip-git-repo-check'));
  // Without this a scheduled shift does its work and can never report it.
  assert.ok(r.args.includes('sandbox_workspace_write.network_access=true'));
  assert.equal(r.args.at(-1), PROMPT_SLOT);
});

test('software that cannot start on its own is never given a command', () => {
  for (const surface of ['cursor', 'copilot-vscode', 'claude-desktop', 'chatgpt-app', 'website-chat', 'something-new', null, undefined]) {
    const r = unattendedRunner(surface);
    assert.equal(r.schedulable, false, `${surface} should not be schedulable`);
    assert.equal(r.bin, null);
    assert.equal(r.args, null);
    assert.ok(typeof r.note === 'string' && r.note.length > 0);
  }
});

// ── The prompt and the job sheet ─────────────────────────────────────────────

test('the shift prompt has no quote characters and is the one HIRING.md gives for rung A', () => {
  const prompt = shiftPrompt({ folder: '{absolute folder path}', name: '{name}' });
  assert.equal(/['"`%^]/.test(prompt), false, 'the shift prompt has a character a command file cannot carry');
  const hiring = read('library/HIRING.md');
  const at = hiring.indexOf('`Open {absolute folder path} and run the {name} shift:');
  assert.ok(at !== -1, 'the shift prompt is missing from HIRING.md');
  const inHiring = hiring.slice(at + 1, hiring.indexOf('`', at + 1));
  assert.equal(oneLine(inHiring), prompt, 'HIRING.md and status/schedule.mjs give different shift prompts');
});

test('the tools on a job sheet are read in every shape people write them', () => {
  const sheet = (tools) => `---\nname: x\n${tools}\nstatus: hired\n---\n\n# X\n`;
  assert.deepEqual(jobSheetTools(sheet('tools: Read, Write, Edit, Bash')), ['Read', 'Write', 'Edit', 'Bash']);
  assert.deepEqual(jobSheetTools(sheet('tools: [Read, "Bash(node status/*)"]')), ['Read', 'Bash(node status/*)']);
  // A comma inside the brackets of one tool does not split it.
  assert.deepEqual(jobSheetTools(sheet('tools: Read, Bash(git log, git diff), mcp__gmail__search_threads')), ['Read', 'Bash(git log, git diff)', 'mcp__gmail__search_threads']);
  // One per line, and a note after a tool is not part of its name.
  assert.deepEqual(jobSheetTools(sheet('tools:\n  - Read\n  - Bash  # runs the report')), ['Read', 'Bash']);
  assert.deepEqual(jobSheetTools(sheet('tools: Read, Bash # reads only')), ['Read', 'Bash']);
  assert.equal(jobSheetTools(sheet('description: no tools here')), null);
  assert.equal(jobSheetTools(sheet('tools:')), null);
  assert.equal(jobSheetTools('# no front matter\ntools: Read'), null);
});

test('a shift is always allowed to read its job and run its report, and nothing is added twice', () => {
  // A least-privilege sheet that names neither Read nor Bash still reports.
  assert.equal(allowedTools(['Grep', 'mcp__hubspot__search']), ['Grep', 'mcp__hubspot__search', ...SHIFT_TOOLS].join(','));
  // A sheet that allows all of Bash already covers the three scripts.
  assert.equal(allowedTools(['Read', 'Bash']), 'Read,Bash');
  assert.equal(allowedTools(['Read']), ['Read', ...SHIFT_TOOLS.slice(1)].join(','));
  for (const script of ['done', 'memory', 'radio']) assert.ok(SHIFT_TOOLS.includes(`Bash(node status/${script}.mjs *)`));
  // Found by running real shifts: a command ended with ; echo "exit $?" is refused whole without this.
  assert.ok(SHIFT_TOOLS.includes('Bash(echo *)'));
  // Nothing here lets a shift write a file its job sheet did not allow.
  assert.equal(SHIFT_TOOLS.some((tool) => /^(Write|Edit|Bash)$/.test(tool)), false);
});

// ── A real wake-up file, through a real shell ────────────────────────────────

test('a wake-up file hands every argument over intact, awkward folder name included', { skip: process.platform === 'win32' }, () => {
  const base = mkdtempSync(join(tmpdir(), 'orion-wake-'));
  try {
    const folder = join(base, "Jane's harness & co");
    mkdirSync(folder, { recursive: true });
    // Stands in for the agent software: writes down exactly what it was given.
    const fake = join(base, 'fake agent.sh');
    writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$PWD" > "$(dirname "$0")/pwd.txt"\nprintf "%s\\n" "$PATH" > "$(dirname "$0")/path.txt"\nfor a in "$@"; do printf "%s\\n" "$a"; done > "$(dirname "$0")/args.txt"\n');
    chmodSync(fake, 0o755);
    const prompt = shiftPrompt({ folder, name: 'probe' });
    const args = unattendedRunner('claude-code', { tools: allowedTools(['Grep']) }).args.map((a) => (a === PROMPT_SLOT ? prompt : a));
    const wakeUp = join(base, 'probe.sh');
    writeFileSync(wakeUp, buildShellWakeUp({ os: 'linux', folder, bin: fake, args, name: 'probe', pathDirs: ["/opt/node's bin", '/opt/agent'] }));
    // A scheduler's own environment: almost nothing in it.
    const run = spawnSync('/bin/sh', [wakeUp], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readFileSync(join(base, 'args.txt'), 'utf8').trimEnd().split('\n'), args);
    assert.ok(readFileSync(join(base, 'pwd.txt'), 'utf8').trim().endsWith("Jane's harness & co"));
    // node and the agent command are findable although the scheduler's PATH has neither.
    assert.equal(readFileSync(join(base, 'path.txt'), 'utf8').trim(), "/opt/node's bin:/opt/agent:/usr/bin:/bin");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('quoting: a single quote survives a shell file; what a Windows file cannot carry is refused', () => {
  assert.equal(shQuote("it's"), `'it'\\''s'`);
  assert.equal(cmdQuote('C:\\Users\\Jane Smith\\x.cmd'), '"C:\\Users\\Jane Smith\\x.cmd"');
  for (const bad of ['say "hi"', '100% done', 'a^b']) assert.throws(() => cmdQuote(bad), /cannot be written safely/);
});

// ── What wire writes on each kind of machine ─────────────────────────────────

const mac = (over = {}) => plan({
  os: 'darwin', folder: "/Users/jane/Orion & Jane's", name: 'prospecting', surface: 'codex',
  at: '7:05', days: ['fri', 'mon'], bin: '/opt/homebrew/bin/codex', sheetTools: null,
  nodeDir: '/Users/jane/.nvm/versions/node/v22/bin', home: '/Users/jane', ...over,
});

test('Mac: a wake-up file, a launchd entry that is valid XML, and a record', () => {
  const p = mac();
  assert.deepEqual(p.problems, []);
  assert.equal(p.record.at, '07:05');
  assert.deepEqual(p.record.days, ['mon', 'fri']);
  const [wakeUp, plist, record] = p.files;
  assert.ok(wakeUp.path.endsWith('/status/shifts/prospecting.sh'));
  assert.equal(wakeUp.executable, true);
  // node installed through a version manager is found: its folder is put on PATH.
  assert.ok(wakeUp.text.includes(`export PATH='/Users/jane/.nvm/versions/node/v22/bin':'/opt/homebrew/bin':"$PATH"`));
  assert.ok(wakeUp.text.includes(`cd '/Users/jane/Orion & Jane'\\''s' || exit 1`));
  assert.ok(wakeUp.text.includes(`exec '/opt/homebrew/bin/codex' 'exec'`));
  assert.ok(wakeUp.text.trimEnd().endsWith('< /dev/null'));
  const tag = folderTag("/Users/jane/Orion & Jane's");
  assert.match(tag, /^[0-9a-f]{8}$/);
  assert.equal(p.record.label, `world.dailypractice.orion.prospecting.${tag}`);
  assert.ok(plist.path.endsWith(`/status/shifts/world.dailypractice.orion.prospecting.${tag}.plist`));
  assert.ok(plist.text.includes(`<string>world.dailypractice.orion.prospecting.${tag}</string>`));
  // The ampersand and the apostrophe in the folder name are escaped for XML,
  // and no shell quoting leaks into the entry.
  assert.ok(plist.text.includes('Orion &amp; Jane&apos;s/status/shifts/prospecting.sh</string>'));
  assert.equal(/<string>[^<]*&(?!amp;|apos;|lt;|gt;|quot;)/.test(plist.text), false, 'a raw ampersand is left in the plist');
  // launchd counts Monday as 1 and Friday as 5.
  assert.deepEqual([...plist.text.matchAll(/<key>Weekday<\/key>\s*<integer>(\d)<\/integer>/g)].map((m) => m[1]), ['1', '5']);
  assert.ok(record.path.endsWith('/status/shifts/prospecting.json'));
  assert.deepEqual(JSON.parse(record.text), p.record);
  assert.deepEqual(p.notes, []);
});

test('Mac: a folder macOS guards gets one plain warning, not a refusal', () => {
  for (const folder of ['/Users/jane/Documents/Orion', '/Users/jane/Desktop', '/Users/jane/Library/Mobile Documents/com~apple~CloudDocs/Orion']) {
    const p = mac({ folder });
    assert.deepEqual(p.problems, []);
    assert.equal(p.notes.length, 1);
    assert.match(p.notes[0], /macOS asks once whether zsh may open files there/);
  }
  assert.deepEqual(mac({ folder: '/Users/jane/DocumentsOther/Orion' }).notes, []);
});

test('Mac: the launchd entry passes the system\'s own check', { skip: process.platform !== 'darwin' }, () => {
  const base = mkdtempSync(join(tmpdir(), 'orion-plist-'));
  try {
    const file = join(base, 'entry.plist');
    writeFileSync(file, buildPlist({ label: 'world.dailypractice.orion.probe.0a1b2c3d', wakeUpPath: "/tmp/a & b's/probe.sh", logPath: '/tmp/x.log', folder: "/tmp/a & b's", days: [], hour: 7, minute: 0 }));
    const lint = spawnSync('plutil', ['-lint', file], { encoding: 'utf8' });
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

const windows = (over = {}) => plan({
  os: 'win32', folder: 'D:\\Work\\Orion', name: 'prospecting', surface: 'claude-code',
  at: '07:00', days: ['mon', 'tue'], bin: 'C:\\Users\\Zoë Smith\\AppData\\Roaming\\npm\\claude.cmd', sheetTools: ['Read', 'Bash'],
  nodeDir: 'C:\\Program Files\\nodejs', ...over,
});

test('Windows: a command file that survives spaces, another drive and accented names', () => {
  const p = windows();
  assert.deepEqual(p.problems, []);
  const [wakeUp] = p.files;
  assert.ok(wakeUp.path.endsWith('\\status\\shifts\\prospecting.cmd'));
  const lines = wakeUp.text.split('\r\n');
  assert.equal(lines[0], '@echo off');
  // The file is UTF-8, and says so before any path is read.
  assert.equal(lines[1], 'chcp 65001 >NUL');
  assert.ok(lines.includes('set "PATH=C:\\Program Files\\nodejs;C:\\Users\\Zoë Smith\\AppData\\Roaming\\npm;%PATH%"'));
  // /d, or a folder on another drive is never entered.
  assert.ok(lines.includes('cd /d "D:\\Work\\Orion" || exit /b 1'));
  // The path has a space in it and stays one word. `call`, because it is a command file itself.
  assert.ok(wakeUp.text.includes('call "C:\\Users\\Zoë Smith\\AppData\\Roaming\\npm\\claude.cmd" "-p" "Open D:\\Work\\Orion and run'));
  // What it prints is kept, or a failed start leaves nothing to read.
  assert.ok(wakeUp.text.trimEnd().endsWith('< NUL >> "D:\\Work\\Orion\\status\\shifts\\prospecting.log" 2>&1'));
  assert.equal(p.record.task, `Orion prospecting shift (${folderTag('D:\\Work\\Orion')})`);
  assert.match(p.notes.join(' '), /only while it is plugged in/);
});

test('Windows: what a command file cannot carry, or Windows will not accept, is refused', () => {
  // A percent sign would be read as a variable, twice over under `call`.
  const percent = windows({ folder: 'D:\\Work\\Orion 100%' });
  assert.equal(percent.files, undefined);
  assert.match(percent.problems[0], /character % cannot be written safely/);
  // The task's command is only the file's path, and even that has a limit.
  assert.ok(shiftPrompt({ folder: 'C:\\Orion', name: 'prospecting' }).length > SCHTASKS_TR_MAX);
  const deep = windows({ folder: `C:\\${'very-long-folder-name\\'.repeat(12)}Orion` });
  assert.equal(deep.files, undefined);
  assert.match(deep.problems[0], /shorter path/);
});

test('Linux: one crontab line, with a log', () => {
  const p = plan({ os: 'linux', folder: '/home/jane/orion', name: 'dream', surface: 'codex', at: '02:00', days: ['sun'], bin: '/usr/bin/codex', sheetTools: null });
  assert.deepEqual(p.problems, []);
  const marker = `# orion-shift:dream:${folderTag('/home/jane/orion')}`;
  assert.equal(p.record.marker, marker);
  assert.equal(p.record.cron, `0 2 * * 0 '/home/jane/orion/status/shifts/dream.sh' >> '/home/jane/orion/status/shifts/dream.log' 2>&1 ${marker}`);
  // cron reads a percent sign as a line break.
  const percent = plan({ os: 'linux', folder: '/home/jane/100% orion', name: 'dream', surface: 'codex', at: '02:00', days: [], bin: '/usr/bin/codex', sheetTools: null });
  assert.equal(percent.files, undefined);
  assert.match(percent.problems[0], /character % cannot be written safely/);
});

test('two harness folders on one machine never share a schedule name', () => {
  const a = mac({ folder: '/Users/jane/Neo' }).record;
  const b = mac({ folder: '/Users/jane/PA' }).record;
  assert.notEqual(a.label, b.label);
  assert.notEqual(windows({ folder: 'D:\\Neo' }).record.task, windows({ folder: 'D:\\PA' }).record.task);
});

test('what it cannot do is said plainly and nothing is planned', () => {
  assert.match(mac({ at: '7am' }).problems.join(' '), /HH:MM/);
  assert.match(mac({ days: ['monday'] }).problems.join(' '), /Not understood: monday/);
  assert.match(mac({ surface: 'cursor' }).problems.join(' '), /cannot be started with nobody watching/);
  assert.match(mac({ surface: undefined }).problems.join(' '), /--surface is missing/);
  assert.match(mac({ bin: null }).problems.join(' '), /Could not find the codex command/);
  // Claude Code with no tools line: the job sheet is not finished.
  assert.match(mac({ surface: 'claude-code', bin: '/usr/local/bin/claude', sheetTools: null }).problems.join(' '), /no tools: line/);
  for (const bad of [mac({ at: '7am' }), mac({ surface: 'cursor' }), mac({ bin: null })]) assert.equal(bad.files, undefined);
});

// ── Switching on, firing once, switching off ─────────────────────────────────

test('Mac: on replaces what was loaded and looks that it stuck; off looks that it is gone', () => {
  const { record } = mac();
  const where = { home: '/Users/jane', uid: 501 };
  const service = `gui/501/${record.label}`;
  const installed = `/Users/jane/Library/LaunchAgents/${record.label}.plist`;
  assert.deepEqual(steps('on', record, where), [
    { mkdir: '/Users/jane/Library/LaunchAgents' },
    // Taken out first, or a changed time never takes effect.
    { exec: ['launchctl', ['bootout', service]], mayFail: true },
    { copy: [record.plist, installed] },
    { exec: ['launchctl', ['enable', service]], mayFail: true },
    { exec: ['launchctl', ['bootstrap', 'gui/501', installed]] },
    { exec: ['launchctl', ['print', service]], failure: 'launchd took the schedule and then did not keep it.' },
  ]);
  const run = steps('run', record, where);
  assert.deepEqual(run.map((s) => s.exec), [['launchctl', ['print', service]], ['launchctl', ['kickstart', service]]]);
  const off = steps('off', record, where);
  assert.deepEqual(off[1], { remove: installed });
  assert.deepEqual(off[2].gone, ['launchctl', ['print', service]]);
});

test('Windows: the task is created without a shell, and its command is only the file\'s path', () => {
  const { record } = windows();
  const [create, check] = steps('on', record, {});
  assert.deepEqual(create.exec, ['schtasks', [
    '/Create', '/F', '/TN', record.task, '/SC', 'WEEKLY', '/D', 'MON,TUE', '/ST', '07:00',
    '/TR', '"D:\\Work\\Orion\\status\\shifts\\prospecting.cmd"',
  ]]);
  assert.deepEqual(check.exec, ['schtasks', ['/Query', '/TN', record.task]]);
  assert.deepEqual(steps('on', windows({ days: [] }).record, {})[0].exec[1].slice(4, 6), ['/SC', 'DAILY']);
  assert.deepEqual(steps('run', record, {}).at(-1).exec, ['schtasks', ['/Run', '/TN', record.task]]);
  assert.deepEqual(steps('off', record, {})[0].exec, ['schtasks', ['/Delete', '/F', '/TN', record.task]]);
});

const linux = (folder = '/home/jane/orion') => plan({ os: 'linux', folder, name: 'dream', surface: 'codex', at: '02:00', days: [], bin: '/usr/bin/codex', sheetTools: null }).record;

test('Linux: switching on twice leaves one line, and off leaves every other line alone', () => {
  // A folder with an apostrophe: the line is found by its marker, never by the path.
  const record = linux("/home/o'brien/orion");
  let crontab = '30 6 * * * /usr/bin/backup\n';
  const fake = (command, args, opts) => {
    assert.equal(command, 'crontab');
    if (args[0] === '-l') return { status: 0, stdout: crontab };
    crontab = opts.input;
    return { status: 0 };
  };
  assert.equal(apply(steps('on', record, {}), { run: fake }), null);
  assert.equal(apply(steps('on', record, {}), { run: fake }), null);
  assert.equal(crontab, `30 6 * * * /usr/bin/backup\n${record.cron}\n`);
  assert.equal(isOn(record, { run: fake }), true);
  assert.equal(apply(steps('off', record, {}), { run: fake }), null);
  assert.equal(crontab, '30 6 * * * /usr/bin/backup\n');
  assert.equal(isOn(record, { run: fake }), false);
});

test('Linux: a crontab that cannot be read is never written over', () => {
  const record = linux();
  let wrote = false;
  const broken = (command, args) => {
    if (args[0] === '-l') return { status: 1, stderr: 'crontab: cannot open spool: Permission denied' };
    wrote = true;
    return { status: 0 };
  };
  assert.match(apply(steps('on', record, {}), { run: broken }), /could not be read, so it was left exactly as it is/);
  assert.equal(wrote, false);
  // A user who has no crontab yet is the one failure that means "empty".
  let written = null;
  const fresh = (command, args, opts) => {
    if (args[0] === '-l') return { status: 1, stderr: 'no crontab for jane' };
    written = opts.input;
    return { status: 0 };
  };
  assert.equal(apply(steps('on', record, {}), { run: fresh }), null);
  assert.equal(written, `${record.cron}\n`);
});

test('Linux: run refuses when the schedule is not on, and otherwise starts the wake-up with its output kept', () => {
  const base = mkdtempSync(join(tmpdir(), 'orion-run-'));
  try {
    const record = { ...linux(), log: join(base, 'dream.log') };
    const off = () => ({ status: 0, stdout: '30 6 * * * /usr/bin/backup\n' });
    assert.match(apply(steps('run', record, { home: '/home/jane' }), { run: off }), /not switched on/);
    const on = () => ({ status: 0, stdout: `${record.cron}\n` });
    const started = [];
    const start = (c, a, o) => { started.push([c, a, o]); return { unref() {} }; };
    assert.equal(apply(steps('run', record, { home: '/home/jane' }), { run: on, start }), null);
    assert.deepEqual(started[0].slice(0, 2), ['env', ['-i', 'HOME=/home/jane', 'PATH=/usr/bin:/bin', '/bin/bash', '-l', record.wake_up]]);
    assert.equal(started[0][2].detached, true);
    assert.ok(existsSync(record.log));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a scheduler that says yes and does nothing, or will not let go, is reported', () => {
  const { record } = mac();
  const where = { home: mkdtempSync(join(tmpdir(), 'orion-home-')), uid: 501 };
  try {
    writeFileSync(join(where.home, 'entry.plist'), 'x');
    const here = { ...record, plist: join(where.home, 'entry.plist') };
    // launchd answers every command with success and keeps nothing.
    const forgets = (command, args) => ({ status: args[0] === 'print' ? 113 : 0 });
    assert.equal(apply(steps('on', here, where), { run: forgets }), 'launchd took the schedule and then did not keep it.');
    // And one that keeps it loaded although it was asked to let go.
    const clings = () => ({ status: 0 });
    assert.match(apply(steps('off', here, where), { run: clings }), /still has the schedule loaded/);
    assert.equal(apply(steps('off', here, where), { run: forgets }), null);
    assert.match(apply(steps('run', here, where), { run: forgets }), /not switched on/);
  } finally {
    rmSync(where.home, { recursive: true, force: true });
  }
  const win = windows().record;
  const refuses = (command, args) => (args[0] === '/Query' ? { status: 0 } : { status: 1, stderr: 'ERROR: Access is denied.\r\n' });
  assert.equal(apply(steps('on', win, {}), { run: refuses }), 'schtasks /Create did not work: ERROR: Access is denied.');
  // The delete was refused and the task is still there: that is not "off".
  assert.match(apply(steps('off', win, {}), { run: refuses }), /would not delete the task, so it will still run/);
  // Deleting a task that was never there is fine.
  assert.equal(apply(steps('off', win, {}), { run: () => ({ status: 1, stderr: 'ERROR: The system cannot find the file specified.' }) }), null);
});

test('whether a schedule is on is asked of the scheduler itself', () => {
  const calls = [];
  const yes = (command, args) => { calls.push([command, ...args]); return { status: 0 }; };
  assert.equal(isOn(mac().record, { uid: 501, run: yes }), true);
  assert.equal(isOn(windows().record, { run: yes }), true);
  assert.equal(isOn(mac().record, { uid: 501, run: () => ({ status: 113 }) }), false);
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [['launchctl', 'print'], ['schtasks', '/Query']]);
});

// ── The command itself, in a folder of its own ───────────────────────────────

function scratchHarness() {
  const base = mkdtempSync(join(tmpdir(), 'orion-sched-'));
  mkdirSync(join(base, 'status'), { recursive: true });
  mkdirSync(join(base, '.claude', 'agents'), { recursive: true });
  for (const f of ['schedule.mjs', 'shapes.mjs']) copyFileSync(join(ROOT, 'status', f), join(base, 'status', f));
  writeFileSync(join(base, '.claude', 'agents', 'probe.md'), '---\nname: probe\ntools: Read\nstatus: hired\n---\n\n# Probe\n');
  const run = (...args) => spawnSync(process.execPath, [join(base, 'status', 'schedule.mjs'), ...args], { encoding: 'utf8' });
  return { base, run };
}

test('wire writes only inside status/shifts/ and switches nothing on', () => {
  const { base, run } = scratchHarness();
  try {
    // --bin stands in for the agent software, so the test needs neither installed.
    const r = run('wire', '--agent', 'probe', '--surface', 'claude-code', '--at', '07:00', '--days', 'mon,wed', '--bin', process.execPath);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Nothing is switched on yet/);
    assert.match(r.stdout, /node status\/schedule\.mjs on --agent probe/);
    // The job sheet said Read. The report's three commands were added.
    assert.ok(r.stdout.includes(`--allowedTools ${['Read', ...SHIFT_TOOLS.slice(1)].join(',')}`));
    const shifts = join(base, 'status', 'shifts');
    const wakeUp = join(shifts, process.platform === 'win32' ? 'probe.cmd' : 'probe.sh');
    assert.ok(readFileSync(wakeUp, 'utf8').includes('run the probe shift'));
    const record = JSON.parse(readFileSync(join(shifts, 'probe.json'), 'utf8'));
    assert.deepEqual([record.agent, record.at, record.days, record.os], ['probe', '07:00', ['mon', 'wed'], process.platform]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('wire refuses, and writes nothing, when it cannot build an honest wake-up', () => {
  const { base, run } = scratchHarness();
  try {
    const cases = [
      [['wire', '--agent', 'nobody', '--surface', 'codex', '--at', '07:00'], /no job sheet/],
      [['wire', '--agent', 'probe', '--surface', 'cursor', '--at', '07:00'], /cannot be started with nobody watching/],
      [['wire', '--agent', 'probe', '--surface', 'codex', '--at', '25:00', '--bin', process.execPath], /HH:MM/],
      [['wire', '--agent', 'probe', '--surface', 'codex', '--at', '07:00', '--bin', join(base, 'not-there')], /--bin needs the full path/],
      [['wire', '--agent', 'probe', '--surface', 'codex', '--at', '07:00', '--bin', 'codex'], /--bin needs the full path/],
      [['wire', '--agent', 'probe', '--surface', 'codex', '--at', '07:00', '--bin', base], /--bin needs the full path/],
      // A flag is never taken as another flag's value.
      [['wire', '--agent', 'probe', '--bin', '--surface', 'codex'], /--bin is not understood/],
      [['wire', '--agent', 'probe', '--at', '07:00', '--line', 'x'], /Not something schedule.mjs wire takes/],
      [['on', '--agent', 'probe', '--at', '07:00'], /Not something schedule.mjs on takes/],
      // Nothing can be switched on, fired or switched off before it is written.
      [['on', '--agent', 'probe'], /no wake-up for probe/],
      [['run', '--agent', 'probe'], /no wake-up for probe/],
      [['off', '--agent', 'probe'], /no wake-up for probe/],
      [['on', '--agent', '../probe'], /--agent:/],
      [['unwire'], /not something schedule.mjs does/],
    ];
    for (const [args, expected] of cases) {
      const r = run(...args);
      assert.equal(r.status, 1, `${args.join(' ')} should exit 1`);
      assert.match(r.stdout, expected);
      assert.equal(existsSync(join(base, 'status', 'shifts')), false, `${args.join(' ')} wrote something`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a record that does not belong to this folder on this machine switches nothing on', () => {
  const { base, run } = scratchHarness();
  try {
    const shifts = join(base, 'status', 'shifts');
    mkdirSync(shifts, { recursive: true });
    const elsewhere = process.platform === 'win32' ? 'darwin' : 'win32';
    const records = [
      // Written on another kind of machine.
      JSON.stringify({ agent: 'probe', os: elsewhere, at: '07:00', days: [], wake_up: join(shifts, 'probe.sh') }),
      // The folder was moved: the paths inside point at the old place.
      JSON.stringify({ agent: 'probe', os: process.platform, at: '07:00', days: [], wake_up: '/somewhere/else/status/shifts/probe.sh' }),
      // Cut short.
      '{"agent": "probe", "os":',
    ];
    for (const text of records) {
      writeFileSync(join(shifts, 'probe.json'), text);
      for (const command of ['on', 'run', 'off']) {
        const r = run(command, '--agent', 'probe');
        assert.equal(r.status, 1, `${command} should refuse: ${text.slice(0, 40)}`);
        assert.match(r.stdout, /does not match this folder on this machine/);
        assert.equal(r.stderr, '');
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ── The words match the code ─────────────────────────────────────────────────

test('HIRING.md sends rung B to the script and no longer writes a command by hand', () => {
  const hiring = read('library/HIRING.md');
  for (const command of ['wire --agent {name}', 'on --agent {name}', 'run --agent {name}', 'off --agent {name}']) {
    assert.ok(hiring.includes(`node status/schedule.mjs ${command}`), `HIRING.md does not name: schedule.mjs ${command}`);
  }
  assert.equal(/claude -p/.test(hiring), false, 'HIRING.md still writes claude -p by hand');
  assert.equal(/schtasks|launchctl/.test(hiring), false, 'HIRING.md still talks to a scheduler by hand');
});

test('each adapter shows the command the code starts', () => {
  const codex = unattendedRunner('codex');
  assert.ok(
    read('agent/adapters/codex.md').includes([codex.bin, ...codex.args.map((a) => (a === PROMPT_SLOT ? '"{prompt}"' : a))].join(' ')),
    'agent/adapters/codex.md differs from unattendedRunner',
  );
  const claude = unattendedRunner('claude-code', { tools: 'T' });
  const shown = [claude.bin, ...claude.args.map((a) => (a === PROMPT_SLOT ? '"{prompt}"' : a === 'T' ? '"{the job sheet\'s tools, plus the report\'s}"' : a))].join(' ');
  assert.ok(read('agent/adapters/claude-code.md').includes(shown), 'agent/adapters/claude-code.md differs from unattendedRunner');
});

test('the script travels with updates, and what it writes is left alone by them', () => {
  const manifest = JSON.parse(read('update/manifest.json'));
  assert.ok(manifest.refresh.includes('status/schedule.mjs'));
  assert.ok('status/shifts/' in manifest.never_touch);
});
