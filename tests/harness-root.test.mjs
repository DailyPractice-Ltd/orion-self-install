// Acceptance #6 (spec 008): package resources resolve inside the package; harness
// operations resolve only inside the explicitly selected project. Missing, ambiguous
// or escaping roots fail without reading another harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';

const source = new URL('../', import.meta.url);
const SCRIPT = 'plugins/orion/skills/call-planner/scripts/build-call-plan.mjs';
const DATA = JSON.stringify({ today: [], enrichment: [], lists: {} });

/** A machine with two synthetic harnesses side by side and a Codex-style cached package copy. */
function machine(t) {
  const base = mkdtempSync(join(tmpdir(), 'orion-root-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const harness = (name) => {
    const root = join(base, 'work', name);
    for (const path of ['status', 'update', 'plugins/orion']) cpSync(new URL(path, source), join(root, path), { recursive: true });
    const status = JSON.parse(readFileSync(new URL('status/status.schema-template.json', source), 'utf8'));
    status.ai_assistant = 'codex';
    status.business_name = name;
    status.sharing = { ...status.sharing, status_signal_enabled: true, bridge_url: 'https://bridge.test/api/bridge', harness_id: '11111111-1111-1111-1111-111111111111', install_token: 'orion_' + 'test'.repeat(6) };
    writeFileSync(join(root, 'status/status.json'), JSON.stringify(status));
    writeFileSync(join(root, 'call-data.json'), DATA);
    return root;
  };
  const a = harness('alpha');
  const b = harness('beta');
  const cache = join(base, 'codex-cache/plugins/orion');
  cpSync(new URL('plugins/orion', source), cache, { recursive: true });
  const log = join(base, 'calls.jsonl');
  const fetchStub = join(base, 'fetch.mjs');
  writeFileSync(fetchStub, `import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,o={})=>{appendFileSync(${JSON.stringify(log)},JSON.stringify({url})+'\\n');if(url.endsWith('/verify'))return new Response(JSON.stringify({status:'accepted',harness_id:'11111111-1111-1111-1111-111111111111'}),{status:200});if(url.endsWith('/signals'))return new Response(JSON.stringify({signal_id:'s1',recorded_at:'2026-11-18T12:00:00.000Z',replay:false}),{status:201});return new Response('{"results":[]}',{status:200});};`);
  const run = (script, args, cwd) => {
    const r = spawnSync(process.execPath, ['--import', fetchStub, script, ...args], { cwd, encoding: 'utf8', env: plainEnv() });
    return { ...r, output: r.stdout + r.stderr };
  };
  const calls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  const plans = (dir) => existsSync(dir) ? readdirSync(dir).filter((name) => name.startsWith('call-plan-')) : [];
  const status = (root) => readFileSync(join(root, 'status/status.json'), 'utf8');
  return { base, a, b, cache, run, calls, plans, status, cachedScript: join(cache, 'skills/call-planner/scripts/build-call-plan.mjs') };
}

test('a cached package copy outside the harness runs against the harness it is invoked in', (t) => {
  const m = machine(t);
  const r = m.run(m.cachedScript, [], m.a);
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /Day sheet written:/);
  assert.equal(m.plans(m.a).length, 3, 'outputs land in the harness');
  assert.deepEqual(m.plans(join(m.cache, 'skills/call-planner/scripts')), [], 'nothing is written into the package');
  assert.deepEqual(m.plans(m.b), []);
});

test('an explicit --root selects the harness when the caller stands elsewhere', (t) => {
  const m = machine(t);
  const r = m.run(m.cachedScript, ['--root', m.a], m.cache);
  assert.equal(r.status, 0, r.output);
  assert.equal(m.plans(m.a).length, 3);
  assert.deepEqual(m.plans(m.cache), []);
});

/** A refusal: exit 2, the plain recovery sentence, and no harness touched at all. */
function refused(m, r, why) {
  assert.equal(r.status, 2, r.output);
  assert.match(r.output, why);
  assert.match(r.output, /Open the intended Orion folder/);
  assert.deepEqual(m.calls(), [], 'no guard ran, so no harness was read');
  for (const root of [m.a, m.b]) assert.deepEqual(m.plans(root), []);
}

test('the script never infers the harness from its own location', (t) => {
  const m = machine(t);
  const before = m.status(m.a);
  refused(m, m.run(join(m.a, SCRIPT), [], m.base), /is not the root of an Orion folder/);
  assert.equal(m.status(m.a), before);
});

