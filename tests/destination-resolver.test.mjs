import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
  const root = harness(t, { selected_tool: 'codex', machine_profile: { chosen_surface: 'claude-code' } });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.selected_tool, 'codex');
  assert.ok(plan.entries.some((e) => e.destination === '.agents/skills/hire-agent/SKILL.md' && e.state === 'absent'));
  assert.ok(plan.entries.some((e) => e.destination === 'team/README.md' && e.ownership === 'client-template'));
  assert.ok(plan.entries.every((e) => !e.destination.startsWith('.claude/')));
});

test('missing and invalid recorded selections fail instead of inferring a tool', (t) => {
  const root = harness(t, { machine_profile: { chosen_surface: 'codex' } });
  let result = run(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing status\.selected_tool/);
  writeFileSync(join(root, 'status/status.json'), JSON.stringify({ selected_tool: 'chatgpt' }));
  result = run(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid status\.selected_tool: chatgpt/);
});

test('ownership keeps edited release files and client roster rows', (t) => {
  const root = harness(t, { selected_tool: 'claude-code' });
  for (const [source, destination] of [
    ['skills/hire-agent/SKILL.md', '.claude/skills/hire-agent/SKILL.md'],
    ['skills/create-skill/SKILL.md', '.claude/skills/create-skill/SKILL.md'],
    ['agents/README.md', '.claude/agents/README.md'],
  ]) {
    mkdirSync(join(root, dirname(destination)), { recursive: true });
    copyFileSync(join(release, source), join(root, destination));
  }
  writeFileSync(join(root, '.claude/skills/create-skill/SKILL.md'), 'Client changed this skill.\n');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const byDestination = Object.fromEntries(JSON.parse(result.stdout).entries.map((e) => [e.destination, e.state]));
  assert.equal(byDestination['.claude/skills/hire-agent/SKILL.md'], 'owned');
  assert.equal(byDestination['.claude/skills/create-skill/SKILL.md'], 'preserve');
  assert.equal(byDestination['.claude/agents/README.md'], 'client-owned');
});

test('legacy Claude layout requires an explicit migration choice', (t) => {
  const root = harness(t, { machine_profile: { chosen_surface: 'claude-code' } });
  let result = run(root, '--legacy-tool', 'claude-code');
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.selected_tool, 'claude-code');
  assert.equal(plan.legacy_migration, true);
  assert.ok(plan.entries.some((e) => e.destination === '.claude/agents/README.md'));
  result = run(root, '--legacy-tool', 'codex');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Legacy migration requires explicit/);
});
