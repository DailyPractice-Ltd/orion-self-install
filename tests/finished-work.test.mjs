/**
 * Finished work, run for real.
 *
 * Since 1.1.0 a harness reports a finished task: one signal, carrying a tag for
 * the kind of work, a count, and the name of the skill or agent that ran. Never
 * the content. These cases hold that promise in place.
 *
 * Every case that touches the radio runs the real scripts from status/ as child
 * processes, inside a scratch folder laid out like a harness, against a fetch that
 * answers from memory and writes down every call it gets. So nothing leaves this
 * machine, and no status/status.json in this folder is touched. The approach is
 * tests/radio-check.test.mjs's, with a /signals door added. The fake fetch travels
 * in NODE_OPTIONS, so a script that starts another script takes it along.
 *
 *   node --test
 *
 * The last cases are tripwires: words and lists that live in two places and
 * must say the same thing in both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  WORK_TAGS, WORK_TAG_RE, isWorkTag, workTagMenu, isLabel, labelProblem, LABEL_MAX,
  countProblem, looksLikeCredential, LINE_MAX,
} from '../status/shapes.mjs';
import { plainEnv } from './helpers/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const statusDir = join(repo, 'status');

/**
 * A key that is well shaped and opens nothing. Built here, never written out
 * whole, so no file in this folder holds a line shaped like a key (the rule
 * status/home.mjs applies before it saves a folder anywhere).
 */
const FAKE_KEY = 'orion_' + 'test'.repeat(6);

const HARNESS_ID = '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62';
/** The three fields every signal has always carried, as the scratch harness holds them. */
const BASE_PAYLOAD = {
  ops_stage: 'seven_day_checkin',
  harness_status: 'validated',
  template_version: '1.1.0',
};
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * A scratch harness folder with the real scripts in it. `run` executes one of
 * them; the rest read back what it left behind. The bridge is a fake fetch that
 * logs every call, body included, before it answers.
 */
function makeHarness(t, { sharing = {}, status = {}, unreachable = false, refuse = null, noStatus = false, files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-done-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'status'));
  // Every script the status folder ships, exactly as it is on disk right now.
  for (const f of readdirSync(statusDir).filter((name) => name.endsWith('.mjs'))) {
    copyFileSync(join(statusDir, f), join(dir, 'status', f));
  }
  if (!noStatus) {
    writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
      ...BASE_PAYLOAD,
      agent_name: 'Neo',
      memory: { enabled: true, backend: 'folder', remote: null, path: 'memory' },
      ...status,
      sharing: {
        status_signal_enabled: true,
        bridge_url: 'https://radio.test/api/bridge',
        harness_id: HARNESS_ID,
        install_token: FAKE_KEY,
        ...sharing,
      },
    }));
  }
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  const log = join(dir, 'fetch.log');
  const mock = join(dir, 'fetch.mjs');
  writeFileSync(mock, `
    import { appendFileSync } from 'node:fs';
    const answer = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    });
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      const path = u.pathname + u.search;
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({
        method: init.method || 'GET', path, body: init.body ? JSON.parse(init.body) : null,
      }) + '\\n');
      if (${JSON.stringify(unreachable)}) {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      }
      if (path === '/api/bridge/signals') {
        if (${JSON.stringify(refuse)} !== null) return answer(${JSON.stringify(refuse)}, { error: 'refused' });
        return answer(201, { signal_id: 's1', recorded_at: new Date().toISOString(), replay: false });
      }
      return answer(404, { error: 'no such door' });
    };
  `);
  const read = (rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : null);
  return {
    dir,
    /** Run status/<script> with these arguments. Deliberately not from inside the harness folder. */
    run(script, args) {
      const r = spawnSync(process.execPath, [join(dir, 'status', script), ...args], {
        encoding: 'utf8',
        cwd: tmpdir(),
        env: plainEnv({ NODE_OPTIONS: `--import=${pathToFileURL(mock).href}` }),
      });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    /** Every call the bridge received, parsed. */
    calls: () => (read('fetch.log') || '').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    /** The same calls as raw text, for "this string appears in no request" checks. */
    wire: () => read('fetch.log') || '',
    shiftLog: () => read('status/shift-log.md'),
    workLog: () => read('status/work-log.md'),
    memoryLog: (who) => read(`memory/agents/${who}/log.md`),
    exists: (rel) => existsSync(join(dir, rel)),
  };
}

/** The one signal a run sent, with the envelope checked. Fails if there was not exactly one. */
function onlySignal(h) {
  const calls = h.calls();
  assert.equal(calls.length, 1, `expected exactly one call, got ${calls.length}: ${h.wire()}`);
  const [call] = calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.path, '/api/bridge/signals');
  assert.deepEqual(Object.keys(call.body).sort(), ['harness_id', 'occurred_at', 'payload', 'signal_type']);
  assert.equal(call.body.harness_id, HARNESS_ID);
  assert.match(call.body.occurred_at, ISO_RE);
  return call.body;
}

// ── status/radio.mjs signal ─────────────────────────────────────────────────

test('signal task_completed sends exactly one POST with the tag and the count, and no free text', (t) => {
  const h = makeHarness(t);
  const { code, out, err } = h.run('radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'content', '--count', '1']);
  assert.equal(code, 0, err);
  assert.match(out, /Signal sent \(task_completed\)\./);
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'task_completed');
  assert.equal(body.payload.tag, 'content');
  assert.equal(body.payload.count, 1);
  // The whole payload: the three standing fields plus two labels. Nothing else,
  // so there is no field free text could be riding in.
  assert.deepEqual(body.payload, { ...BASE_PAYLOAD, tag: 'content', count: 1 });
});

