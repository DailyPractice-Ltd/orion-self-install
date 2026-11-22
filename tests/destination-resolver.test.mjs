import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planForTool, runtimeLayout } from '../update/destination-resolver.mjs';

const release = join(dirname(fileURLToPath(import.meta.url)), '..');
const command = join(release, 'update/destination-resolver.mjs');

function harness(t, status) {
  const root = mkdtempSync(join(tmpdir(), 'orion-destination-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'status'), { recursive: true });
  if (status) writeFileSync(join(root, 'status/status.json'), JSON.stringify(status));
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [command, '--root', root, ...args], { encoding: 'utf8' });
}

test('recorded tool selects only its destinations and classifies absent files', (t) => {
  const root = harness(t, { ai_assistant: 'codex', machine_profile: { chosen_surface: 'claude-code' } });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.ai_assistant, 'codex');
  assert.ok(plan.entries.some((e) => e.destination === 'plugins/orion/skills/prospecting/SKILL.md' && e.state === 'absent'));
  assert.ok(!plan.entries.some((e) => e.destination === 'agents/README.md'));
  assert.ok(plan.entries.every((e) => !e.destination.startsWith('.claude/') && !e.destination.startsWith('.agents/')));
});


test('missing and invalid recorded selections fail instead of inferring a tool', (t) => {
  const root = harness(t, { machine_profile: { chosen_surface: 'codex' } });
  let result = run(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing status\.ai_assistant/);
  writeFileSync(join(root, 'status/status.json'), JSON.stringify({ ai_assistant: 'chatgpt' }));
  result = run(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid status\.ai_assistant: chatgpt/);
});

test('ownership keeps edited release files and excludes the retired roster', (t) => {
  const root = harness(t, { ai_assistant: 'claude-code' });
  for (const path of ['plugins/orion/skills/prospecting/SKILL.md', 'plugins/orion/skills/create-skill/SKILL.md']) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    copyFileSync(join(release, path), join(root, path));
  }
  writeFileSync(join(root, 'plugins/orion/skills/create-skill/SKILL.md'), 'Client changed this skill.\n');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const byDestination = Object.fromEntries(JSON.parse(result.stdout).entries.map((e) => [e.destination, e.state]));
  assert.equal(byDestination['plugins/orion/skills/prospecting/SKILL.md'], 'owned');
  assert.equal(byDestination['plugins/orion/skills/create-skill/SKILL.md'], 'preserve');
  assert.equal(byDestination['.claude/agents/README.md'], undefined);
});

test('legacy Claude layout requires an explicit migration choice', (t) => {
  const root = harness(t, { machine_profile: { chosen_surface: 'claude-code' } });
  let result = run(root, '--legacy-tool', 'claude-code');
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.ai_assistant, 'claude-code');
  assert.equal(plan.legacy_migration, true);
  assert.ok(plan.entries.some((e) => e.destination === 'plugins/orion/skills/prospecting/SKILL.md'));
  result = run(root, '--legacy-tool', 'codex');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Legacy migration requires explicit/);
});

test('runtime layout names client skills, the package and the catalog without reading shipped entries', (t) => {
  for (const [tool, expected] of [
    ['claude-code', { skillRoot: '.claude/skills', catalogPath: '.claude-plugin/marketplace.json', rosterPath: '.claude/agents/README.md', jobRoot: '.claude/agents' }],
    ['codex', { skillRoot: '.agents/skills', catalogPath: '.agents/plugins/marketplace.json', rosterPath: 'agents/README.md', jobRoot: 'agents' }],
  ]) {
    const root = harness(t, { ai_assistant: tool });
    mkdirSync(join(root, 'update'));
    writeFileSync(join(root, 'update/manifest.json'), JSON.stringify({ deployment: { tools: ['claude-code', 'codex'], common_sources: [], entries: [] } }));
    assert.deepEqual(runtimeLayout(root), { ai_assistant: tool, packageRoot: 'plugins/orion', ...expected });
  }
});

test('the plugin package ships at the same path for both tools and must be mapped exactly once', (t) => {
  const release = mkdtempSync(join(tmpdir(), 'orion-package-'));
  t.after(() => rmSync(release, { recursive: true, force: true }));
  const files = ['plugins/orion/skills/foo/SKILL.md', 'plugins/orion/skills/foo/references/guide.md'];
  for (const path of files) {
    mkdirSync(join(release, dirname(path)), { recursive: true });
    writeFileSync(join(release, path), `${path}\n`);
  }
  const entry = (source) => ({ source, ownership: 'release', fingerprint_key: source });
  const deployment = (entries) => ({ tools: ['claude-code', 'codex'], common_sources: [], entries });
  for (const tool of ['claude-code', 'codex']) {
    assert.deepEqual(planForTool(deployment(files.map(entry)), tool, { releaseRoot: release }),
      files.map((source) => ({ source, destination: source, ownership: 'release', fingerprint_key: source })));
  }
  assert.throws(() => planForTool(deployment([entry(files[0])]), 'codex', { releaseRoot: release }), /every file under plugins\/orion\/ exactly once/);
  assert.throws(() => planForTool(deployment([...files.map(entry), entry(files[1])]), 'codex', { releaseRoot: release }), /every file under plugins\/orion\/ exactly once/);
  const perTool = { ...entry(files[0]), destinations: { 'claude-code': '.claude/skills/foo/SKILL.md', codex: '.agents/skills/foo/SKILL.md' } };
  assert.throws(() => planForTool(deployment([perTool, entry(files[1])]), 'codex', { releaseRoot: release }), /ships at its own path/);
});
