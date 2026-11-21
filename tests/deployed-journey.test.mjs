/** A client journey using a complete release checkout and only deployed commands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';
import { planForTool } from '../update/destination-resolver.mjs';

const checkout = join(dirname(fileURLToPath(import.meta.url)), '..');
const other = tool => tool === 'codex' ? 'claude-code' : 'codex';
const skill = tool => tool === 'codex' ? '.agents/skills' : '.claude/skills';
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
    const edited = read(client, `${skill(tool)}/prospecting/SKILL.md`) + '\nClient note.\n';
    put(client, `${skill(tool)}/prospecting/SKILL.md`, edited);
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
    const retiredDisclosure = 'docs/intelligence-library-opt-in.md';
    const oldDisclosure = git(release, 'show', `5eb0eaa23679caede3a1f7bbae722df8b7ce433e:${retiredDisclosure}`) + '\n';
    put(client, retiredDisclosure, oldDisclosure);
    const prior = status(client);
    const packageHistory = { 'post-call-debrief': { kind: 'workflow', version: '2.0.0', smoke_test_passed: true } };
    put(client, 'status/status.json', JSON.stringify({ ...prior, packages: packageHistory, sharing: { ...prior.sharing} }));
    for (const slug of ['prospect-research-outreach', 'post-call-debrief']) {
      rmSync(join(client, skill(tool), slug, 'SKILL.md'));
    }
    const manifest = JSON.parse(read(release, 'update/manifest.json'));
    assert.equal(existsSync(join(client, '.specify')), false);
    manifest.deployment.entries.push({
      source: 'skills/new-release/SKILL.md',
      destinations: { 'claude-code': '.claude/skills/new-release/SKILL.md', codex: '.agents/skills/new-release/SKILL.md' },
      ownership: 'release', fingerprint_key: 'skills/new-release/SKILL.md',
    });
    put(release, 'update/manifest.json', JSON.stringify(manifest, null, 2));
    put(release, 'skills/new-release/SKILL.md', '# New release skill\n');
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
    assert.equal(read(client, `${skill(tool)}/prospecting/SKILL.md`), edited);
    assert.equal(read(client, `${skill(tool)}/personal/SKILL.md`), '# Personal skill\n');
    assert.equal(read(client, `${skill(tool)}/new-release/SKILL.md`), '# New release skill\n');
    assert.ok(report.kept.includes(`${skill(tool)}/prospecting/SKILL.md`));
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
    assert.ok(report.retired.includes(retiredDisclosure));
    assert.equal(existsSync(join(client, retiredDisclosure)), false);
    assert.equal(read(client, `${report.backup}/files/${retiredDisclosure}`), oldDisclosure);
    for (const slug of ['prospect-research-outreach', 'post-call-debrief']) {
      assert.ok(report.added.includes(`${skill(tool)}/${slug}/SKILL.md`));
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
    assert.equal(read(client, retiredDisclosure), oldDisclosure);
    assert.equal(read(client, 'AGENTS.md'), original);
    assert.equal(read(client, `${skill(tool)}/hire-agent/SKILL.md`), 'Custom legacy instructions\n');
    assert.equal(existsSync(join(client, `${skill(tool)}/new-release/SKILL.md`)), false);
    assert.equal(read(client, `${skill(tool)}/prospecting/SKILL.md`), edited);
  });

  test(`${tool} deployed journey: local skill and interrupted tool switch`, t => {
    const { release, client } = journey(t, tool);
    put(client, `${skill(tool)}/meeting-sizing/SKILL.md`, '# Meeting sizing\nSize the meeting.\n');
    put(client, `${jobs(tool)}/follow-up.md`, '---\nname: follow-up\ntools: Read\n---\n# Follow-up\n');
    const switched = run(client, 'switch_ai.mjs', '--json');
    ok(switched);
    const report = JSON.parse(switched.stdout);
    assert.equal(report.to, other(tool));
    assert.equal(status(client).ai_assistant, other(tool));
    assert.equal(existsSync(join(client, '.specify')), false);
    assert.match(read(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(tool)}/meeting-sizing/SKILL.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(tool)}/follow-up.md`)), true);
    assert.equal(existsSync(join(client, `${jobs(other(tool))}/follow-up.md`)), false);
    ok(run(client, 'switch_ai.mjs'));
    assert.equal(status(client).ai_assistant, tool);
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