test('a tag that is not on the menu is refused, with the menu printed and nothing sent', (t) => {
  const h = makeHarness(t);
  for (const tag of ['contnt', 'Content', 'constructor', 'toString', 'called Thandi at Acme', '']) {
    const { code, out } = h.run('radio.mjs', ['signal', '--type', 'task_completed', '--tag', tag, '--count', '1']);
    assert.equal(code, 1, `tag ${JSON.stringify(tag)} should be refused`);
    for (const menuLine of workTagMenu()) assert.ok(out.includes(menuLine), `the menu should show: ${menuLine}`);
  }
  // The same refusal on a type that only may carry a tag.
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'crm_updated', '--tag', 'made-up-tag']).code, 1);
  assert.deepEqual(h.calls(), [], 'nothing leaves the machine on a refused tag');
});

test('task_completed without --tag or without --count is refused', (t) => {
  const h = makeHarness(t);
  const noTag = h.run('radio.mjs', ['signal', '--type', 'task_completed', '--count', '1']);
  assert.equal(noTag.code, 1);
  assert.match(noTag.out, /task_completed needs both --tag/);
  assert.match(noTag.out, /  prospecting/, 'a missing tag gets the menu too');
  const noCount = h.run('radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'content']);
  assert.equal(noCount.code, 1);
  assert.match(noCount.out, /task_completed needs both --tag/);
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'task_completed']).code, 1);
  assert.deepEqual(h.calls(), []);
});

test('a finished task counts at least 1; only a shift may report 0', (t) => {
  const h = makeHarness(t);
  const zero = h.run('radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '0']);
  assert.equal(zero.code, 1);
  assert.match(zero.out, /at least 1/);
  assert.deepEqual(h.calls(), [], 'a zero-count task is refused before the wire');

  const shift = h.run('radio.mjs', ['signal', '--type', 'routine_completed', '--routine', 'pipeline-review', '--count', '0']);
  assert.equal(shift.code, 0, shift.err);
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'routine_completed');
  assert.equal(body.payload.count, 0, 'a shift that ran and found nothing to do is worth reporting');
});

test('--asset puts the asset fields in the payload, with surface defaulting to agent', (t) => {
  const h = makeHarness(t);
  const { code, err } = h.run('radio.mjs', [
    'signal', '--type', 'task_completed', '--tag', 'calls', '--count', '2',
    '--asset', 'meeting-sizing', '--asset-kind', 'skill', '--outcome', 'run_completed',
  ]);
  assert.equal(code, 0, err);
  assert.deepEqual(onlySignal(h).payload, {
    ...BASE_PAYLOAD,
    tag: 'calls',
    count: 2,
    asset: 'meeting-sizing',
    asset_kind: 'skill',
    outcome: 'run_completed',
    surface: 'agent',
  });
});

test('on a shift the surface defaults to routine, and --surface can say otherwise', (t) => {
  const h = makeHarness(t);
  h.run('radio.mjs', [
    'signal', '--type', 'routine_completed', '--routine', 'prospecting', '--count', '3',
    '--asset', 'meeting-sizing', '--outcome', 'run_completed',
  ]);
  h.run('radio.mjs', [
    'signal', '--type', 'routine_completed', '--routine', 'prospecting', '--count', '3',
    '--asset', 'meeting-sizing', '--outcome', 'rep_logged', '--surface', 'agent',
  ]);
  const [first, second] = h.calls().map((c) => c.body.payload);
  assert.equal(first.surface, 'routine');
  assert.equal(first.asset_kind, undefined, '--asset-kind is optional and is not invented');
  assert.equal(second.surface, 'agent');
  assert.equal(second.outcome, 'rep_logged');
});

test('asset fields travel together, and an asset is a slug, never a description', (t) => {
  const h = makeHarness(t);
  const base = ['signal', '--type', 'task_completed', '--tag', 'calls', '--count', '1'];
  for (const extra of [
    ['--outcome', 'run_completed'],                                        // no --asset
    ['--asset-kind', 'skill'],                                             // no --asset
    ['--asset', ''],                                                       // an empty slug
    ['--asset', 'meeting-sizing'],                                         // no --outcome
    ['--asset', 'meeting-sizing', '--outcome', 'finished'],                // not an outcome
    ['--asset', 'meeting-sizing', '--outcome', 'run_completed', '--surface', 'n8n'],
    ['--asset', 'meeting-sizing', '--outcome', 'run_completed', '--asset-kind', 'gadget'],
    ['--asset', 'Sized the Acme meeting', '--outcome', 'run_completed'],   // free text
    ['--asset', 'a'.repeat(101), '--outcome', 'run_completed'],            // too long to be a slug
  ]) {
    assert.equal(h.run('radio.mjs', [...base, ...extra]).code, 1, `should be refused: ${extra.join(' ')}`);
  }
  assert.deepEqual(h.calls(), []);
});

test('on a finished task the agent is a roster name, never a description', (t) => {
  const h = makeHarness(t);
  const base = ['signal', '--type', 'task_completed', '--tag', 'calls', '--count', '1'];
  for (const routine of ['Thandi from Acme', 'Research', 'a'.repeat(31)]) {
    assert.equal(h.run('radio.mjs', [...base, '--routine', routine]).code, 1, `should be refused: ${routine}`);
  }
  assert.deepEqual(h.calls(), []);
  assert.equal(h.run('radio.mjs', [...base, '--routine', 'research']).code, 0);
  assert.deepEqual(onlySignal(h).payload, { ...BASE_PAYLOAD, tag: 'calls', count: 1, routine: 'research' });
});

test('install_checkpoint is not work: it takes no tag and names nothing that ran', (t) => {
  const h = makeHarness(t);
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'install_checkpoint', '--tag', 'ops']).code, 1);
  assert.equal(h.run('radio.mjs', [
    'signal', '--type', 'install_checkpoint', '--asset', 'meeting-sizing', '--outcome', 'run_completed',
  ]).code, 1);
  assert.deepEqual(h.calls(), []);
  // On its own it still goes exactly as it always has.
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'install_checkpoint']).code, 0);
  assert.deepEqual(onlySignal(h).payload, BASE_PAYLOAD);
});