test('a folder holding several harnesses is missing context, not a search space', (t) => {
  const m = machine(t);
  refused(m, m.run(m.cachedScript, [], join(m.base, 'work')), /is not the root of an Orion folder/);
});

test('a subfolder of a harness is not its root: no ancestor walk', (t) => {
  const m = machine(t);
  refused(m, m.run(join(m.a, SCRIPT), [], join(m.a, 'status')), /is not the root of an Orion folder/);
});

test('naming another harness from inside one is ambiguous and reads neither', (t) => {
  const m = machine(t);
  const before = m.status(m.b);
  refused(m, m.run(m.cachedScript, ['--root', m.b], m.a), /names another/);
  assert.equal(m.status(m.b), before);
});

test('two different --root values are ambiguous', (t) => {
  const m = machine(t);
  refused(m, m.run(m.cachedScript, ['--root', m.a, '--root', m.b], m.cache), /More than one --root/);
});

test('a --root that is not an Orion folder fails', (t) => {
  const m = machine(t);
  refused(m, m.run(m.cachedScript, ['--root', m.cache], m.base), /is not an Orion folder/);
  refused(m, m.run(m.cachedScript, ['--root'], m.a), /--root needs a folder path/);
});

test('call data and outputs that escape the harness fail before any work', (t) => {
  const m = machine(t);
  refused(m, m.run(m.cachedScript, ['--data', '../beta/call-data.json'], m.a), /call data .* is outside the Orion folder/);
  refused(m, m.run(m.cachedScript, ['--data', join(m.b, 'call-data.json')], m.a), /is outside the Orion folder/);
  refused(m, m.run(m.cachedScript, ['--out', m.b], m.a), /output folder .* is outside the Orion folder/);
  symlinkSync(m.b, join(m.a, 'linked'), 'junction');
  refused(m, m.run(m.cachedScript, ['--data', 'linked/call-data.json'], m.a), /is outside the Orion folder/);
});

test('a harness whose status links into another folder is refused', (t) => {
  const m = machine(t);
  rmSync(join(m.a, 'status'), { recursive: true });
  symlinkSync(join(m.b, 'status'), join(m.a, 'status'), 'junction');
  refused(m, m.run(m.cachedScript, [], m.a), /links outside that folder/);
});

test('relative --data and --out resolve inside the selected harness', (t) => {
  const m = machine(t);
  mkdirSync(join(m.a, 'plans'));
  const r = m.run(m.cachedScript, ['--root', m.a, '--data', 'call-data.json', '--out', 'plans'], m.cache);
  assert.equal(r.status, 0, r.output);
  assert.equal(m.plans(join(m.a, 'plans')).length, 3);
});

// Package resources versus harness data, in the skill instructions themselves.
const PACKAGE = new URL('plugins/orion/', source);
const packageRoot = fileURLToPath(PACKAGE);
const packageDocs = readdirSync(PACKAGE, { recursive: true, withFileTypes: true })
  .filter((item) => item.isFile() && item.name.endsWith('.md'))
  .map((item) => join(item.parentPath, item.name));

test('relative links in the package resolve to files inside the package', () => {
  for (const file of packageDocs) {
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:|^#/i.test(target)) continue;
      const resolved = resolve(dirname(file), target.split('#')[0]);
      assert.ok(!relative(packageRoot, resolved).startsWith('..'), `${relative(packageRoot, file)} links outside the package: ${target}`);
      assert.ok(existsSync(resolved), `${relative(packageRoot, file)} links to a missing package file: ${target}`);
    }
  }
});

test('harness files named in skill instructions are read at the active Orion folder root', () => {
  const harnessPath = /`(?:status|docs|validation|update|agent|crm)\/[^`]*`/;
  for (const file of packageDocs) {
    for (const paragraph of readFileSync(file, 'utf8').split(/\n\s*\n/)) {
      if (!harnessPath.test(paragraph)) continue;
      assert.match(paragraph, /active Orion folder|another repository/, `${relative(packageRoot, file)}: ${paragraph}`);
    }
  }
});

test('the call planner tells the agent which folder to run it from', () => {
  const skill = readFileSync(new URL('skills/call-planner/SKILL.md', PACKAGE), 'utf8');
  assert.match(skill, /root of the active Orion folder/);
  assert.match(skill, /--root/);
  assert.doesNotMatch(skill, /from this skill folder/);
});
