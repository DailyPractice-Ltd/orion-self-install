/**
 * The wake-up for a hired agent's schedule on the computer's own scheduler
 * (library/HIRING.md step 6, rung B): status/shapes.mjs says how each agent
 * software is started with nobody watching, and status/schedule.mjs writes the
 * files. The wake-up used to be written by hand as `claude -p` whatever the
 * machine ran, so a Codex machine was handed a task that could never start.
 *
 * These tests call the real builders, run a real wake-up file through a real
 * shell, and hold HIRING.md and the adapters to what the code does.
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
  shiftPrompt, jobSheetTools, shQuote, cmdQuote, buildShellWakeUp, buildPlist, buildSchtasks, plan,
  SCHTASKS_TR_MAX,
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
  assert.equal(/['"`]/.test(prompt), false, 'the shift prompt has a quote character in it');
  const hiring = read('library/HIRING.md');
  const at = hiring.indexOf('`Open {absolute folder path} and run the {name} shift:');
  assert.ok(at !== -1, 'the shift prompt is missing from HIRING.md');
  const inHiring = hiring.slice(at + 1, hiring.indexOf('`', at + 1));
  assert.equal(oneLine(inHiring), prompt, 'HIRING.md and status/schedule.mjs give different shift prompts');
});

test('the tools line of a job sheet is read as one clean list', () => {
  const sheet = (tools) => `---\nname: x\n${tools}\nstatus: hired\n---\n\n# X\n`;
  assert.equal(jobSheetTools(sheet('tools: Read, Write, Edit, Bash')), 'Read,Write,Edit,Bash');
  assert.equal(jobSheetTools(sheet('tools: [Read, "Bash(node status/*)"]')), 'Read,Bash(node status/*)');
  // A comma inside the brackets of one tool does not split it.
  assert.equal(jobSheetTools(sheet('tools: Read, Bash(git log, git diff), mcp__gmail__search_threads')), 'Read,Bash(git log, git diff),mcp__gmail__search_threads');
  assert.equal(jobSheetTools(sheet('description: no tools here')), null);
  assert.equal(jobSheetTools('# no front matter\ntools: Read'), null);
});

// ── A real wake-up file, through a real shell ────────────────────────────────

test('a wake-up file hands every argument over intact, awkward folder name included', { skip: process.platform === 'win32' }, () => {
  const base = mkdtempSync(join(tmpdir(), 'orion-wake-'));
  try {
    const folder = join(base, "Jane's harness & co");
    mkdirSync(folder, { recursive: true });
    // Stands in for the agent software: writes down exactly what it was given.
    const fake = join(base, 'fake agent.sh');
    writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$PWD" > "$(dirname "$0")/pwd.txt"\nfor a in "$@"; do printf "%s\\n" "$a"; done > "$(dirname "$0")/args.txt"\n');
    chmodSync(fake, 0o755);
    const prompt = shiftPrompt({ folder, name: 'probe' });
    const args = unattendedRunner('claude-code', { tools: 'Read,Bash(node status/*)' }).args.map((a) => (a === PROMPT_SLOT ? prompt : a));
    const wakeUp = join(base, 'probe.sh');
    writeFileSync(wakeUp, buildShellWakeUp({ os: 'linux', folder, bin: fake, args, name: 'probe' }));
    const run = spawnSync('/bin/sh', [wakeUp], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readFileSync(join(base, 'args.txt'), 'utf8').trimEnd().split('\n'), args);
    assert.ok(readFileSync(join(base, 'pwd.txt'), 'utf8').trim().endsWith("Jane's harness & co"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('quoting: a single quote survives a shell file, a double quote is refused for Windows', () => {
  assert.equal(shQuote("it's"), `'it'\\''s'`);
  assert.equal(cmdQuote('50% done'), '"50%% done"');
  assert.throws(() => cmdQuote('say "hi"'));
});

// ── What gets written on each kind of machine ────────────────────────────────

const mac = (over = {}) => plan({
  os: 'darwin', folder: "/Users/jane/Orion & Jane's", name: 'prospecting', surface: 'codex',
  at: '7:05', days: ['fri', 'mon'], bin: '/opt/homebrew/bin/codex', tools: null, ...over,
});

test('Mac: a wake-up file and a launchd entry that is valid XML', () => {
  const p = mac();
  assert.deepEqual(p.problems, []);
  assert.equal(p.at, '07:05');
  assert.deepEqual(p.days, ['mon', 'fri']);
  const [wakeUp, plist] = p.files;
  assert.ok(wakeUp.path.endsWith('/status/shifts/prospecting.sh'));
  assert.equal(wakeUp.executable, true);
  assert.ok(wakeUp.text.includes(`cd '/Users/jane/Orion & Jane'\\''s' || exit 1`));
  assert.ok(wakeUp.text.includes(`exec '/opt/homebrew/bin/codex' 'exec'`));
  assert.ok(plist.path.endsWith('/status/shifts/world.dailypractice.orion.prospecting.plist'));
  // The ampersand and the apostrophe in the folder name are escaped for XML,
  // and no shell quoting leaks into the entry.
  assert.ok(plist.text.includes('Orion &amp; Jane&apos;s/status/shifts/prospecting.sh</string>'));
  assert.equal(/<string>[^<]*&(?!amp;|apos;|lt;|gt;|quot;)/.test(plist.text), false, 'a raw ampersand is left in the plist');
  // launchd counts Monday as 1 and Friday as 5.
  assert.deepEqual([...plist.text.matchAll(/<key>Weekday<\/key>\s*<integer>(\d)<\/integer>/g)].map((m) => m[1]), ['1', '5']);
  assert.ok(p.on.includes('launchctl load -w ~/Library/LaunchAgents/world.dailypractice.orion.prospecting.plist'));
  assert.ok(p.off.includes('launchctl unload -w'));
});

test('Mac: the launchd entry passes the system\'s own check', { skip: process.platform !== 'darwin' }, () => {
  const base = mkdtempSync(join(tmpdir(), 'orion-plist-'));
  try {
    const file = join(base, 'entry.plist');
    writeFileSync(file, buildPlist({ name: 'probe', wakeUpPath: "/tmp/a & b's/probe.sh", logPath: '/tmp/x.log', folder: "/tmp/a & b's", days: [], hour: 7, minute: 0 }));
    const lint = spawnSync('plutil', ['-lint', file], { encoding: 'utf8' });
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('Windows: a command file, and a task whose command is only that file\'s path', () => {
  const p = plan({
    os: 'win32', folder: 'D:\\Work\\Orion 100%', name: 'prospecting', surface: 'claude-code',
    at: '07:00', days: ['mon', 'tue'], bin: 'C:\\Users\\Jane Smith\\AppData\\Roaming\\npm\\claude.cmd', tools: 'Read,Bash',
  });
  assert.deepEqual(p.problems, []);
  const [wakeUp] = p.files;
  assert.ok(wakeUp.path.endsWith('\\status\\shifts\\prospecting.cmd'));
  // /d, or a folder on another drive is never entered. % doubled, or it is read as a variable.
  assert.ok(wakeUp.text.includes('cd /d "D:\\Work\\Orion 100%%" || exit /b 1'));
  // The path has a space in it and stays one word. `call`, because it is a batch file itself.
  assert.ok(wakeUp.text.includes('call "C:\\Users\\Jane Smith\\AppData\\Roaming\\npm\\claude.cmd" "-p" "Open D:\\Work\\Orion 100%% and run'));
  assert.equal(p.on, 'schtasks /Create /F /TN "Orion prospecting shift" /SC WEEKLY /D MON,TUE /ST 07:00 /TR "\\"D:\\Work\\Orion 100%\\status\\shifts\\prospecting.cmd\\""');
  assert.equal(p.off, 'schtasks /Delete /F /TN "Orion prospecting shift"');
});

test('Windows: the task command stays inside the length Windows accepts, whatever the prompt', () => {
  const task = buildSchtasks({ name: 'prospecting', wakeUpPath: 'C:\\Orion\\status\\shifts\\prospecting.cmd', days: [], at: '07:00' });
  assert.ok(task.trLength <= SCHTASKS_TR_MAX);
  assert.ok(task.on.includes('/SC DAILY'));
  // The shift prompt alone is longer than the limit: it must never be in /TR.
  assert.ok(shiftPrompt({ folder: 'C:\\Orion', name: 'prospecting' }).length > SCHTASKS_TR_MAX);
  assert.equal(task.on.includes('run the prospecting shift'), false);
  const deep = plan({
    os: 'win32', folder: `C:\\${'very-long-folder-name\\'.repeat(12)}Orion`, name: 'prospecting', surface: 'codex',
    at: '07:00', days: [], bin: 'C:\\codex.exe', tools: null,
  });
  assert.equal(deep.files, undefined);
  assert.match(deep.problems[0], /shorter path/);
});

test('Linux: one crontab line', () => {
  const p = plan({ os: 'linux', folder: '/home/jane/orion', name: 'dream', surface: 'codex', at: '02:00', days: [], bin: '/usr/bin/codex', tools: null });
  assert.deepEqual(p.problems, []);
  assert.ok(p.on.includes(`0 2 * * * '\\''/home/jane/orion/status/shifts/dream.sh'\\''`));
});

test('what it cannot do is said plainly and nothing is planned', () => {
  assert.match(mac({ at: '7am' }).problems.join(' '), /HH:MM/);
  assert.match(mac({ days: ['monday'] }).problems.join(' '), /Not understood: monday/);
  assert.match(mac({ surface: 'cursor' }).problems.join(' '), /cannot be started with nobody watching/);
  assert.match(mac({ surface: undefined }).problems.join(' '), /--surface is missing/);
  assert.match(mac({ bin: null }).problems.join(' '), /Could not find the codex command/);
  // Claude Code with no tools line: there is nothing it may do, and nobody to ask.
  assert.match(mac({ surface: 'claude-code', bin: '/usr/local/bin/claude', tools: null }).problems.join(' '), /no tools: line/);
  for (const bad of [mac({ at: '7am' }), mac({ surface: 'cursor' }), mac({ bin: null })]) assert.equal(bad.files, undefined);
});

// ── The command itself, in a folder of its own ───────────────────────────────

function scratchHarness() {
  const base = mkdtempSync(join(tmpdir(), 'orion-sched-'));
  mkdirSync(join(base, 'status'), { recursive: true });
  mkdirSync(join(base, '.claude', 'agents'), { recursive: true });
  for (const f of ['schedule.mjs', 'shapes.mjs']) copyFileSync(join(ROOT, 'status', f), join(base, 'status', f));
  writeFileSync(join(base, '.claude', 'agents', 'probe.md'), '---\nname: probe\ntools: Read, Bash\nstatus: hired\n---\n\n# Probe\n');
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
    assert.match(r.stdout, /--permission-mode dontAsk --allowedTools Read,Bash/);
    const wakeUp = join(base, 'status', 'shifts', process.platform === 'win32' ? 'probe.cmd' : 'probe.sh');
    assert.ok(existsSync(wakeUp));
    assert.ok(readFileSync(wakeUp, 'utf8').includes('run the probe shift'));
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
      [['wire', '--agent', 'probe', '--surface', 'codex', '--at', '07:00', '--bin', join(base, 'not-there')], /no file at/],
      [['wire', '--agent', 'probe', '--at', '07:00', '--line', 'x'], /Not something schedule.mjs takes/],
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

// ── The words match the code ─────────────────────────────────────────────────

test('HIRING.md sends rung B to the script and no longer writes a command by hand', () => {
  const hiring = read('library/HIRING.md');
  assert.ok(hiring.includes('node status/schedule.mjs wire --agent {name}'), 'HIRING.md does not name the command');
  assert.equal(/claude -p/.test(hiring), false, 'HIRING.md still writes claude -p by hand');
  assert.equal(/schtasks \/Create/.test(hiring), false, 'HIRING.md still writes a schtasks entry by hand');
});

test('each adapter shows the command the code starts', () => {
  const show = (surface, opts, prompt, tools) => {
    const r = unattendedRunner(surface, opts);
    return [r.bin, ...r.args.map((a) => (a === PROMPT_SLOT ? prompt : a === opts?.tools ? tools : a))].join(' ');
  };
  assert.ok(read('agent/adapters/codex.md').includes(show('codex', undefined, '"{prompt}"')), 'agent/adapters/codex.md differs from unattendedRunner');
  assert.ok(
    read('agent/adapters/claude-code.md').includes(show('claude-code', { tools: 'T' }, '"{prompt}"', '"{the tools on the job sheet}"')),
    'agent/adapters/claude-code.md differs from unattendedRunner',
  );
});

test('the script travels with updates, and what it writes is left alone by them', () => {
  const manifest = JSON.parse(read('update/manifest.json'));
  assert.ok(manifest.refresh.includes('status/schedule.mjs'));
  assert.ok('status/shifts/' in manifest.never_touch);
});