test('an approval moment may carry a tag, and is otherwise unchanged', (t) => {
  const h = makeHarness(t);
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'crm_updated']).code, 0);
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'crm_updated', '--tag', 'crm', '--count', '4']).code, 0);
  const [plain, tagged] = h.calls().map((c) => c.body);
  assert.equal(plain.signal_type, 'crm_updated');
  assert.deepEqual(plain.payload, BASE_PAYLOAD, 'no tag asked for, none sent');
  assert.deepEqual(tagged.payload, { ...BASE_PAYLOAD, tag: 'crm', count: 4 });
});

test('existing behaviour: a shift report still sends exactly what it sent before', (t) => {
  const h = makeHarness(t);
  const { code, out, err } = h.run('radio.mjs', ['signal', '--type', 'routine_completed', '--routine', 'prospecting', '--count', '3']);
  assert.equal(code, 0, err);
  assert.equal(out, 'Signal sent (routine_completed).\n');
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'routine_completed');
  assert.deepEqual(body.payload, { ...BASE_PAYLOAD, count: 3, routine: 'prospecting' });
  // And it still insists on who and how many.
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'routine_completed', '--count', '3']).code, 1);
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'routine_completed', '--routine', 'prospecting']).code, 1);
  assert.equal(h.run('radio.mjs', ['signal', '--type', 'not_a_type']).code, 1);
  assert.equal(h.calls().length, 1);
});

test('existing behaviour: --note never leaves the machine', (t) => {
  const h = makeHarness(t);
  const { code, out, err } = h.run('radio.mjs', [
    'signal', '--type', 'routine_completed', '--routine', 'prospecting', '--count', '3',
    '--note', 'called Thandi at Acme Freight about the Durban lane',
  ]);
  assert.equal(code, 0, err);
  assert.match(out, /Note stays local/);
  assert.deepEqual(onlySignal(h).payload, { ...BASE_PAYLOAD, count: 3, routine: 'prospecting' });
  for (const leak of ['Thandi', 'Acme', 'Durban', 'note']) {
    assert.ok(!h.wire().includes(leak), `"${leak}" must not appear in any request`);
  }
});

test('existing behaviour: radio off is one plain line, exit 0, and nothing sent', (t) => {
  const h = makeHarness(t, { sharing: { status_signal_enabled: false } });
  const { code, out } = h.run('radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'content', '--count', '1']);
  assert.equal(code, 0);
  assert.match(out, /^Radio is off \(or not configured\)/);
  assert.deepEqual(h.calls(), []);
});

// ── status/done.mjs ─────────────────────────────────────────────────────────

test('done: one finished task sends exactly one task_completed, with the tag and a count of 1', (t) => {
  const h = makeHarness(t);
  const { code, out, err } = h.run('done.mjs', ['--tag', 'content']);
  assert.equal(code, 0, err);
  assert.match(out, /Signal sent \(task_completed\)\./);
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'task_completed');
  assert.deepEqual(body.payload, { ...BASE_PAYLOAD, tag: 'content', count: 1 });
  assert.equal(h.shiftLog(), null, 'a task a person set is not a shift, so the shift log is not touched');
});

test('done: --skill and --agent put the asset fields and the routine label in the payload', (t) => {
  const h = makeHarness(t);
  const { code, err } = h.run('done.mjs', [
    '--tag', 'prospecting', '--count', '18', '--skill', 'meeting-sizing', '--agent', 'prospecting',
  ]);
  assert.equal(code, 0, err);
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'task_completed');
  assert.deepEqual(body.payload, {
    ...BASE_PAYLOAD,
    tag: 'prospecting',
    count: 18,
    routine: 'prospecting',
    asset: 'meeting-sizing',
    asset_kind: 'skill',
    outcome: 'run_completed',
    surface: 'agent',
  });
});

