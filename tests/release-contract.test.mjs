import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    for (const path of ['status/guard.mjs', 'status/store.mjs', 'status/report.mjs', 'agent/install.md', 'agent/reinstall-from-1.x.md']) {
      assert.ok(destinations.includes(path), `${path} must reach an installed ${tool} folder`);
    }
    for (const path of ['agent/agent-definition.md', 'docs/setup.md', 'agent/adapters/claude.md']) {
      assert.ok(!destinations.includes(path), `${path} was retired in 2.0.0`);
    }
    assert.ok(!destinations.some(path => path.startsWith('.specify/')), 'maintainer governance stays in the release');
    assert.ok(!destinations.includes('agent/maintaining.md'), 'the maintainer route stays out of client folders');
    assert.ok(!destinations.some(path => path.startsWith('docs/')), 'fresh installs use agent/ for guidance');
    assert.ok(!destinations.some(path => path.startsWith('img/')), 'screenshots stay repository-only');
    assert.ok(!plan.entries.some(entry => [entry.source, entry.destination].some(path => path.split('/').includes('specs'))), 'human-only records stay out of every deployment');
    const skills = 'plugins/orion/skills';
    for (const name of ['prospecting', 'call-planner', 'friday-report']) {
      assert.ok(destinations.includes(`${skills}/${name}/SKILL.md`));
    }
    assert.ok(destinations.includes(`${skills}/call-planner/scripts/build-call-plan.mjs`));
    assert.ok(destinations.includes(`${skills}/call-planner/assets/call-data.template.json`));
    assert.ok(!destinations.includes(`${skills}/hire-agent/SKILL.md`));
    assert.ok(!destinations.some(path => path.startsWith('agents/') || path.startsWith('.claude/') || path.startsWith('.agents/')));
  }
  const prospecting = 'plugins/orion/skills/prospecting/SKILL.md';
  rmSync(join(release, prospecting));
  const missing = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /plugins\/orion\/ exactly once|missing release source/i);
  copyFileSync(join(repo, prospecting), join(release, prospecting));
  mkdirSync(join(release, 'plugins/orion/skills/unmapped'), { recursive: true });
  copyFileSync(join(repo, prospecting), join(release, 'plugins/orion/skills/unmapped/SKILL.md'));
  const unmapped = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'codex'], { encoding: 'utf8' });
  assert.notEqual(unmapped.status, 0);
  assert.match(unmapped.stderr, /plugins\/orion\/ exactly once/i);
  rmSync(join(release, 'plugins/orion/skills/unmapped'), { recursive: true });
  manifest.deployment.entries.push(manifest.deployment.entries.find(entry => entry.source === prospecting));
  writeFileSync(join(release, 'update/manifest.json'), JSON.stringify(manifest));
  const duplicate = spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), '--tool', 'claude-code'], { encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /plugins\/orion\/ exactly once/i);
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

