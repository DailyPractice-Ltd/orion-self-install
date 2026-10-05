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
} from '../status/shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const statusDir = join(repo, 'status');

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
function makeHarness(t, { sharing = {}, status = {}, unreachable = false, noStatus = false, files = {} } = {}) {
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
        install_token: 'orion_testtesttesttesttesttest',
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
        env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(mock).href}` },
      });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    /** Every call the bridge received, parsed. */
    calls: () => (read('fetch.log') || '').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    /** The same calls as raw text, for "this string appears in no request" checks. */
    wire: () => read('fetch.log') || '',
    shiftLog: () => read('status/shift-log.md'),
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
  // The local half: the harness's own log in memory, word for word.
  assert.equal(h.memoryLog('Neo'), `${line}\n`);
  assert.match(out, /Noted in agents\/Neo\/log\.md\./);
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
  assert.deepEqual(handed, [
    ['signal', '--type', 'task_completed', '--tag', 'calls', '--count', '1'],
    ['signal', '--type', 'task_completed', '--tag', 'calls', '--count', '2', '--routine', 'research',
      '--asset', 'meeting-sizing', '--asset-kind', 'skill', '--outcome', 'run_completed', '--surface', 'agent'],
    ['signal', '--type', 'routine_completed', '--tag', 'calls', '--count', '0', '--routine', 'research',
      '--asset', 'meeting-sizing', '--asset-kind', 'skill', '--outcome', 'run_completed', '--surface', 'routine'],
  ]);
  for (const args of handed) {
    for (const arg of args) assert.ok(!/Thandi|Acme|Durban|pricing/.test(arg), `the line must not be handed over: ${arg}`);
  }
  // While the line itself is safe on this machine, three times over.
  assert.equal(h.memoryLog('Neo'), `${line}\n`);
  assert.ok(h.memoryLog('research').startsWith(`${line}\n`));
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
  assert.equal(h.memoryLog('Neo'), 'cleared the inbox\n');
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
  assert.match(task.out, /--count 0 is only for a shift/);
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
  assert.match(h.shiftLog(), / \| prospecting \| count: 5 \| auto: 5 found \(radio unreachable\)\n$/);
  assert.equal(h.calls().length, 1, 'one try, never a retry');
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
  for (const bad of ['Meeting Sizing', 'meeting sizing', 'Meeting-Sizing', 'meeting_sizing', '9lives', '-lead', 'thandi@acme.co.za', 'a/b', '', ' sdr', null, undefined, 7]) {
    assert.ok(!isLabel(bad, 'skill'), `should not be a slug: ${JSON.stringify(bad)}`);
    assert.equal(typeof labelProblem(bad, 'agent'), 'string', `should have a plain reason: ${JSON.stringify(bad)}`);
  }
  assert.ok(!isLabel('sdr', 'gadget'), 'an unknown kind is never a pass');
  assert.match(labelProblem('a'.repeat(31), 'agent'), /at most 30 characters/);
  assert.match(labelProblem('', 'skill'), /missing/);
});