test('done: the --line text is written locally and appears in no request body', (t) => {
  const h = makeHarness(t);
  const line = 'drafted the Q4 webinar deck for Acme Freight, three slides still thin';
  const { code, out, err } = h.run('done.mjs', ['--tag', 'content', '--count', '1', '--line', line]);
  assert.equal(code, 0, err);
  // The local half: one dated line in the work log, and the same line in the
  // harness's own log in memory.
  const stamped = new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} \\| Neo \\| count: 1 \\| content \\| ${line}\\n$`);
  assert.match(h.workLog(), stamped);
  assert.equal(h.memoryLog('Neo'), h.workLog());
  assert.match(out, /Written to status\/work-log\.md\./);
  assert.match(out, /Noted in agents\/Neo\/log\.md\./);
  assert.equal(h.shiftLog(), null, 'a task a person asked for never touches the shift log');
  // The radio half: labels only.
  assert.deepEqual(onlySignal(h).payload, { ...BASE_PAYLOAD, tag: 'content', count: 1 });
  for (const leak of ['drafted', 'webinar', 'Acme', 'Freight', 'slides', 'line']) {
    assert.ok(!h.wire().includes(leak), `"${leak}" must not appear in any request`);
  }
});

test('done: the radio script is handed labels only, never the line', (t) => {
  // The wire check above would still pass if done.mjs handed the line to
  // radio.mjs and radio.mjs dropped it. That is one mistake away from a leak, so
  // this case swaps in a radio that only writes down what it was given.
  const stub = `
    import { appendFileSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    import { dirname, join } from 'node:path';
    appendFileSync(join(dirname(fileURLToPath(import.meta.url)), 'radio-args.log'), JSON.stringify(process.argv.slice(2)) + '\\n');
    console.log('Signal sent (stub).');
  `;
  const h = makeHarness(t, { files: { 'status/radio.mjs': stub } });
  const line = 'called Thandi at Acme Freight, she wants the Durban pricing';
  h.run('done.mjs', ['--tag', 'calls', '--line', line]);
  h.run('done.mjs', ['--tag', 'calls', '--count', '2', '--skill', 'meeting-sizing', '--agent', 'research', '--line', line]);
  h.run('done.mjs', ['--tag', 'calls', '--count', '0', '--skill', 'meeting-sizing', '--agent', 'research', '--shift', '--line', line]);
  const handed = readFileSync(join(h.dir, 'status', 'radio-args.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  // Every call ends by asking the radio for its one machine-readable result line.
  const ASK = ['--result-line', 'yes'];
  assert.deepEqual(handed, [
    ['signal', '--type', 'task_completed', '--tag', 'calls', '--count', '1', ...ASK],
    ['signal', '--type', 'task_completed', '--tag', 'calls', '--count', '2', '--routine', 'research',
      '--asset', 'meeting-sizing', '--asset-kind', 'skill', '--outcome', 'run_completed', '--surface', 'agent', ...ASK],
    ['signal', '--type', 'routine_completed', '--tag', 'calls', '--count', '0', '--routine', 'research',
      '--asset', 'meeting-sizing', '--asset-kind', 'skill', '--outcome', 'run_completed', '--surface', 'routine', ...ASK],
  ]);
  for (const args of handed) {
    for (const arg of args) assert.ok(!/Thandi|Acme|Durban|pricing/.test(arg), `the line must not be handed over: ${arg}`);
  }
  // While the line itself is safe on this machine: in the work log for the two
  // tasks, in the shift log for the shift, and in each one's memory log.
  assert.ok(h.workLog().includes(`| Neo | count: 1 | calls | ${line}`));
  assert.ok(h.workLog().includes(`| research | count: 2 | calls | ${line}`));
  assert.ok(h.memoryLog('Neo').includes(line));
  assert.ok(h.memoryLog('research').includes(line));
  assert.ok(h.shiftLog().includes(`auto: ${line}`));
});

test('done: --shift sends routine_completed and writes an auto: line to the shift log and to memory', (t) => {
  const h = makeHarness(t);
  const { code, out, err } = h.run('done.mjs', [
    '--tag', 'prospecting', '--count', '18', '--agent', 'prospecting', '--skill', 'meeting-sizing',
    '--shift', '--line', '18 new candidates, 2 skipped as duplicates',
  ]);
  assert.equal(code, 0, err);
  assert.match(out, /Signal sent \(routine_completed\)\./);
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'routine_completed');
  assert.deepEqual(body.payload, {
    ...BASE_PAYLOAD,
    tag: 'prospecting',
    count: 18,
    routine: 'prospecting',
    asset: 'meeting-sizing',
    asset_kind: 'skill',
    outcome: 'run_completed',
    surface: 'routine',
  });
  const log = h.shiftLog();
  assert.match(
    log,
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \| prospecting \| count: 18 \| auto: 18 new candidates, 2 skipped as duplicates\n$/,
  );
  assert.ok(log.includes('auto:'));
  assert.equal(h.memoryLog('prospecting'), log, 'the agent\'s memory log gets the same line');
  assert.ok(!h.wire().includes('candidates'), 'the line stays local on a shift too');
});

test('done: the auto: marker is never doubled, and a wiring test keeps its auto-test: marker', (t) => {
  const h = makeHarness(t);
  h.run('done.mjs', ['--tag', 'ops', '--agent', 'dream', '--shift', '--line', 'auto: merged 4 duplicate notes']);
  h.run('done.mjs', ['--tag', 'ops', '--agent', 'dream', '--shift', '--line', 'auto-test: wiring check, kicked by hand']);
  const lines = h.shiftLog().trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], / \| dream \| count: 1 \| auto: merged 4 duplicate notes$/);
  assert.match(lines[1], / \| dream \| count: 1 \| auto-test: wiring check, kicked by hand$/);
  assert.ok(!h.shiftLog().includes('auto: auto'));
});

test('done: radio off sends nothing and says nothing about it, and a shift line is still written', (t) => {
  const h = makeHarness(t, { sharing: { status_signal_enabled: false } });
  const quiet = h.run('done.mjs', ['--tag', 'content', '--count', '2']);
  const shift = h.run('done.mjs', [
    '--tag', 'reporting', '--count', '1', '--agent', 'friday-report', '--shift', '--line', 'the week in one page',
  ]);
  for (const r of [quiet, shift]) {
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(r.out, /radio|check-in|signal|sent|off/i, 'radio off is silent, not announced');
  }
  assert.deepEqual(h.calls(), [], 'nothing leaves the machine with the radio off');
  assert.match(h.shiftLog(), / \| friday-report \| count: 1 \| auto: the week in one page\n$/);
  assert.equal(h.memoryLog('friday-report'), h.shiftLog(), 'memory does not depend on the radio');
});

test('done: an unpaired harness is radio off too', (t) => {
  const h = makeHarness(t, { sharing: { bridge_url: null, harness_id: null, install_token: null } });
  const { code, out } = h.run('done.mjs', ['--tag', 'admin', '--line', 'cleared the inbox']);
  assert.equal(code, 0);
  assert.doesNotMatch(out, /radio/i);
  assert.deepEqual(h.calls(), []);
  assert.match(h.workLog(), / \| Neo \| count: 1 \| admin \| cleared the inbox\n$/);
  assert.equal(h.memoryLog('Neo'), h.workLog());
});

test('done: a bad tag exits 1, prints the menu, and writes and sends nothing', (t) => {
  const h = makeHarness(t);
  const { code, out } = h.run('done.mjs', [
    '--tag', 'prospectin', '--agent', 'prospecting', '--shift', '--line', 'found 18',
  ]);
  assert.equal(code, 1);
  assert.match(out, /"prospectin" is not a tag on the menu/);
  for (const menuLine of workTagMenu()) assert.ok(out.includes(menuLine), `the menu should show: ${menuLine}`);
  assert.match(out, /Nothing was written and nothing was sent\./);
  assert.deepEqual(h.calls(), []);
  assert.equal(h.shiftLog(), null);
  assert.equal(h.exists('memory'), false, 'no memory note either');
});

test('done: every other bad report is refused the same way', (t) => {
  const h = makeHarness(t);
  const good = ['--tag', 'crm'];
  for (const [why, args] of [
    ['no tag at all', []],
    ['a tag made of prototype', ['--tag', 'constructor']],
    ['a count with exotica', [...good, '--count', '1e3']],
    ['a negative count', [...good, '--count', '-1']],
    ['a fractional count', [...good, '--count', '2.5']],
    ['a count with no value', [...good, '--count']],
    ['a skill that is a title, not a slug', [...good, '--skill', 'Meeting Sizing']],
    ['a skill slug over 100 characters', [...good, '--skill', 's'.repeat(101)]],
    ['an agent with a capital', [...good, '--agent', 'Prospecting']],
    ['a roster name over 30 characters', [...good, '--agent', 'a'.repeat(31)]],
    ['an agent that is a person\'s name', [...good, '--agent', 'thandi@acme.co.za']],
    ['--shift without --agent', [...good, '--shift', '--line', 'ran']],
    ['an empty --line', [...good, '--line', '   ']],
    ['a --line that swallowed the next flag', [...good, '--agent', 'prospecting', '--line', '--shift']],
    ['a flag it does not know', [...good, '--note', 'called Thandi at Acme']],
    ['a stray word', [...good, 'unquoted']],
    ['the same flag twice', [...good, '--tag', 'deals']],
  ]) {
    const { code, out } = h.run('done.mjs', args);
    assert.equal(code, 1, `should be refused: ${why}`);
    assert.match(out, /Nothing was written and nothing was sent\./, why);
  }
  assert.deepEqual(h.calls(), []);
  assert.equal(h.shiftLog(), null);
  assert.equal(h.exists('memory'), false);
});

test('done: --count 0 is refused for a finished task and allowed for a shift', (t) => {
  const h = makeHarness(t);
  const task = h.run('done.mjs', ['--tag', 'crm', '--count', '0', '--line', 'nothing to tidy']);
  assert.equal(task.code, 1);
  assert.match(task.out, /A count of 0 is only for a shift/);
  assert.deepEqual(h.calls(), []);
  assert.equal(h.exists('memory'), false);

  const shift = h.run('done.mjs', [
    '--tag', 'crm', '--count', '0', '--agent', 'pipeline-review', '--shift', '--line', 'nothing stale today',
  ]);
  assert.equal(shift.code, 0, shift.err);
  const body = onlySignal(h);
  assert.equal(body.signal_type, 'routine_completed');
  assert.deepEqual(body.payload, { ...BASE_PAYLOAD, tag: 'crm', count: 0, routine: 'pipeline-review' });
  assert.match(h.shiftLog(), / \| pipeline-review \| count: 0 \| auto: nothing stale today\n$/);
});

test('done: there is no way to report a skill as anything but run', (t) => {
  const h = makeHarness(t);
  for (const extra of [['--outcome', 'skipped'], ['--outcome=skipped'], ['--surface', 'routine'], ['--asset', 'x'], ['--type', 'asset_used']]) {
    const { code } = h.run('done.mjs', ['--tag', 'calls', '--skill', 'meeting-sizing', ...extra]);
    assert.equal(code, 1, `done.mjs must not take ${extra[0]}`);
  }
  assert.deepEqual(h.calls(), []);
  // What it does send for a skill is always the same three words.
  h.run('done.mjs', ['--tag', 'calls', '--skill', 'meeting-sizing']);
  const { payload } = onlySignal(h);
  assert.equal(payload.outcome, 'run_completed');
  assert.equal(payload.asset_kind, 'skill');
  assert.equal(payload.surface, 'agent');
});

test('done: an unreachable radio marks the shift line, and the report still exits 0', (t) => {
  const h = makeHarness(t, { unreachable: true });
  const { code, out, err } = h.run('done.mjs', [
    '--tag', 'prospecting', '--count', '5', '--agent', 'prospecting', '--shift', '--line', '5 found',
  ]);
  assert.equal(code, 0, err);
  assert.match(out, /The radio address didn't answer \(ENOTFOUND\)/);
  assert.doesNotMatch(out, /radio-result/, 'the machine line is for the script, never shown');
  const lines = h.shiftLog().trimEnd().split('\n');
  assert.equal(lines.length, 2, 'the shift line, then one marker line under it');
  assert.match(lines[0], / \| prospecting \| count: 5 \| auto: 5 found$/);
  assert.match(lines[1], / \| prospecting \| \(radio unreachable\) the line above was not reported$/);
  assert.doesNotMatch(lines[1], /auto:/, 'a marker line must never read as proof a schedule fired');
  assert.equal(h.calls().length, 1, 'one try, never a retry');
});

test('done: a signal the radio refused is marked too, not only one that never arrived', (t) => {
  // A revoked key (401) or a server fault (500) is still work Daily Practice did
  // not get. Before this, only a network failure left a trace.
  for (const status of [401, 500]) {
    const h = makeHarness(t, { refuse: status });
    const { code, out } = h.run('done.mjs', [
      '--tag', 'prospecting', '--count', '3', '--agent', 'prospecting', '--shift', '--line', '3 found',
    ]);
    assert.equal(code, 0);
    assert.doesNotMatch(out, /radio-result/);
    const lines = h.shiftLog().trimEnd().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[1], new RegExp(` \\| prospecting \\| \\(radio refused ${status}\\) the line above was not reported$`));
  }
});

test('done: a task a person asked for is marked the same way, in the work log', (t) => {
  const h = makeHarness(t, { unreachable: true });
  h.run('done.mjs', ['--tag', 'finance', '--line', 'reconciled the month']);
  const lines = h.workLog().trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], / \| Neo \| count: 1 \| finance \| reconciled the month$/);
  assert.match(lines[1], / \| Neo \| \(radio unreachable\) the line above was not reported$/);
});

test('done: a signal that landed leaves no marker', (t) => {
  const h = makeHarness(t);
  h.run('done.mjs', ['--tag', 'finance', '--line', 'reconciled the month']);
  assert.equal(h.workLog().trimEnd().split('\n').length, 1);
  assert.doesNotMatch(h.workLog(), /radio/);
});

test('radio: --result-line prints one machine line, and only when asked', (t) => {
  const asked = makeHarness(t);
  const a = asked.run('radio.mjs', ['signal', '--type', 'crm_updated', '--result-line', 'yes']);
  assert.match(a.out, /^Signal sent \(crm_updated\)\.\n\[radio-result\] sent\n$/);
  const plain = makeHarness(t);
  const b = plain.run('radio.mjs', ['signal', '--type', 'crm_updated']);
  assert.equal(b.out, 'Signal sent (crm_updated).\n', 'nothing changes for a caller that does not ask');
  const down = makeHarness(t, { unreachable: true });
  assert.match(down.run('radio.mjs', ['signal', '--type', 'crm_updated', '--result-line', 'yes']).out, /\[radio-result\] unreachable\n$/);
  const revoked = makeHarness(t, { refuse: 401 });
  assert.match(revoked.run('radio.mjs', ['signal', '--type', 'crm_updated', '--result-line', 'yes']).out, /\[radio-result\] refused 401\n$/);
});

test('done: the shift log is appended to, never rewritten', (t) => {
  const earlier = '2026-08-05 07:00 | prospecting | count: 236 | auto: enriched the week\'s contacts';
  // Written by hand before 1.1.0, and without a final newline.
  const h = makeHarness(t, { files: { 'status/shift-log.md': earlier } });
  h.run('done.mjs', ['--tag', 'prospecting', '--count', '4', '--agent', 'prospecting', '--shift', '--line', '4 found']);
  const lines = h.shiftLog().split('\n');
  assert.equal(lines[0], earlier);
  assert.match(lines[1], / \| prospecting \| count: 4 \| auto: 4 found$/);
  assert.equal(lines[2], '');
  assert.equal(lines.length, 3);
});

test('done: a line break in --line cannot split the one-line shape', (t) => {
  const h = makeHarness(t);
  h.run('done.mjs', ['--tag', 'ops', '--agent', 'dream', '--shift', '--line', 'merged 4 notes\n  and pruned 2']);
  assert.match(h.shiftLog(), / \| dream \| count: 1 \| auto: merged 4 notes and pruned 2\n$/);
  assert.equal(h.shiftLog().trimEnd().split('\n').length, 1);
});

test('done: memory off skips the note silently, and the shift log still gets its line', (t) => {
  const h = makeHarness(t, { status: { memory: { enabled: false, backend: 'folder', remote: null, path: 'memory' } } });
  const { code, out, err } = h.run('done.mjs', [
    '--tag', 'reporting', '--agent', 'friday-report', '--shift', '--line', 'the week in one page',
  ]);
  assert.equal(code, 0, err);
  assert.doesNotMatch(out, /memory/i);
  assert.equal(h.exists('memory'), false);
  assert.match(h.shiftLog(), / \| friday-report \| count: 1 \| auto: the week in one page\n$/);
  assert.equal(h.calls().length, 1);
});

test('done: memory off, radio off: a task a person asked for still leaves its line', (t) => {
  // The promise is that the local line never skips. It used to live only in the
  // memory log, so a harness with memory off recorded nothing at all.
  const h = makeHarness(t, {
    status: { memory: { enabled: false, backend: 'folder', remote: null, path: 'memory' } },
    sharing: { status_signal_enabled: false },
  });
  const { code, out } = h.run('done.mjs', ['--tag', 'crm', '--count', '3', '--line', 'updated three records']);
  assert.equal(code, 0);
  assert.match(h.workLog(), / \| Neo \| count: 3 \| crm \| updated three records\n$/);
  assert.equal(h.exists('memory'), false);
  assert.deepEqual(h.calls(), []);
  assert.doesNotMatch(out, /radio|memory/i);
});

test('done: a line that looks like a credential is refused before anything is written', (t) => {
  const h = makeHarness(t);
  // Each key shape is joined here rather than written out whole (see FAKE_KEY).
  for (const line of ['api_key=' + 'sk-' + 'abcdefghijklmnopqrstuv rotated', 'password: hunter2 reset', 'token ' + 'orion_' + 'abcdefghijklmnopqrstuvwx']) {
    const { code, out } = h.run('done.mjs', ['--tag', 'ops', '--agent', 'sdr', '--shift', '--line', line]);
    assert.equal(code, 1, line);
    assert.match(out, /looks like it holds a credential/);
    assert.match(out, /Nothing was written and nothing was sent\./);
  }
  assert.equal(h.shiftLog(), null);
  assert.equal(h.workLog(), null);
  assert.equal(h.exists('memory'), false);
  assert.deepEqual(h.calls(), []);
  assert.ok(looksLikeCredential('client_secret = abc') && !looksLikeCredential('reset the password policy doc'));
});

test('done: one line means one short line', (t) => {
  const h = makeHarness(t);
  const ok = h.run('done.mjs', ['--tag', 'ops', '--line', 'x'.repeat(LINE_MAX)]);
  assert.equal(ok.code, 0);
  const long = h.run('done.mjs', ['--tag', 'ops', '--line', 'x'.repeat(LINE_MAX + 1)]);
  assert.equal(long.code, 1);
  assert.match(long.out, /at most 120 characters/);
  assert.equal(h.workLog().trimEnd().split('\n').length, 1, 'only the first one was written');
});

test('done: no status/status.json is one plain line, exit 0, nothing written or sent', (t) => {
  const h = makeHarness(t, { noStatus: true });
  const { code, out } = h.run('done.mjs', ['--tag', 'ops', '--agent', 'dream', '--shift', '--line', 'ran']);
  assert.equal(code, 0);
  assert.equal(out, 'No status/status.json yet, so there is nothing to report from. Run  node start.mjs  first.\n');
  assert.deepEqual(h.calls(), []);
  assert.equal(h.shiftLog(), null);
  // But a bad report is still a bad report: validation comes first.
  assert.equal(h.run('done.mjs', ['--tag', 'nope']).code, 1);
});

test('done: a status file that will not parse costs a shift nothing locally, and sends nothing', (t) => {
  const h = makeHarness(t, { noStatus: true, files: { 'status/status.json': '{ "sharing": ' } });
  const { code, out } = h.run('done.mjs', ['--tag', 'ops', '--agent', 'dream', '--shift', '--line', 'ran']);
  assert.equal(code, 0);
  assert.match(out, /status\/status\.json could not be read/);
  assert.match(h.shiftLog(), / \| dream \| count: 1 \| auto: ran\n$/);
  assert.deepEqual(h.calls(), []);
});

test('nothing in this folder was touched by the cases above', () => {
  assert.equal(existsSync(join(statusDir, 'status.json')), false, 'the template folder has no status.json');
  assert.equal(existsSync(join(statusDir, 'shift-log.md')), false, 'and no shift log was written into it');
});

// ── The shapes ──────────────────────────────────────────────────────────────

test('the tag menu is the fifteen agreed tags, and every one fits the wire shape', () => {
  assert.deepEqual(Object.keys(WORK_TAGS), [
    'prospecting', 'outreach', 'content', 'crm', 'calls', 'deals', 'accounts', 'hiring',
    'finance', 'admin', 'onboarding', 'research', 'reporting', 'ops', 'other',
  ]);
  for (const [tag, meaning] of Object.entries(WORK_TAGS)) {
    assert.match(tag, WORK_TAG_RE);
    assert.ok(isWorkTag(tag));
    assert.ok(typeof meaning === 'string' && meaning.length > 0 && !meaning.includes('\n'), `${tag} needs a one-line meaning`);
  }
  for (const notATag of ['Prospecting', 'prospecting ', 'sales', '', 'constructor', '__proto__', 'hasOwnProperty', null, undefined, 3, ['crm']]) {
    assert.equal(isWorkTag(notATag), false, `should not be a tag: ${JSON.stringify(notATag)}`);
  }
  assert.throws(() => { WORK_TAGS.sales = 'made up'; }, TypeError, 'the menu cannot be added to at run time');
});

test('a label is a slug or a roster name, never words', () => {
  assert.deepEqual({ ...LABEL_MAX }, { skill: 100, agent: 30 });
  for (const ok of ['meeting-sizing', 'prospect-research-outreach', 'sdr', 'a1', 'head-of-sales']) {
    assert.equal(labelProblem(ok, 'skill'), null);
    assert.equal(labelProblem(ok, 'agent'), null);
  }
  assert.ok(isLabel('s'.repeat(100), 'skill'));
  assert.ok(!isLabel('s'.repeat(101), 'skill'));
  assert.ok(isLabel('a'.repeat(30), 'agent'));
  assert.ok(!isLabel('a'.repeat(31), 'agent'));
  for (const bad of ['Meeting Sizing', 'meeting sizing', 'Meeting-Sizing', 'meeting_sizing', '-lead', 'thandi@acme.co.za', 'a/b', '', ' sdr', null, undefined, 7]) {
    assert.ok(!isLabel(bad, 'skill'), `should not be a slug: ${JSON.stringify(bad)}`);
    assert.equal(typeof labelProblem(bad, 'agent'), 'string', `should have a plain reason: ${JSON.stringify(bad)}`);
  }
  // A skill the radio can install is a skill a report can name: the library's
  // slug rule lets a slug start with a digit. A roster name still starts with a
  // letter (library/HIRING.md).
  assert.ok(isLabel('5-whys', 'skill') && isLabel('9lives', 'skill'));
  assert.ok(!isLabel('lead-', 'skill') && !isLabel('a--b', 'skill'), 'a slug has single hyphens between words');
  assert.ok(!isLabel('5-whys', 'agent') && !isLabel('9lives', 'agent'));
  assert.ok(!isLabel('sdr', 'gadget'), 'an unknown kind is never a pass');
  assert.match(labelProblem('a'.repeat(31), 'agent'), /at most 30 characters/);
  assert.match(labelProblem('', 'skill'), /missing/);
});

test('a count is plain digits, and zero is only for a shift', () => {
  for (const ok of ['1', '18', '236', '999999999']) assert.equal(countProblem(ok), null);
  assert.equal(countProblem('0', { allowZero: true }), null);
  assert.match(countProblem('0'), /only for a shift/);
  for (const bad of ['', '-1', '1.5', '1e3', '0x12', 'three', '1234567890']) {
    assert.match(countProblem(bad, { allowZero: true }), /whole number in plain digits/, bad);
  }
});

// ── Tripwires: one thing written in two places ──────────────────────────────

const squash = (text) => text.replace(/\s+/g, ' ').trim();

test('tripwire: the tag menu in docs/radio.md is the menu in shapes.mjs', () => {
  const doc = readFileSync(join(repo, 'docs', 'radio.md'), 'utf8');
  const start = doc.indexOf('\n## The tag menu\n');
  assert.ok(start !== -1, 'docs/radio.md should have a "## The tag menu" section');
  const section = doc.slice(start + 1, doc.indexOf('\n## ', start + 1));
  const rows = [...section.matchAll(/^\| `([^`]+)` \| (.+?) \|$/gm)].map((m) => [m[1], m[2]]);
  // Same tags, same order, same words: what the client reads is what the scripts enforce.
  assert.deepEqual(rows, Object.entries(WORK_TAGS));
});