test('release contract ships shared package files and only the selected manifest', () => {
  assert.equal(existsSync(join(repo, 'skills')), false, 'the package is the one maintained skill source');
  const sources = readdirSync(join(repo, 'plugins/orion'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(repo, join(entry.parentPath, entry.name)).split(sep).join('/'));
  for (const name of ['create-skill', 'update-harness', 'call-planner', 'report-bug']) {
    assert.ok(sources.includes(`plugins/orion/skills/${name}/SKILL.md`), `${name} moved into the package`);
  }
  assert.ok(sources.includes('plugins/orion/skills/call-planner/scripts/build-call-plan.mjs'));
  assert.ok(sources.includes('plugins/orion/skills/report-bug/agents/openai.yaml'));
  for (const tool of ['codex', 'claude-code']) {
    const run = spawnSync(process.execPath, [join(repo, 'update/release-contract.mjs'), '--tool', tool], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const plan = JSON.parse(run.stdout);
    for (const source of sources) {
      const omitted = tool === 'codex' ? 'plugins/orion/.claude-plugin/plugin.json' : 'plugins/orion/plugin.json';
      assert.deepEqual(plan.entries.filter(entry => entry.source === source).map(entry => entry.destination), source === omitted ? [] : [source], `package file: ${source}`);
    }
    assert.ok(!plan.entries.some(entry => /^\.(claude|agents)\/skills\//.test(entry.destination)), 'client skill folders hold no shipped files');
  }
});

test('relative links in the package resolve to package files, never escape to the harness', () => {
  const packageRoot = join(repo, 'plugins/orion');
  const docs = readdirSync(packageRoot, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join(entry.parentPath, entry.name));
  for (const doc of docs) {
    for (const [, target] of readFileSync(doc, 'utf8').matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      const resolved = join(dirname(doc), target);
      const where = `${relative(repo, doc)} -> ${target}`;
      assert.ok(!relative(packageRoot, resolved).startsWith('..'), `${where} escapes the package`);
      assert.ok(existsSync(resolved), `${where} is missing`);
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
  for (const file of ['README.md', 'AGENTS.md', 'agent/adapters/chatgpt.md', 'agent/adapters/claude-web.md', 'agent/adapters/copilot.md']) {
    const text = readFileSync(join(repo, file), 'utf8');
    assert.match(text, /Codex.*Claude Code|Claude Code.*Codex/s, `${file} names the supported tools`);
    assert.match(text, /website|paste-only/i, `${file} explains the unsupported surface`);
    assert.match(text, /agent\/install\.md|install\.md/, `${file} points at executable setup and recovery`);
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
  const text = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
  assert.match(text, /specs\/.*human-only/i);
  assert.match(text, /ask the human/);
});

/**
 * A synthetic release candidate: exactly the files the release contract reads,
 * CHANGELOG.md as it is in this checkout. `tagged` makes it a candidate being
 * tagged, for `--version` runs: its CHANGELOG opens with its own version.
 */
function candidate(t, { tagged = false } = {}) {
  const release = mkdtempSync(join(tmpdir(), 'orion-release-candidate-'));
  t.after(() => rmSync(release, { recursive: true, force: true }));
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  for (const path of ['update/manifest.json', 'update/release-contract.mjs',
    ...manifest.deployment.common_sources,
    ...manifest.deployment.entries.flatMap((entry) => [entry.source, ...Object.values(entry.sources || {})])]) {
    mkdirSync(dirname(join(release, path)), { recursive: true });
    copyFileSync(join(repo, path), join(release, path));
  }
  const version = manifest.template_version;
  if (tagged) {
    const log = readFileSync(join(release, 'CHANGELOG.md'), 'utf8');
    writeFileSync(join(release, 'CHANGELOG.md'), log.replace(/^## /m, `## ${version} — candidate\n\n## `));
  }
  return { release, version };
}
const contract = (release, ...args) => spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), ...args], { encoding: 'utf8' });

test('release contract passes both tools at the candidate version and refuses any other version', (t) => {
  const { release, version } = candidate(t, { tagged: true });
  for (const tool of ['codex', 'claude-code']) {
    const run = contract(release, '--tool', tool, '--version', version);
    assert.equal(run.status, 0, run.stderr);
    const wrong = contract(release, '--tool', tool, '--version', '0.0.1');
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, new RegExp(`${tool}.*0\\.0\\.1.*${version.replaceAll('.', '\\.')}`, 's'));
  }
  assert.notEqual(contract(release, '--tool', 'codex', '--version', 'v1').status, 0, 'a malformed version is refused');
});

test('release preparation fails when one tool’s packaging is broken in the candidate', (t) => {
  const { release, version } = candidate(t, { tagged: true });
  const claudeManifest = join(release, 'plugins/orion/.claude-plugin/plugin.json');
  writeFileSync(claudeManifest, JSON.stringify({ name: 'claude-orion', version, description: 'x' }));
  const broken = contract(release, '--tool', 'claude-code', '--version', version);
  assert.notEqual(broken.status, 0);
  assert.match(broken.stderr, /claude-code/);
  assert.match(broken.stderr, /\.claude-plugin\/plugin\.json/);
  copyFileSync(join(repo, 'plugins/orion/.claude-plugin/plugin.json'), claudeManifest);
  assert.equal(contract(release, '--tool', 'claude-code', '--version', version).status, 0);

  // Manifests generated from a different version than the candidate's are stale.
  const manifest = JSON.parse(readFileSync(join(release, 'update/manifest.json'), 'utf8'));
  manifest.template_version = '99.0.0';
  writeFileSync(join(release, 'update/manifest.json'), JSON.stringify(manifest));
  const stale = contract(release, '--tool', 'codex');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /codex/);
  assert.match(stale.stderr, /stale|99\.0\.0/i);
});

test('release contract refuses a package carrying client credentials or business state', (t) => {
  const { release, version } = candidate(t, { tagged: true });
  for (const path of ['plugins/orion/status/status.json', 'plugins/orion/skills/prospecting/radio.key', 'plugins/orion/.env']) {
    mkdirSync(dirname(join(release, path)), { recursive: true });
    writeFileSync(join(release, path), '{}');
    const run = contract(release, '--tool', 'codex', '--version', version);
    assert.notEqual(run.status, 0, `${path} must block the release`);
    assert.match(run.stderr, new RegExp(path.replaceAll('.', '\\.')));
    rmSync(join(release, path));
  }
  assert.equal(contract(release, '--tool', 'codex', '--version', version).status, 0);
});

test('the release workflow runs the full contract for both tools at the tag version before tagging', () => {
  const workflow = readFileSync(join(repo, '.github/workflows/release.yml'), 'utf8');
  const validate = workflow.indexOf('node update/release-contract.mjs --tool "$tool" --version "$VERSION"');
  assert.ok(validate > 0, 'the contract checks the tag version');
  assert.match(workflow, /for tool in codex claude-code/);
  const tests = workflow.indexOf('node --test');
  assert.ok(tests > 0, 'the candidate’s own tests run');
  const tag = workflow.indexOf('git tag -a');
  assert.ok(validate < tag && tests < tag, 'validation happens before the tag is pushed');
});

test('a pull request runs the release contract on the CHANGELOG as committed', (t) => {
  const { release, version } = candidate(t);
  const committed = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
  assert.equal(readFileSync(join(release, 'CHANGELOG.md'), 'utf8'), committed, 'the candidate CHANGELOG is the real one');
  for (const tool of ['codex', 'claude-code']) {
    const run = contract(release, '--tool', tool);
    assert.equal(run.status, 0, `${tool}: ${run.stderr}`);
  }
  // A hand-added numbered section ahead of the manifest fails the pull request's tests.
  const [major, minor, patch] = version.split('.').map(Number);
  const ahead = `${major}.${minor}.${patch + 1}`;
  writeFileSync(join(release, 'CHANGELOG.md'), committed.replace(/^## /m, `## ${ahead} — 2026-12-01\n\n- by hand\n\n## `));
  for (const tool of ['codex', 'claude-code']) {
    const run = contract(release, '--tool', tool);
    assert.notEqual(run.status, 0, `${tool}: a CHANGELOG ahead of template_version must fail`);
    assert.match(run.stderr, new RegExp(`CHANGELOG\\.md.*${ahead.replaceAll('.', '\\.')}.*${version.replaceAll('.', '\\.')}`, 's'));
  }
});

test('release contract fails when CHANGELOG.md is missing', (t) => {
  const { release, version } = candidate(t);
  rmSync(join(release, 'CHANGELOG.md'));
  for (const tool of ['codex', 'claude-code']) {
    const run = contract(release, '--tool', tool);
    assert.notEqual(run.status, 0, `${tool}: a missing CHANGELOG.md must fail`);
    assert.match(run.stderr, /CHANGELOG\.md/);
    assert.match(run.stderr, new RegExp(version.replaceAll('.', '\\.')));
  }
});

const changelog = (release, text) => writeFileSync(join(release, 'CHANGELOG.md'), `# Changelog\n\n${text}`);

test('release contract fails when the newest numbered CHANGELOG section is not the candidate version', (t) => {
  const { release, version } = candidate(t);
  changelog(release, '## Unreleased — next\n\n- a\n\n## 1.9.9 — 2026-01-01\n\n- b\n');
  const run = contract(release, '--tool', 'codex');
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /CHANGELOG\.md/);
  assert.match(run.stderr, /1\.9\.9/);
  assert.match(run.stderr, new RegExp(version.replaceAll('.', '\\.')));
});

test('release contract accepts Unreleased sections above the candidate version, or no numbered section at all', (t) => {
  const { release, version } = candidate(t);
  changelog(release, `## Unreleased — next\n\n- a\n\n## Unreleased — other\n\n- b\n\n## ${version} — 2026-11-12\n\n- c\n\n## 1.0.0\n`);
  assert.equal(contract(release, '--tool', 'codex').status, 0, 'Unreleased above the matching section');
  changelog(release, '## Unreleased — first\n\n- a\n');
  assert.equal(contract(release, '--tool', 'codex').status, 0, 'no numbered section yet');
});

test('releasing a version requires the CHANGELOG to open with that version', (t) => {
  const { release, version } = candidate(t);
  changelog(release, `## Unreleased — next\n\n- a\n\n## ${version} — 2026-11-12\n\n- c\n`);
  const run = contract(release, '--tool', 'codex', '--version', version);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /CHANGELOG\.md/);
  assert.match(run.stderr, new RegExp(version.replaceAll('.', '\\.')));
  changelog(release, `## ${version} — 2026-11-12\n\n- c\n`);
  assert.equal(contract(release, '--tool', 'codex', '--version', version).status, 0);
});
