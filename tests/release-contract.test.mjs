import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

test('release contract plans one selected runtime from portable sources', (t) => {
  const release = mkdtempSync(join(tmpdir(), 'orion-release-contract-'));
  t.after(() => rmSync(release, { recursive: true, force: true }));
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  for (const path of ['update/manifest.json', 'update/release-contract.mjs',
    ...manifest.deployment.common_sources,
    ...manifest.deployment.entries.map((entry) => entry.source)]) {
    mkdirSync(dirname(join(release, path)), { recursive: true });
    copyFileSync(join(repo, path), join(release, path));
  }
  for (const tool of ['claude-code', 'codex']) {
    const run = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', tool], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const plan = JSON.parse(run.stdout);
    const destinations = plan.entries.map((entry) => entry.destination);
    assert.ok(destinations.includes(tool === 'codex' ? '.agents/skills/hire-agent/SKILL.md' : '.claude/skills/hire-agent/SKILL.md'));
    assert.ok(destinations.includes(tool === 'codex' ? 'agents/README.md' : '.claude/agents/README.md'));
    assert.ok(plan.entries.some((entry) => entry.source === 'skills/hire-agent/SKILL.md' && entry.fingerprint_key === 'skills/hire-agent/SKILL.md'));
    assert.ok(plan.entries.some((entry) => entry.source === 'agents/README.md' && entry.ownership === 'client-template'));
    assert.ok(destinations.every((path) => !path.startsWith('skills/') && (tool === 'codex' ? path === 'agents/README.md' || !path.startsWith('agents/') : !path.startsWith('agents/')) && !path.startsWith('.claude/skills/speckit')));
    assert.ok(destinations.every((path) => tool === 'codex' ? !path.startsWith('.claude/') : !path.startsWith('.agents/')));
  }
  rmSync(join(release, 'skills/hire-agent/SKILL.md'));
  const missing = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /missing release source/i);
});

test('release contract rejects an unsupported tool and keeps historical ownership hashes', () => {
  const run = spawnSync(process.execPath, [join(repo, 'update/release-contract.mjs'), '--tool', 'chatgpt'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /selected tool/i);
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.deployment.tools, ['claude-code', 'codex']);
  const pristine = JSON.parse(readFileSync(join(repo, 'update/pristine.json'), 'utf8'));
  assert.ok(pristine.files['skills/hire-agent/SKILL.md'].length > 0);
  assert.ok(pristine.files['agents/README.md'].length > 0);
});
