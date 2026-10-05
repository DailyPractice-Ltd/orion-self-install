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
