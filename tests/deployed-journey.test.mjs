/** A client journey using a complete release checkout and only deployed commands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';

const checkout = join(dirname(fileURLToPath(import.meta.url)), '..');
const other = tool => tool === 'codex' ? 'claude-code' : 'codex';
const skill = tool => tool === 'codex' ? '.agents/skills' : '.claude/skills';
const jobs = tool => tool === 'codex' ? 'team' : '.claude/agents';
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
  ok(run(release, 'install.mjs', '--tool', tool, '--target', client));
  return { release, client };
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} deployed journey: runtime commands, pinned update, and restore`, t => {
    const { release, client } = journey(t, tool);
    assert.equal(status(client).selected_tool, tool);
    for (const forbidden of ['skills', 'agents', 'tests', 'specs', tool === 'codex' ? '.claude' : '.agents']) {
      assert.equal(existsSync(join(client, forbidden)), false, `${forbidden} in client`);
    }

    put(client, `${jobs(tool)}/follow-up.md`, '---\nname: follow-up\ntools: Read\ngo_live: true\n---\n# Follow-up\n');
    ok(run(client, 'status/send.mjs', 'set-level', 'never', '--agent', 'follow-up'));
    assert.match(read(client, `${jobs(tool)}/follow-up.md`), /send_risk: never/);
    const wrong = run(client, 'status/schedule.mjs', 'wire', '--agent', 'follow-up', '--surface', other(tool), '--at', '07:00', '--bin', process.execPath);
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stdout, /must match status.selected_tool/);
    assert.equal(existsSync(join(client, 'status/shifts/follow-up.json')), false);
    const wired = run(client, 'status/schedule.mjs', 'wire', '--agent', 'follow-up', '--surface', tool, '--at', '07:00', '--bin', process.execPath);
    ok(wired);
    const wake = JSON.parse(read(client, 'status/shifts/follow-up.json'));
    assert.match(readFileSync(wake.wake_up, 'utf8'), new RegExp(`${jobs(tool).replaceAll('.', '\\.')}/follow-up`));

    const original = read(client, 'AGENTS.md');
    const edited = read(client, `${skill(tool)}/hire-agent/SKILL.md`) + '\nClient note.\n';
    put(client, `${skill(tool)}/hire-agent/SKILL.md`, edited);
    put(client, `${skill(tool)}/personal/SKILL.md`, '# Personal skill\n');
    const manifest = JSON.parse(read(release, 'update/manifest.json'));
    manifest.deployment.entries = manifest.deployment.entries.filter(e => e.source !== 'skills/create-skill/SKILL.md');
    manifest.deployment.retired.push({
      source: 'skills/create-skill/SKILL.md',
      destinations: { 'claude-code': '.claude/skills/create-skill/SKILL.md', codex: '.agents/skills/create-skill/SKILL.md' },
      fingerprint_key: 'skills/create-skill/SKILL.md',
    });
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
    assert.equal(read(client, `${skill(tool)}/hire-agent/SKILL.md`), edited);
    assert.equal(read(client, `${skill(tool)}/personal/SKILL.md`), '# Personal skill\n');
    assert.equal(read(client, `${skill(tool)}/new-release/SKILL.md`), '# New release skill\n');
    assert.equal(existsSync(join(client, `${skill(tool)}/create-skill/SKILL.md`)), false);
    assert.ok(report.kept.includes(`${skill(tool)}/hire-agent/SKILL.md`));
    assert.ok(report.retired.includes(`${skill(tool)}/create-skill/SKILL.md`));
    for (const forbidden of ['skills', 'agents', tool === 'codex' ? '.claude' : '.agents']) {
      assert.equal(existsSync(join(client, forbidden)), false, `${forbidden} after update`);
    }
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.equal(read(client, 'AGENTS.md'), original);
    assert.equal(existsSync(join(client, `${skill(tool)}/new-release/SKILL.md`)), false);
    assert.equal(existsSync(join(client, `${skill(tool)}/create-skill/SKILL.md`)), true);
    assert.equal(read(client, `${skill(tool)}/hire-agent/SKILL.md`), edited);
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
    writeFileSync(mock, `globalThis.fetch = async () => new Response(JSON.stringify({
      slug: 'meeting-sizing', kind: 'skill', name: 'Meeting sizing',
      one_liner: 'Size meetings', family: 'value_building', tools_required: [],
      version: '1.0.0', content: '---\\nname: meeting-sizing\\n---\\nSize the meeting.\\n'
    }), {status: 200, headers: {'content-type': 'application/json'}});\n`);
    const installed = spawnSync(process.execPath, [
      '--import', pathToFileURL(mock).href, join(client, 'status/radio.mjs'),
      'library', '--install', 'meeting-sizing', '--yes',
    ], { cwd: client, encoding: 'utf8', env: plainEnv() });
    ok(installed);
    assert.match(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);

    put(client, `${jobs(tool)}/follow-up.md`, '---\nname: follow-up\ntools: Read\n---\n# Follow-up\n');
    const commit = git(release, 'rev-parse', 'HEAD');
    const interrupted = spawnSync(process.execPath, [join(client, 'update/apply.mjs'),
      'switch', '--root', client, '--release-repo', release, '--commit', commit, '--to', other(tool),
    ], { cwd: client, encoding: 'utf8', env: plainEnv({ ORION_SWITCH_FAIL_AFTER: '1' }) });
    assert.notEqual(interrupted.status, 0);
    assert.match(interrupted.stderr, /Injected switch interruption/);
    assert.equal(status(client).selected_tool, tool);
    assert.equal(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`).includes('Size the meeting'), true);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);

    const switched = run(client, 'update/apply.mjs', 'switch', '--root', client,
      '--release-repo', release, '--commit', commit, '--to', other(tool));
    ok(switched);
    const report = JSON.parse(switched.stdout);
    assert.equal(status(client).selected_tool, other(tool));
    assert.match(read(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(tool)}/meeting-sizing/SKILL.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(tool)}/follow-up.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(other(tool))}/follow-up.md`)), true);
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.equal(status(client).selected_tool, tool);
    assert.match(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);
  });
}
