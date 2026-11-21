/** A client journey using a complete release checkout and only deployed commands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';
import { planForTool } from '../update/destination-resolver.mjs';
import { catalogName } from '../update/plugin-package.mjs';

const checkout = join(dirname(fileURLToPath(import.meta.url)), '..');
const other = tool => tool === 'codex' ? 'claude-code' : 'codex';
const skill = tool => tool === 'codex' ? '.agents/skills' : '.claude/skills';
const pkg = 'plugins/orion/skills';
const jobs = tool => tool === 'codex' ? 'agents' : '.claude/agents';
const read = (root, path) => readFileSync(join(root, path), 'utf8');
const put = (root, path, text) => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
};
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const run = (root, script, ...args) => spawnSync(process.execPath, [join(root, script), ...args], {
  cwd: root, encoding: 'utf8', env: plainEnv(),
});
/** Stand-in claude and codex CLIs (tests/helpers/fake-native.mjs) and a temp HOME. */
function fakeNative(base) {
  const bin = join(base, 'bin'), statePath = join(base, 'native.json'), home = join(base, 'home');
  mkdirSync(bin); mkdirSync(home);
  writeFileSync(statePath, '{}');
  const env = { FAKE_NATIVE_STATE: statePath, HOME: home, CODEX_HOME: join(home, '.codex') };
  for (const [name, envVar] of [['claude', 'ORION_CLAUDE_BIN'], ['codex', 'ORION_CODEX_BIN']]) {
    const file = join(bin, name);
    writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${join(checkout, 'tests/helpers/fake-native.mjs')}" ${name} "$@"\n`);
    chmodSync(file, 0o755);
    env[envVar] = file;
  }
  const edit = (change) => { const state = JSON.parse(readFileSync(statePath, 'utf8')); change(state); writeFileSync(statePath, JSON.stringify(state)); };
  const fullEnv = plainEnv(env);
  // What a person's install from Codex's Plugins Directory or /plugins leaves behind.
  const humanInstall = (root, catalog) => spawnSync(process.execPath, [join(checkout, 'tests/helpers/fake-native.mjs'), 'codex', 'plugin', '__human-install', catalog], { cwd: root, env: fullEnv, encoding: 'utf8' });
  return { env: fullEnv, edit, humanInstall };
}
const ok = result => assert.equal(result.status, 0, result.stdout + result.stderr);
const status = root => JSON.parse(read(root, 'status/status.json'));

