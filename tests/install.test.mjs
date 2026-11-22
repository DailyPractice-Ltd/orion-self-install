import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NO_NATIVE } from './helpers/env.mjs';

const release = join(dirname(fileURLToPath(import.meta.url)), '..');
// No real `claude` or `codex` is ever reached: point both at a program that does not exist,
// so plugin setup records the missing client as a pending step.
const noNative = { ...process.env, ...NO_NATIVE };

for (const tool of ['claude-code', 'codex']) {
  test(`install CLI creates an isolated ${tool} harness`, (t) => {
    const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const target = join(base, 'client');
    const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target], { encoding: 'utf8', env: noNative });
    assert.equal(run.status, 0, run.stderr);
    const read = (path) => readFileSync(join(target, path), 'utf8');
    assert.equal(JSON.parse(read('status/status.json')).ai_assistant, tool);
    assert.equal(JSON.parse(read('status/status.json')).agent_name, 'Orion');
    assert.match(read('AGENTS.md'), /^You are \*\*Orion\*\*/m);
    assert.equal(existsSync(join(target, 'agent/agent-definition.md')), false, 'the 1.x agent definition is gone');
    assert.doesNotMatch(read('AGENTS.md'), /\{\{[A-Z_]+\}\}/, 'no placeholders: client specifics come from the knowledge base and status');
    const rename = spawnSync(process.execPath, [join(target, 'status/emit-status.mjs'), '--agent_name', 'Neo'], { encoding: 'utf8', cwd: target });
    assert.equal(rename.status, 1);
    assert.match(rename.stderr, /always Orion/);
    assert.equal(JSON.parse(read('status/status.json')).agent_name, 'Orion');
    assert.ok(existsSync(join(target, 'AGENTS.md')));
    const manifests = { codex: 'plugins/orion/plugin.json', 'claude-code': 'plugins/orion/.claude-plugin/plugin.json' };
    for (const [selected, path] of Object.entries(manifests)) assert.equal(existsSync(join(target, path)), selected === tool);
    for (const path of ['switch_ai.mjs', 'update/plugin-package.mjs', 'status/store.mjs']) assert.ok(existsSync(join(target, path)), `${path} supports offline switching`);

    const skillRoot = tool === 'codex' ? '.agents/skills' : '.claude/skills';
    for (const path of ['memory', 'status/memory.mjs', 'docs/memory.md', `${skillRoot}/memory-consolidation`]) {
      assert.equal(existsSync(join(target, path)), false, `${path} leaked into fresh install`);
    }
    assert.equal('memory' in JSON.parse(read('status/status.json')), false);
    for (const path of ['AGENTS.md']) {
      assert.doesNotMatch(read(path), /memory\/|memory\.mjs|memory-consolidation/);
    }
    for (const name of readdirSync(join(release, 'plugins/orion/skills'))) {
      assert.ok(existsSync(join(target, 'plugins/orion/skills', name, 'SKILL.md')));
    }
    assert.equal(existsSync(join(target, skillRoot)), false, 'client-owned skills start empty; shipped skills live in the package');
    assert.equal(existsSync(join(target, 'library')), false);
    assert.equal(existsSync(join(target, 'docs/intelligence-library-opt-in.md')), false);
    assert.equal(existsSync(join(target, tool === 'codex' ? 'agents' : '.claude/agents')), false);
    assert.equal(existsSync(join(target, '.specify')), false);
    assert.equal(existsSync(join(target, 'update/scaffold')), false);
    assert.ok(existsSync(join(target, '.git')));
    assert.equal(JSON.parse(read('status/status.json')).home.enabled, false);
    for (const path of ['skills', 'tests', 'specs', 'CLAUDE.md', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
      assert.equal(existsSync(join(target, path)), false, `${path} leaked into client`);
    }
    const wizard = spawnSync(process.execPath, [join(target, 'start.mjs'), '--checkins', 'no'], { encoding: 'utf8', input: '', cwd: target });
    assert.equal(wizard.status, 2, wizard.stderr);
    assert.doesNotMatch(wizard.stdout, /Step 3 of 3|Read AGENTS.md and/);
    assert.equal(JSON.parse(read('status/status.json')).machine_profile.chosen_surface, tool);
    const fresh = JSON.parse(read('status/status.json'));
    assert.equal(fresh.template_version, JSON.parse(readFileSync(join(release, 'update/manifest.json'), 'utf8')).template_version);
    assert.deepEqual(Object.keys(fresh).filter((k) => k.endsWith('_version')), ['template_version'], 'the record carries one version');
    // Exercise the actual deployed wizard: all guard/report dependencies must ship.
    const mock = join(base, 'pairing-fetch.mjs');
    writeFileSync(mock, `globalThis.fetch = async url => {
      const harness_id = '12345678-1234-1234-1234-123456789abc';
      if (String(url).endsWith('/pair')) return Response.json({harness_id, install_token: 'orion_' + 'test'.repeat(6), bridge_url: 'https://radio.test/api/bridge'});
      if (String(url).endsWith('/verify')) return Response.json({status: 'accepted', harness_id});
      if (String(url).endsWith('/signals')) return Response.json({signal_id: 'setup-1', recorded_at: '2026-11-18T12:00:00.000Z', replay: false}, {status: 201});
      throw new Error('Unexpected route');
    };`);
    const paired = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, join(target, 'start.mjs'), '--code', 'BCDF-GHJK-LMNP'], { encoding: 'utf8', input: '', cwd: target });
    assert.equal(paired.status, 0, paired.stdout + paired.stderr);
    assert.match(paired.stdout, /Step 3 of 3/);
    // Plugin readiness is separate from pairing: surfaced, never blocking, never called done.
    const pluginStep = JSON.parse(read('status/status.json')).plugin;
    assert.equal(pluginStep.setup_state, 'pending');
    assert.ok(paired.stdout.includes(pluginStep.remaining_action), paired.stdout);
    assert.doesNotMatch(paired.stdout, /whole setup worked|plugin setup complete/i);
    const saved = JSON.parse(read('status/status.json'));
    assert.equal(saved.sharing.pairing.state, 'verified');
    assert.equal(saved.setup_checkpoint.delivered, true);
    assert.equal(saved.machine_profile.chosen_surface, tool);
    assert.equal('memory' in saved, false, 'wizard must not recreate retired configuration');
    assert.equal(existsSync(join(target, 'memory')), false);

    const second = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target, '--local-only'], { encoding: 'utf8', env: noNative });
    assert.notEqual(second.status, 0);
    assert.equal(JSON.parse(read('status/status.json')).ai_assistant, tool);
  });
}

