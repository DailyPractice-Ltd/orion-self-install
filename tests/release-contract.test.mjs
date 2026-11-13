import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
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

test('all release skills have one source and only client skills are deployable', () => {
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  const names = readdirSync(join(repo, 'skills')).sort();
  const client = names.filter(name => !name.startsWith('speckit-'));
  const maintainer = names.filter(name => name.startsWith('speckit-'));
  assert.deepEqual(client, ['create-skill', 'hire-agent', 'update-harness']);
  assert.equal(maintainer.length, 11);
  assert.deepEqual(manifest.deployment.entries.filter(entry => entry.source.startsWith('skills/')).map(entry => entry.source).sort(),
    client.map(name => `skills/${name}/SKILL.md`));
  for (const name of names) assert.ok(existsSync(join(repo, 'skills', name, 'SKILL.md')));
  assert.equal(existsSync(join(repo, '.claude')), false, 'release must not track or generate a second skill tree');
  for (const path of manifest.refresh) assert.ok(existsSync(join(repo, path)), `legacy refresh source missing: ${path}`);
  for (const name of client) assert.equal(manifest.refresh.includes(`.claude/skills/${name}/SKILL.md`), false);
});

test('maintainer Claude discovery copies are generated from portable sources', (t) => {
  const release = mkdtempSync(join(tmpdir(), 'orion-maintainer-skills-'));
  t.after(() => rmSync(release, { recursive: true, force: true }));
  const script = '.specify/scripts/generate-claude-skills.mjs';
  mkdirSync(dirname(join(release, script)), { recursive: true });
  copyFileSync(join(repo, script), join(release, script));
  const names = readdirSync(join(repo, 'skills')).filter(name => name.startsWith('speckit-'));
  for (const name of names) {
    const path = `skills/${name}/SKILL.md`;
    mkdirSync(dirname(join(release, path)), { recursive: true });
    copyFileSync(join(repo, path), join(release, path));
  }
  const run = spawnSync(process.execPath, [join(release, script)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  for (const name of names) {
    assert.equal(readFileSync(join(release, `.claude/skills/${name}/SKILL.md`), 'utf8'),
      readFileSync(join(release, `skills/${name}/SKILL.md`), 'utf8'));
  }
});