test('tripwire: the consent sentence is the same words in AGENTS.md, the wizard, and docs/radio.md', (t) => {
  const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
  const quoted = agents.match(/\*"(Your\s+harness\s+checks\s+in[\s\S]+?)"\*/);
  assert.ok(quoted, 'AGENTS.md should present the consent sentence in *"…"*');
  const consent = squash(quoted[1]);
  assert.match(consent, /Keep check-ins on\?$/);
  for (const promise of ['what kind of task finished', 'a general tag such as "prospecting"', 'which skill or agent ran', 'Never the content', 'You can switch this off.']) {
    assert.ok(consent.includes(promise), `the consent should say: ${promise}`);
  }

  // docs/radio.md quotes it in full.
  const radio = squash(readFileSync(join(repo, 'docs', 'radio.md'), 'utf8').replace(/^> ?/gm, ''));
  assert.ok(radio.includes(consent), 'docs/radio.md should quote the consent word for word');

  // The wizard, run for real in a scratch folder, declining check-ins so that
  // nothing is ever dialled. Its fetch is a tripwire of its own.
  const dir = mkdtempSync(join(tmpdir(), 'orion-wizard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'status'));
  copyFileSync(join(repo, 'start.mjs'), join(dir, 'start.mjs'));
  for (const f of ['shapes.mjs', 'status.schema-template.json']) copyFileSync(join(statusDir, f), join(dir, 'status', f));
  const noNetwork = join(dir, 'no-network.mjs');
  writeFileSync(noNetwork, `
    import { writeFileSync } from 'node:fs';
    globalThis.fetch = async (url) => {
      writeFileSync(${JSON.stringify(join(dir, 'dialled'))}, String(url));
      throw new Error('the wizard must not dial out in this test');
    };
  `);
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(noNetwork).href, join(dir, 'start.mjs'), '--checkins', 'no'], {
    encoding: 'utf8', input: '', cwd: dir,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(dir, 'dialled')), false);
  const said = squash(r.stdout);
  const body = consent.replace(/ Keep check-ins on\?$/, '');
  assert.ok(said.includes(body), `the wizard should say the consent word for word.\nExpected: ${body}\nSaid: ${said}`);
  assert.ok(said.includes('Keep check-ins on?'));
});