function journey(t, tool) {
  const base = mkdtempSync(join(tmpdir(), 'orion-deployed-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const release = join(base, 'release');
  const client = join(base, 'client');
  git(base, 'clone', '-q', checkout, release);
  const changes = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: checkout });
  if (changes.length) {
    execFileSync('git', ['apply', '--binary', '-'], { cwd: release, input: changes });
  }
  const manifest = JSON.parse(read(checkout, 'update/manifest.json'));
  for (const { source } of planForTool(manifest.deployment, tool, { releaseRoot: checkout })) {
    if (!existsSync(join(release, source))) put(release, source, read(checkout, source));
  }
  if (git(release, 'status', '--porcelain')) {
    git(release, 'add', '-A');
    git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'working release');
  }
  ok(run(release, 'install.mjs', '--tool', tool, '--target', client, '--local-only'));
  return { release, client };
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} deployed journey: runtime commands, pinned update, and restore`, t => {
    const { release, client } = journey(t, tool);
    assert.equal(status(client).ai_assistant, tool);
    for (const forbidden of ['skills', 'tests', 'specs', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
      assert.equal(existsSync(join(client, forbidden)), false, `${forbidden} in client`);
    }

    put(client, `${jobs(tool)}/follow-up.md`, '---\nname: follow-up\ntools: Read\ngo_live: true\n---\n# Follow-up\n');
    ok(run(client, 'status/send.mjs', 'set-level', 'never', '--agent', 'follow-up'));
    assert.match(read(client, `${jobs(tool)}/follow-up.md`), /send_risk: never/);
    const shiftRecord = 'status/shifts/follow-up.json';
    const shiftHistory = JSON.stringify({ agent: 'follow-up', os: 'legacy-machine' });
    put(client, shiftRecord, shiftHistory);

    const original = read(client, 'AGENTS.md');
    const edited = read(client, `${pkg}/prospecting/SKILL.md`) + '\nClient note.\n';
    put(client, `${pkg}/prospecting/SKILL.md`, edited);
    put(client, `${skill(tool)}/hire-agent/SKILL.md`, 'Custom legacy instructions\n');
    put(client, `${skill(tool)}/personal/SKILL.md`, '# Personal skill\n');
    const retiredPage = 'library/workflows/prospect-research-outreach/PACKAGE.md';
    const editedPage = 'library/workflows/post-call-debrief/PACKAGE.md';
    const oldPage = git(release, 'show', `c933b9ff05ce5825f09a2ec2adc2d6d8e38b1e7a:${retiredPage}`) + '\n';
    put(client, retiredPage, oldPage);
    put(client, editedPage, '# Client debrief instructions\n');
    const retiredMeetingPackage = 'library/skills/meeting-sizing/PACKAGE.md';
    const oldMeetingPackage = git(release, 'show', `c933b9ff05ce5825f09a2ec2adc2d6d8e38b1e7a:${retiredMeetingPackage}`) + '\n';
    put(client, retiredMeetingPackage, oldMeetingPackage);
    const prior = status(client);
    const packageHistory = { 'post-call-debrief': { kind: 'workflow', version: '2.0.0', smoke_test_passed: true } };
    put(client, 'status/status.json', JSON.stringify({ ...prior, packages: packageHistory }));
    for (const slug of ['prospect-research-outreach', 'post-call-debrief']) {
      rmSync(join(client, pkg, slug, 'SKILL.md'));
    }
    const manifest = JSON.parse(read(release, 'update/manifest.json'));
    assert.equal(existsSync(join(client, '.specify')), false);
    manifest.deployment.entries.push({
      source: `${pkg}/new-release/SKILL.md`, ownership: 'release', fingerprint_key: `${pkg}/new-release/SKILL.md`,
    });
    put(release, 'update/manifest.json', JSON.stringify(manifest, null, 2));
    put(release, `${pkg}/new-release/SKILL.md`, '# New release skill\n');
    put(release, 'AGENTS.md', original + '\nRelease update.\n');
    git(release, 'add', '.');
    git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'next release');
    const pinned = git(release, 'rev-parse', 'HEAD');
    put(release, 'AGENTS.md', 'Uncommitted poison.\n');
    const result = run(client, 'update/apply.mjs', 'update', '--root', client, '--release-repo', release, '--commit', pinned);
    ok(result);
    const report = JSON.parse(result.stdout);
    assert.match(read(client, 'AGENTS.md'), /Release update\./);
    assert.doesNotMatch(read(client, 'AGENTS.md'), /Uncommitted poison/);
    // The package is replaced as a unit; the in-place edit is in the backup, not kept in place.
    assert.equal(read(client, `${pkg}/prospecting/SKILL.md`), read(release, `${pkg}/prospecting/SKILL.md`));
    assert.equal(read(client, `${report.backup}/package/${pkg}/prospecting/SKILL.md`), edited);
    assert.ok(report.package.edits_backed_up.includes(`${pkg}/prospecting/SKILL.md`));
    assert.equal(report.active, false, 'the target is not announced as active before discovery');
    assert.equal(status(client).plugin.pending_version, manifest.template_version);
    assert.equal(read(client, `${skill(tool)}/personal/SKILL.md`), '# Personal skill\n');
    assert.equal(read(client, `${pkg}/new-release/SKILL.md`), '# New release skill\n');
    assert.ok(report.retired.includes(retiredPage));
    assert.equal(read(client, shiftRecord), shiftHistory);
    assert.ok(report.retired.includes(retiredMeetingPackage));
    assert.equal(existsSync(join(client, 'library/skills')), false);
    assert.equal(read(client, `${report.backup}/files/${retiredMeetingPackage}`), oldMeetingPackage);
    assert.ok(report.kept.includes(editedPage));
    assert.equal(existsSync(join(client, retiredPage)), false);
    assert.equal(read(client, editedPage), '# Client debrief instructions\n');
    assert.equal(read(client, `${report.backup}/files/${retiredPage}`), oldPage);
    assert.deepEqual(status(client).packages, packageHistory);
    for (const slug of ['prospect-research-outreach', 'post-call-debrief']) {
      assert.ok(existsSync(join(client, pkg, slug, 'SKILL.md')), slug);
    }
    assert.equal(read(client, 'legacy/hire-agent/SKILL.md'), 'Custom legacy instructions\n');
    assert.equal(existsSync(join(client, `${skill(tool)}/hire-agent/SKILL.md`)), false);
    if (tool === 'claude-code') assert.match(read(client, 'legacy/claude-agents/follow-up.md'), /send_risk: never/);
    assert.equal(existsSync(join(client, '.specify')), false);
    for (const forbidden of ['skills', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
      assert.equal(existsSync(join(client, forbidden)), false, `${forbidden} after update`);
    }
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.equal(read(client, retiredMeetingPackage), oldMeetingPackage);
    assert.equal(read(client, 'AGENTS.md'), original);
    assert.equal(read(client, `${skill(tool)}/hire-agent/SKILL.md`), 'Custom legacy instructions\n');
    assert.equal(existsSync(join(client, `${pkg}/new-release/SKILL.md`)), false);
    assert.equal(read(client, `${pkg}/prospecting/SKILL.md`), edited);
    assert.equal(existsSync(join(client, pkg, 'post-call-debrief', 'SKILL.md')), false, 'the prior package comes back exactly');
    assert.equal(status(client).plugin.setup_state, 'pending', 'recovery waits for a fresh check');
  });

  test(`${tool} deployed journey: library install and interrupted tool switch`, t => {
    const { release, client } = journey(t, tool);
    const current = status(client);
    current.sharing = {
      status_signal_enabled: true,
      bridge_url: 'https://radio.test/api/bridge',
      harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
      install_token: 'orion_' + 'test'.repeat(6),
    };
    put(client, 'status/status.json', JSON.stringify(current));
    const mock = join(dirname(client), 'fetch.mjs');
    writeFileSync(mock, `globalThis.fetch = async (url) => {
      if (String(url).endsWith('/verify')) return Response.json({status: 'accepted', harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62'});
      if (String(url).endsWith('/assets')) return Response.json({asset_id: 'asset-1', reported_at: '2026-11-18T12:00:00.000Z', replay: false}, {status: 201});
      return new Response(JSON.stringify({
      slug: 'meeting-sizing', kind: 'skill', name: 'Meeting sizing',
      one_liner: 'Size meetings', family: 'value_building', tools_required: [],
      version: '1.0.0', content: '---\\nname: meeting-sizing\\n---\\nSize the meeting.\\n'
    }), {status: 200, headers: {'content-type': 'application/json'}}); };\n`);
    const installed = spawnSync(process.execPath, [
      '--import', pathToFileURL(mock).href, join(client, 'status/radio.mjs'),
      'library', '--install', 'meeting-sizing', '--yes',
    ], { cwd: client, encoding: 'utf8', env: plainEnv() });
    ok(installed);
    assert.match(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);

    put(client, `${jobs(tool)}/follow-up.md`, '---\nname: follow-up\ntools: Read\n---\n# Follow-up\n');
    const commit = git(release, 'rev-parse', 'HEAD');
    const native = fakeNative(dirname(client));
    const interrupted = spawnSync(process.execPath, [join(client, 'update/apply.mjs'),
      'switch', '--root', client, '--release-repo', release, '--commit', commit, '--to', other(tool),
    ], { cwd: client, encoding: 'utf8', env: { ...native.env, ORION_SWITCH_FAIL_AFTER: '1' } });
    assert.notEqual(interrupted.status, 0);
    assert.match(interrupted.stderr, /Injected switch interruption/);
    assert.equal(status(client).ai_assistant, tool);
    assert.equal(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`).includes('Size the meeting'), true);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);

    // Codex shows Orion installed for this folder only after the human's native install.
    const name = catalogName(status(client).plugin.catalog_identity);
    ok(native.humanInstall(client, name));
    const switched = spawnSync(process.execPath, [join(client, 'update/apply.mjs'), 'switch', '--root', client,
      '--release-repo', release, '--commit', commit, '--to', other(tool)], { cwd: client, encoding: 'utf8', env: native.env });
    ok(switched);
    const report = JSON.parse(switched.stdout);
    assert.equal(status(client).ai_assistant, other(tool));
    assert.equal(existsSync(join(client, '.specify')), false);
    assert.match(read(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(tool)}/meeting-sizing/SKILL.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(tool)}/follow-up.md`)), true);
    assert.equal(existsSync(join(client, `${jobs(other(tool))}/follow-up.md`)), false);
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.equal(status(client).ai_assistant, tool);
    assert.equal(existsSync(join(client, '.specify')), false);
    assert.match(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);
  });
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} update retires shipped Spec Kit files and keeps client edits`, t => {
    const { release, client } = journey(t, tool);
    const oldSkill = `${skill(tool)}/speckit-tasks/SKILL.md`;
    const editedSkill = `${skill(tool)}/speckit-plan/SKILL.md`;
    const historical = '77f8a99356ae52f5e9c71b00f78c7a29c1986461';
    put(client, oldSkill, git(release, 'show', `${historical}:skills/speckit-tasks/SKILL.md`) + '\n');
    put(client, '.specify/scripts/bash/setup-tasks.sh',
      git(release, 'show', `${historical}:.specify/scripts/bash/setup-tasks.sh`) + '\n');
    put(client, editedSkill, '# Client edited plan skill\n');
    put(client, '.specify/memory/constitution.md', '# Client constitution\n');
    const pinned = git(release, 'rev-parse', 'HEAD');
    const result = run(client, 'update/apply.mjs', 'update', '--root', client, '--release-repo', release, '--commit', pinned);
    ok(result);
    const report = JSON.parse(result.stdout);
    assert.equal(existsSync(join(client, oldSkill)), false);
    assert.equal(existsSync(join(client, '.specify/scripts/bash/setup-tasks.sh')), false);
    assert.equal(read(client, editedSkill), '# Client edited plan skill\n');
    assert.equal(read(client, '.specify/memory/constitution.md'), '# Client constitution\n');
    assert.ok(report.retired.includes(oldSkill));
    assert.ok(report.retired.includes('.specify/scripts/bash/setup-tasks.sh'));
    assert.ok(report.kept.includes(editedSkill));
    assert.equal(existsSync(join(client, 'update/scaffold')), false);
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.ok(existsSync(join(client, oldSkill)));
    assert.ok(existsSync(join(client, '.specify/scripts/bash/setup-tasks.sh')));
  });
}