for (const [name, files] of [
  ['an agent definition', { 'agent/agent-definition.md': 'You are Orion, Priya\'s personal sales agent.\n' }],
  ['a 1.x status file', { 'status/status.json': JSON.stringify({ template_version: '1.9.0', business_name: 'Northwind' }) }],
]) {
  test(`install CLI refuses a 1.x harness folder (${name}) and points at the reinstall guide`, (t) => {
    const base = mkdtempSync(join(tmpdir(), 'orion-install-1x-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const target = join(base, 'old-orion');
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(target, path)), { recursive: true });
      writeFileSync(join(target, path), text);
    }
    const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', 'claude-code', '--target', target, '--local-only'], { encoding: 'utf8', env: noNative });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Orion 1\.x/);
    assert.match(run.stderr, /docs\/reinstall-from-1\.x\.md/);
    for (const [path, text] of Object.entries(files)) assert.equal(readFileSync(join(target, path), 'utf8'), text, `${path} left alone`);
  });
}

test('install CLI rejects collisions before creating status', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const target = join(base, 'client');
  mkdirSync(target);
  writeFileSync(join(target, 'AGENTS.md'), 'my own instructions\n');
  const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', 'codex', '--target', target, '--local-only'], { encoding: 'utf8', env: noNative });
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), 'my own instructions\n');
  assert.equal(existsSync(join(target, 'status/status.json')), false);
});

test('release wizard and home command do not turn the checkout into a client', () => {
  const statusPath = join(release, 'status/status.json');
  const hash = () => existsSync(statusPath)
    ? createHash('sha256').update(readFileSync(statusPath)).digest('hex')
    : null;
  const before = hash();
  for (const script of ['start.mjs', 'status/home.mjs']) {
    const args = script === 'start.mjs' ? [] : ['prepare', '--yes'];
    const run = spawnSync(process.execPath, [join(release, script), ...args], { encoding: 'utf8', input: '' });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /release folder/i);
  }
  assert.equal(hash(), before, 'release checkout status was not changed');
});

test('install CLI refuses --migrate-from and points at the reinstall guide', t => {
  const base=mkdtempSync(join(tmpdir(),'orion-migrate-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const legacy=join(base,'legacy'),target=join(base,'client');mkdirSync(legacy);
  writeFileSync(join(legacy,'agent-definition.md'),'old\n');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','claude-code','--target',target,'--migrate-from',legacy,'--local-only'],{encoding:'utf8',env:noNative});
  assert.equal(result.status,2,result.stdout+result.stderr);
  assert.match(result.stderr,/docs\/reinstall-from-1\.x\.md/);
  assert.equal(existsSync(target),false);
  assert.equal(readFileSync(join(legacy,'agent-definition.md'),'utf8'),'old\n');
});

test('remote setup rejects a repository that is not verified private',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-remote-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const bin=join(base,'bin');mkdirSync(bin);
  writeFileSync(join(bin,'gh'),'#!/bin/sh\nprintf "false\\n"\n');
  chmodSync(join(bin,'gh'),0o755);
  const target=join(base,'client');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','codex','--target',target,'--remote','https://github.com/owner/private.git'],{encoding:'utf8',env:{...noNative,PATH:`${bin}:${process.env.PATH}`}});
  assert.equal(result.status,2);assert.match(result.stderr,/must exist and be private/);
  assert.equal(existsSync(target),false);
});
