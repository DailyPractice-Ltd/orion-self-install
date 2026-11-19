import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planForTool, safePath } from '../update/destination-resolver.mjs';
import { computePristine, hasFullHistory, serialise, PRISTINE_PATH } from './helpers/pristine.mjs';

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
    for (const path of ['status/guard.mjs', 'status/store.mjs', 'status/report.mjs', 'docs/setup.md']) {
      assert.ok(destinations.includes(path), `${path} must reach an installed ${tool} folder`);
      assert.ok(manifest.refresh.includes(path), `${path} must also reach legacy updates`);
    }
    assert.ok(!destinations.some(path => path.startsWith('.specify/')), 'maintainer governance stays in the release');
    assert.ok(!plan.entries.some(entry => [entry.source, entry.destination].some(path => path.split('/').includes('specs'))), 'human-only records stay out of every deployment');
    const skillRoot = tool === 'codex' ? '.agents/skills' : '.claude/skills';
    for (const name of ['prospecting', 'call-planner', 'friday-report', 'memory-consolidation']) {
      assert.ok(destinations.includes(`${skillRoot}/${name}/SKILL.md`));
    }
    assert.ok(destinations.includes(`${skillRoot}/call-planner/scripts/build-call-plan.mjs`));
    assert.ok(destinations.includes(`${skillRoot}/call-planner/assets/call-data.template.json`));
    assert.ok(!destinations.includes(`${skillRoot}/hire-agent/SKILL.md`));
    assert.ok(!destinations.some(path => path.startsWith('agents/') || path.startsWith('.claude/agents/')));
    assert.ok(destinations.every((path) => tool === 'codex' ? !path.startsWith('.claude/') : !path.startsWith('.agents/')));
  }
  rmSync(join(release, 'skills/prospecting/SKILL.md'));
  const missing = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /skill mappings|missing release source/i);
  copyFileSync(join(repo, 'skills/prospecting/SKILL.md'), join(release, 'skills/prospecting/SKILL.md'));
  mkdirSync(join(release, 'skills/unmapped'), { recursive: true });
  copyFileSync(join(repo, 'skills/prospecting/SKILL.md'), join(release, 'skills/unmapped/SKILL.md'));
  const unmapped = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(unmapped.status, 0);
  assert.match(unmapped.stderr, /skill mappings/i);
  rmSync(join(release, 'skills/unmapped'), { recursive: true });
  manifest.deployment.entries.push(manifest.deployment.entries.find(entry => entry.source === 'skills/prospecting/SKILL.md'));
  writeFileSync(join(release, 'update/manifest.json'), JSON.stringify(manifest));
  const duplicate = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'claude-code'], { encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /skill mappings/i);
});

test('release contract rejects an unsupported tool and keeps historical ownership hashes', () => {
  const run = spawnSync(process.execPath, [join(repo, 'update/release-contract.mjs'), '--tool', 'chatgpt'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /AI assistant/i);
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.deployment.tools, ['claude-code', 'codex']);
  const pristine = JSON.parse(readFileSync(join(repo, 'update/pristine.json'), 'utf8'));
  assert.ok(pristine.files['skills/hire-agent/SKILL.md'].length > 0);
  assert.ok(pristine.files['agents/README.md'].length > 0);
});

test('release contract ships every skill file to the selected runtime', () => {
  const sources = readdirSync(join(repo, 'skills'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(repo, join(entry.parentPath, entry.name)).split(sep).join('/'));
  for (const tool of ['codex', 'claude-code']) {
    const run = spawnSync(process.execPath, [join(repo, 'update/release-contract.mjs'), '--tool', tool], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const plan = JSON.parse(run.stdout);
    for (const source of sources) {
      const destination = `${tool === 'codex' ? '.agents' : '.claude'}/${source}`;
      assert.ok(plan.entries.some(entry => entry.source === source && entry.destination === destination), `missing skill file: ${source}`);
    }
  }
});

test('update/pristine.json is up to date with everything this release ships', (t) => {
  if (!hasFullHistory()) return t.skip('shallow clone: the shipped history is not here to check against');
  assert.equal(
    readFileSync(join(repo, PRISTINE_PATH), 'utf8'), serialise(computePristine()),
    'update/pristine.json is stale: run node tests/helpers/pristine.mjs --write as the last edit of the release',
  );
});


test('supported instructions route website chat to an executable paired folder', () => {
  for (const file of ['README.md', 'AGENTS.md', 'agent/adapters/chatgpt.md', 'agent/adapters/claude.md', 'agent/adapters/copilot.md']) {
    const text = readFileSync(join(repo, file), 'utf8');
    assert.match(text, /Codex.*Claude Code|Claude Code.*Codex/s, `${file} names the supported tools`);
    assert.match(text, /website|paste-only/i, `${file} explains the unsupported surface`);
    assert.match(text, /docs\/setup\.md|setup\.md/, `${file} points at executable setup and recovery`);
    assert.doesNotMatch(text, /always works|works just as well|nothing else about your install is affected|your work is unaffected|You can switch this off\. Keep check-ins on/);
  }
});


test('deployed documentation uses permitted sources without directing agents into human records', () => {
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  for (const tool of manifest.deployment.tools) {
    const plan = planForTool(manifest.deployment, tool, { releaseRoot: repo });
    for (const { source } of plan) {
      if (!/\.(md|mjs)$/.test(source) || source === 'CHANGELOG.md') continue;
      const text = readFileSync(join(repo, source), 'utf8');
      assert.doesNotMatch(text, /specs\/[\w.-]+\//, `${source} must not point inside human-only records`);
    }
  }
  for (const source of ['AGENTS.md', 'agent/agent-definition.md']) {
    const text = readFileSync(join(repo, source), 'utf8');
    assert.match(text, /specs\/.*human-only/i);
    assert.match(text, /ask (the human|\{\{CLIENT_NAME\}\})/);
  }
});
