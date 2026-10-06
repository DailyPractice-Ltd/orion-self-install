/**
 * status/schedule.mjs against this machine's REAL scheduler: launchd on a Mac,
 * Task Scheduler on Windows, cron on Linux.
 *
 *   node tests/integration/scheduler.mjs
 *
 * It is not part of `node --test`, on purpose: it creates a scheduled job on the
 * machine it runs on, fires it, and removes it. CI runs it on all three kinds
 * of machine (.github/workflows/test.yml). Run it by hand only on a machine you
 * own.
 *
 * What it proves, with a stand-in for the agent software that writes down
 * exactly what it was started with:
 *   - wire writes a wake-up the scheduler can run, from a folder with a space
 *     in its name;
 *   - on really installs the schedule, and run really fires it through the
 *     scheduler (not by calling the wake-up directly);
 *   - the stand-in receives every argument intact, in the right folder, and can
 *     find node although a scheduler starts with a bare PATH;
 *   - off really removes it, and run then refuses.
 * On Linux it also waits for cron to fire the schedule at the clock, because
 * cron has no run-now of its own.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, chmodSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { unattendedRunner, PROMPT_SLOT } from '../../status/shapes.mjs';
import { shiftPrompt, jobSheetTools, allowedTools } from '../../status/schedule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WIN = process.platform === 'win32';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const say = (text) => console.log(text);

// ── A harness folder with a space in its name, and a stand-in agent ──────────

const base = realpathSync(mkdtempSync(join(tmpdir(), 'orion-sched-it-')));
const folder = join(base, 'Orion harness');
const standIn = join(base, 'stand in');
const markers = join(standIn, 'markers');
mkdirSync(join(folder, 'status'), { recursive: true });
mkdirSync(join(folder, '.claude', 'agents'), { recursive: true });
mkdirSync(markers, { recursive: true });
for (const f of ['schedule.mjs', 'shapes.mjs']) copyFileSync(join(ROOT, 'status', f), join(folder, 'status', f));
const SHEET = '---\nname: probe\ntools: Read, Grep\nstatus: hired\n---\n\n# Probe\n';
writeFileSync(join(folder, '.claude', 'agents', 'probe.md'), SHEET);

// The stand-in writes down what it was handed, then exits.
writeFileSync(join(standIn, 'agent.mjs'), `
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'markers', Date.now() + '-' + process.pid + '.json'), JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));
`);
// The command the wake-up starts. It finds node only if the wake-up put it on PATH.
const bin = join(standIn, WIN ? 'agent.cmd' : 'agent');
if (WIN) writeFileSync(bin, '@echo off\r\nnode "%~dp0agent.mjs" %*\r\n');
else { writeFileSync(bin, '#!/bin/sh\nexec node "$(dirname "$0")/agent.mjs" "$@"\n'); chmodSync(bin, 0o755); }

const schedule = (...args) => {
  const r = spawnSync(process.execPath, [join(folder, 'status', 'schedule.mjs'), ...args], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}`.trim() };
};
const seen = () => readdirSync(markers).sort();
function waitForMarker(known, seconds, what) {
  for (let i = 0; i < seconds * 2; i++) {
    const fresh = seen().filter((f) => !known.includes(f));
    if (fresh.length > 0) return JSON.parse(readFileSync(join(markers, fresh[0]), 'utf8'));
    sleep(500);
  }
  const log = join(folder, 'status', 'shifts', 'probe.log');
  throw new Error(`${what}: the stand-in was never started within ${seconds}s.${existsSync(log) ? `\nThe wake-up's own log:\n${readFileSync(log, 'utf8').slice(-1500)}` : ' The wake-up left no log.'}`);
}
/** HH:MM, this machine's clock, some minutes from now. */
function inMinutes(n) {
  const t = new Date(Date.now() + n * 60_000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

let failed = false;
let switchedOn = false;
try {
  for (const surface of ['claude-code', 'codex']) {
    say(`\n== ${surface} on ${process.platform} ==`);
    const tools = surface === 'claude-code' ? allowedTools(jobSheetTools(SHEET)) : undefined;
    const prompt = shiftPrompt({ folder, name: 'probe' });
    const expected = unattendedRunner(surface, { tools }).args.map((a) => (a === PROMPT_SLOT ? prompt : a));

    // On Linux the clock itself is part of the proof: wire for two minutes from
    // now. Elsewhere any time will do, because run fires through the scheduler.
    const at = process.platform === 'linux' ? inMinutes(2) : '03:17';
    let r = schedule('wire', '--agent', 'probe', '--surface', surface, '--at', at, '--bin', bin);
    assert.equal(r.status, 0, `wire failed:\n${r.out}`);
    assert.match(r.out, /Nothing is switched on yet/);
    say(`wire: ok (${at})`);

    // Before on, there is nothing to fire.
    r = schedule('run', '--agent', 'probe');
    assert.equal(r.status, 1, `run before on should refuse:\n${r.out}`);
    assert.match(r.out, /not switched on/);

    r = schedule('on', '--agent', 'probe');
    assert.equal(r.status, 0, `on failed:\n${r.out}`);
    switchedOn = true;
    say('on: ok');

    // wire refuses to rewrite the file a live schedule runs.
    r = schedule('wire', '--agent', 'probe', '--surface', surface, '--at', '04:00', '--bin', bin);
    assert.equal(r.status, 1, `wire over a live schedule should refuse:\n${r.out}`);
    assert.match(r.out, /is switched on/);

    let known = seen();
    r = schedule('run', '--agent', 'probe');
    assert.equal(r.status, 0, `run failed:\n${r.out}`);
    let got = waitForMarker(known, 90, 'run');
    assert.deepEqual(got.argv, expected, 'the stand-in was not handed the arguments intact');
    assert.equal(realpathSync(got.cwd), folder, 'the stand-in was not started in the harness folder');
    say(`run: ok (the stand-in got ${got.argv.length} arguments intact, in the harness folder)`);

    if (process.platform === 'linux') {
      known = seen();
      got = waitForMarker(known, 200, 'the clock');
      assert.deepEqual(got.argv, expected);
      say('clock: ok (cron fired the schedule on its own)');
    }

    r = schedule('off', '--agent', 'probe');
    assert.equal(r.status, 0, `off failed:\n${r.out}`);
    switchedOn = false;
    r = schedule('run', '--agent', 'probe');
    assert.equal(r.status, 1, `run after off should refuse:\n${r.out}`);
    assert.match(r.out, /not switched on/);
    say('off: ok (and run refuses again)');
  }
  say('\nAll good: the schedule was wired, switched on, fired through the real scheduler and switched off, for both kinds of agent software.');
} catch (err) {
  failed = true;
  console.error(`\nFAILED: ${err.message}`);
} finally {
  if (switchedOn) schedule('off', '--agent', 'probe');
  rmSync(base, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
