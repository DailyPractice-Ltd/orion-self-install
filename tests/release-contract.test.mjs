import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
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
    ...manifest.deployment.entries.flatMap((entry) => [entry.source,...Object.values(entry.sources || {})])]) {
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
    assert.ok(destinations.every((path) => !path.startsWith('skills/') && (tool === 'codex' ? path === 'agents/README.md' || !path.startsWith('agents/') : !path.startsWith('agents/'))));
    assert.ok(destinations.every((path) => tool === 'codex' ? !path.startsWith('.claude/') : !path.startsWith('.agents/')));
  }
  rmSync(join(release, 'skills/hire-agent/SKILL.md'));
  const missing = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /skill mappings|missing release source/i);
  copyFileSync(join(repo, 'skills/hire-agent/SKILL.md'), join(release, 'skills/hire-agent/SKILL.md'));
  mkdirSync(join(release, 'skills/unmapped'), { recursive: true });
  copyFileSync(join(repo, 'skills/hire-agent/SKILL.md'), join(release, 'skills/unmapped/SKILL.md'));
  const unmapped = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(unmapped.status, 0);
  assert.match(unmapped.stderr, /skill mappings/i);
  rmSync(join(release, 'skills/unmapped'), { recursive: true });
  manifest.deployment.entries.push(manifest.deployment.entries.find(entry => entry.source === 'skills/hire-agent/SKILL.md'));
  writeFileSync(join(release, 'update/manifest.json'), JSON.stringify(manifest));
  const duplicate = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'claude-code'], { encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /skill mappings/i);
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

test('all release skills have exactly one mapping for both tools', () => {
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  const names = readdirSync(join(repo, 'skills')).sort();
  assert.equal(names.length,14);
  assert.deepEqual(manifest.deployment.entries.filter(entry => entry.source.startsWith('skills/')).map(entry => entry.source).sort(),
    names.map(name => `skills/${name}/SKILL.md`));
  for(const name of names) for(const tool of ['codex','claude-code']) assert.equal(manifest.deployment.entries.filter(e=>e.source===`skills/${name}/SKILL.md` && e.destinations?.[tool]===`${tool==='codex'?'.agents':'.claude'}/skills/${name}/SKILL.md`).length,1);
  for (const name of names) assert.ok(existsSync(join(repo, 'skills', name, 'SKILL.md')));
  assert.equal(existsSync(join(repo, '.claude')), false, 'release must not track or generate a second skill tree');
  for (const path of manifest.refresh) assert.ok(existsSync(join(repo, path)), `legacy refresh source missing: ${path}`);
  for (const name of names) assert.equal(manifest.refresh.includes(`.claude/skills/${name}/SKILL.md`), false);
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
