import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const release = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const tool of ['claude-code', 'codex']) {
  test(`install CLI creates an isolated ${tool} harness`, (t) => {
    const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const target = join(base, 'client');
    const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const read = (path) => readFileSync(join(target, path), 'utf8');
    assert.equal(JSON.parse(read('status/status.json')).selected_tool, tool);
    assert.ok(existsSync(join(target, 'AGENTS.md')));
    assert.ok(existsSync(join(target, tool === 'codex' ? '.agents/skills/hire-agent/SKILL.md' : '.claude/skills/hire-agent/SKILL.md')));
    assert.ok(existsSync(join(target, tool === 'codex' ? 'team/README.md' : '.claude/agents/README.md')));
    for (const path of ['skills', 'agents', 'tests', 'specs', 'CLAUDE.md', tool === 'codex' ? '.claude' : '.agents']) {
      assert.equal(existsSync(join(target, path)), false, `${path} leaked into client`);
    }
    const wizard = spawnSync(process.execPath, [join(target, 'start.mjs'), '--checkins', 'no'], { encoding: 'utf8', input: '', cwd: target });
    assert.equal(wizard.status, 0, wizard.stderr);
    assert.equal(JSON.parse(read('status/status.json')).machine_profile.chosen_surface, tool);
    const second = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.equal(JSON.parse(read('status/status.json')).selected_tool, tool);
  });
}

test('install CLI rejects collisions before creating status', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const target = join(base, 'client');
  mkdirSync(target);
  writeFileSync(join(target, 'AGENTS.md'), 'my own instructions\n');
  const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', 'codex', '--target', target], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), 'my own instructions\n');
  assert.equal(existsSync(join(target, 'status/status.json')), false);
});

test('release wizard and home command do not turn the checkout into a client', () => {
  for (const script of ['start.mjs', 'status/home.mjs']) {
    const args = script === 'start.mjs' ? [] : ['prepare', '--yes'];
    const run = spawnSync(process.execPath, [join(release, script), ...args], { encoding: 'utf8', input: '' });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /release folder/i);
  }
  assert.equal(existsSync(join(release, 'status/status.json')), false);
});