test('tripwire: the roster legend in library/HIRING.md is the one a new roster ships with', () => {
  const legendOf = (text) => {
    const from = text.indexOf('**Status legend.**');
    const to = text.indexOf('never count).', from);
    assert.ok(from !== -1 && to !== -1, 'the legend should run from "Status legend." to "never count)."');
    return squash(text.slice(from, to + 'never count).'.length).replace(/^> ?/gm, ''));
  };
  const roster = readFileSync(join(repo, '.claude', 'agents', 'README.md'), 'utf8');
  const hiring = readFileSync(join(repo, 'library', 'HIRING.md'), 'utf8');
  assert.equal(legendOf(hiring), legendOf(roster));
  assert.match(roster, /^\| Agent \| Role \| Job \| Schedule \| Status \| Skill \|$/m);
});

test('tripwire: the release has one version, and it ships done.mjs', () => {
  const manifest = JSON.parse(readFileSync(join(repo, 'update', 'manifest.json'), 'utf8'));
  const template = JSON.parse(readFileSync(join(statusDir, 'status.schema-template.json'), 'utf8'));
  const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
  const newest = changelog.match(/^## (\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}$/m);
  assert.ok(newest, 'CHANGELOG.md should open with a "## X.Y.Z — date" heading');
  assert.equal(template.template_version, manifest.template_version);
  assert.equal(newest[1], manifest.template_version);
  // A script the manifest does not list never reaches an installed harness.
  for (const script of ['status/done.mjs', 'status/radio.mjs', 'status/shapes.mjs', 'status/memory.mjs']) {
    assert.ok(manifest.refresh.includes(script), `${script} must be on the refresh list`);
  }
});

test('tripwire: the 1.1.0 headline is the disclosure, in one sentence, on one line', () => {
  const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
  const at = changelog.indexOf('\n## 1.1.0 — ');
  assert.ok(at !== -1);
  // docs/updating.md step 8 reads "the one-line headline" to the client. That is
  // the first non-empty line under the heading, so the whole disclosure is on it.
  const headline = changelog.slice(at + 1).split('\n').slice(1).find((l) => l.trim() !== '');
  assert.match(headline, /^\*\*From this version your harness also tells Daily Practice .+\*\*$/);
  for (const part of ['when a task you set is finished', 'a general tag (like "prospecting")', 'a count', 'which skill or agent ran', 'never the content', 'check-ins can still be switched off']) {
    assert.ok(headline.includes(part), `the headline should say: ${part}`);
  }
  assert.equal(headline.split('. ').length, 1, 'one sentence');
});

test('memory: every path it says is spelled with forward slashes, on every machine', (t) => {
  // On Windows a path comes back with backslashes. What the assistant reads
  // here has to match what docs/memory.md and its own commands spell.
  const h = makeHarness(t);
  // The notebook script takes the folder it is run from as the harness.
  const memory = (...args) => spawnSync(process.execPath, [join(h.dir, 'status', 'memory.mjs'), ...args], { encoding: 'utf8', cwd: h.dir }).stdout;
  const said = [
    memory('init'),
    memory('note', '--to', 'agents/Neo/log.md', '--line', 'one line'),
    memory('file', '--path', 'agents/Neo/facts/pricing.md', '--content', 'the fact'),
    memory('file', '--path', 'agents/Neo/facts/pricing.md', '--content', 'again'),
    memory('check'),
  ];
  assert.match(said[1], /Noted in agents\/Neo\/log\.md\./);
  assert.match(said[2], /Saved agents\/Neo\/facts\/pricing\.md\./);
  assert.match(said[3], /agents\/Neo\/facts\/pricing\.md already exists/);
  for (const line of said) assert.equal(line.includes('\\'), false, `a backslash in: ${line}`);
});
