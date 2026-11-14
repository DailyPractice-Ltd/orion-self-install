/** A client journey using a complete release checkout and only deployed commands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';

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
    git(release, 'add', '-A');
    git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'working release');
  }
  ok(run(release, 'install.mjs', '--tool', tool, '--target', client, '--local-only'));
  return { release, client };
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} deployed journey: runtime commands, pinned update, and restore`, t => {
    const { release, client } = journey(t, tool);
    assert.equal(status(client).selected_tool, tool);
    for (const forbidden of ['skills', 'tests', 'specs', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
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
    assert.equal(read(client, `${skill(tool)}/hire-agent/SKILL.md`), edited);
    assert.equal(read(client, `${skill(tool)}/personal/SKILL.md`), '# Personal skill\n');
    assert.equal(read(client, `${skill(tool)}/new-release/SKILL.md`), '# New release skill\n');
    assert.ok(report.kept.includes(`${skill(tool)}/hire-agent/SKILL.md`));
    assert.equal(existsSync(join(client, '.specify')), false);
    for (const forbidden of ['skills', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
      assert.equal(existsSync(join(client, forbidden)), false, `${forbidden} after update`);
    }
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.equal(read(client, 'AGENTS.md'), original);
    assert.equal(existsSync(join(client, `${skill(tool)}/new-release/SKILL.md`)), false);
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
    assert.equal(existsSync(join(client, '.specify')), false);
    assert.match(read(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(tool)}/meeting-sizing/SKILL.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(tool)}/follow-up.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(other(tool))}/follow-up.md`)), true);
    ok(run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.equal(status(client).selected_tool, tool);
    assert.equal(existsSync(join(client, '.specify')), false);
    assert.match(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);
  });
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} update retires shipped Spec Kit files and keeps client edits`, t => {
    const base = mkdtempSync(join(tmpdir(), 'orion-retire-speckit-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const release = join(base, 'release');
    const client = join(base, 'client');
    git(base, 'clone', '-q', checkout, release);
    // Use the actual last release tree containing Spec Kit, independent of HEAD.
    const candidate = git(release, 'rev-parse', 'HEAD');
    git(release, 'checkout', '-q', '77f8a99356ae52f5e9c71b00f78c7a29c1986461');
    ok(run(release, 'install.mjs', '--tool', tool, '--target', client, '--local-only'));
    const oldSkill = `${skill(tool)}/speckit-tasks/SKILL.md`;
    const editedSkill = `${skill(tool)}/speckit-plan/SKILL.md`;
    assert.ok(existsSync(join(client, oldSkill)));
    assert.ok(existsSync(join(client, '.specify/scripts/bash/setup-tasks.sh')));
    put(client, editedSkill, '# Client edited plan skill\n');
    put(client, '.specify/memory/constitution.md', '# Client constitution\n');

    git(release, 'checkout', '-q', candidate);
    const changes = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: checkout });
    if (changes.length) {
      execFileSync('git', ['apply', '--binary', '-'], { cwd: release, input: changes });
      git(release, 'add', '-A');
      git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'without Spec Kit');
    }
    const pinned = git(release, 'rev-parse', 'HEAD');
    const result = run(release, 'update/apply.mjs', 'update', '--root', client, '--release-repo', release, '--commit', pinned);
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

async function publishedUpdateJourney(t, tool, { customizeCandidate, legacy, damageUpdater } = {}) {
  const { release, client } = journey(t, tool);
  const current = status(client);
  const state = { listed: [2, 1, 3], identityChanged: false };
  const publication = (id) => ({
    id: id === 2 && state.replacementId ? state.replacementId : id, tag_name: { 1: 'v2.0.0', 2: 'v2.10.0', 3: 'v9.0.0' }[id],
    draft: id === 3, prerelease: false, published_at: id === 1 ? '2026-12-01' : '2026-01-01',
  });
  const url = 'https://fixture.test/api/bridge';
  const token = 'orion_' + 'test'.repeat(6);
  const responseFile = join(dirname(client), 'responses.json');
  const mock = join(dirname(client), 'fetch.mjs');
  const terminal = join(dirname(client), 'terminal.mjs');
  put(dirname(client), 'terminal.mjs', `
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true });
  `);
  put(dirname(client), 'fetch.mjs', `
    import assert from 'node:assert/strict';
    import { readFileSync, writeFileSync } from 'node:fs';
    globalThis.fetch = async (url, init) => {
      const file = ${JSON.stringify(responseFile)};
      const state = JSON.parse(readFileSync(file));
      const { releases, withdrawn, identityChanged, pairingRejected, pairingUnavailable, publishAfterPair } = state;
      const path = new URL(url).pathname;
      let body;
      if (path.endsWith('/releases')) body = releases;
      else if (path.includes('/releases/')) {
        body = releases.find(item => item.id === Number(path.split('/').at(-1)));
        if (withdrawn) body.body = '<!-- orion:withdrawn -->';
        if (identityChanged) body.id = 123;
      } else if (path === '/api/bridge/pair') {
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body), { code: 'BCDFGHJKLMNP' });
        if (pairingRejected) return Response.json({ error: 'Expired' }, { status: 404 });
        body = {
          install_token: '${token}',
          harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
          bridge_url: '${url}',
        };
      } else {
        assert.equal(path, '/api/bridge/library');
        assert.equal(init.method ?? 'GET', 'GET');
        assert.equal(init.headers.Authorization, 'Bearer ${token}');
        if (pairingUnavailable) return Response.json({ error: 'Unavailable' }, { status: 503 });
        if (publishAfterPair) writeFileSync(file, JSON.stringify({ ...state, releases: publishAfterPair, publishAfterPair: null }));
        body = { assets: [] };
      }
      return Response.json(body);
    };
  `);
  const originalCommit = git(release, 'rev-parse', 'HEAD');
  git(release, 'tag', '-f', 'v2.0.0', originalCommit);
  current.applied_release = {
    tag: 'v2.0.0', commit: originalCommit, release_id: 1,
    manifest_version: '2.0.0', applied_at: '2026-01-01T00:00:00.000Z',
  };
  current.sharing = {
    status_signal_enabled: true, radio_choice: 'accepted',
    install_token: token, bridge_url: url, harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
  };
  put(client, 'status/status.json', JSON.stringify(current));
  const manifest = JSON.parse(read(release, 'update/manifest.json'));
  manifest.template_version = '2.10.0';
  manifest.update_compatibility = [{
    from_version: '2.0.0', tool, steps: [], required_destinations: ['update/apply.mjs'],
    checks: [{ kind: 'deployed-layout' }, { kind: 'node-syntax', path: 'update/apply.mjs' }],
  }];
  const newSkill = `${skill(tool)}/next/SKILL.md`;
  const edit = `${skill(tool)}/hire-agent/SKILL.md`;
  put(client, edit, '# Client-edited skill\n');
  manifest.deployment.entries.push({
    source: 'skills/next/SKILL.md', ownership: 'release', fingerprint_key: 'skills/next/SKILL.md',
    destinations: { codex: '.agents/skills/next/SKILL.md', 'claude-code': '.claude/skills/next/SKILL.md' },
  });
  put(release, 'skills/next/SKILL.md', '# Next release skill\n');
  put(release, 'skills/hire-agent/SKILL.md', '# Changed upstream\n');
  customizeCandidate?.({ release, client, manifest, current });
  if (damageUpdater) {
    const script = read(release, 'update/apply.mjs');
    put(release, 'update/apply.mjs', `if (process.argv[1] === ${JSON.stringify(join(client, 'update/apply.mjs'))}) throw new Error('Damaged deployed updater');\n${script}`);
  }
  put(release, 'update/manifest.json', JSON.stringify(manifest));
  git(release, 'add', '.');
  git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'candidate');
  const commit = git(release, 'rev-parse', 'HEAD');
  git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'tag', '-a', 'v2.10.0', '-m', 'published');
  put(release, 'skills/next/SKILL.md', 'Unpublished branch bytes\n');
  git(release, 'add', '.');
  git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'after publication');

  let launcher = 'update/request.mjs';
  if (legacy) {
    // Freeze the historical bytes independently of the candidate and run its
    // published-update launcher from the old harness, which predates request.mjs.
    rmSync(client, { recursive: true });
    mkdirSync(client);
    const archive = execFileSync('git', ['archive', 'v1.5.0'], { cwd: release, maxBuffer: 32 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-'], { cwd: client, input: archive, env: plainEnv({ LC_ALL: 'C' }) });
    const old = JSON.parse(read(client, 'status/status.schema-template.json'));
    old.sharing = current.sharing;
    old.business_name = 'Original client';
    old.checklist.n8n_wf01_imported = true;
    put(client, 'status/status.json', JSON.stringify(old));
    put(client, '.claude/agents/follow-up.md', 'Hired job sheet\n');
    put(client, 'agent/knowledge-base/01-business-context.md', 'Personal business context\n');
    put(client, 'AGENTS.md', 'Personal agent instructions\n');
    launcher = join(checkout, 'update/request.mjs');
  }
  const execute = (args, env = {}, answers) => new Promise((resolve, reject) => {
    writeFileSync(responseFile, JSON.stringify({
      ...state,
      releases: state.listed.map(publication),
      publishAfterPair: state.publishAfterPair?.map(publication),
    }));
    const preloads = ['--import', pathToFileURL(mock).href];
    if (answers) preloads.push('--import', pathToFileURL(terminal).href);
    const p = spawn(process.execPath, [...preloads, ...args, '--repository', 'fixture/orion',
      '--api-base', url, '--source-url', release], { cwd: client, env: plainEnv({ ORION_BRIDGE_URL: url, ...env }) });
    let stdout = '', stderr = '';
    p.stdout.on('data', data => { stdout += data; });
    p.stderr.on('data', data => {
      stderr += data;
      const next = answers?.[0];
      if (next && stderr.includes(next[0])) {
        p.stdin.write(answers.shift()[1] + '\n');
        if (answers.length === 0) p.stdin.end();
      }
    });
    p.on('error', reject);
    p.on('close', code => resolve({ code, stdout, stderr }));
  });
  const request = (env, args = [], answers) => execute([launcher, ...args], env, answers);
  return { client, release, state, request, execute, commit, newSkill, edit, token };
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} client requests the latest published update and applies it only once`, async t => {
    const f = await publishedUpdateJourney(t, tool);
    const result = await f.request();
    assert.equal(result.code, 0, result.stderr);
    assert.equal(read(f.client, f.newSkill), '# Next release skill\n');
    assert.equal(read(f.client, f.edit), '# Client-edited skill\n');
    assert.equal(status(f.client).selected_tool, tool);
    const applied = status(f.client).applied_release;
    assert.deepEqual({ ...applied, applied_at: 'TIME' }, {
      tag: 'v2.10.0', commit: f.commit, release_id: 2, manifest_version: '2.10.0', applied_at: 'TIME',
    });
    assert.ok(Date.parse(applied.applied_at));
    const again = await f.request();
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /already applied/i);
    assert.deepEqual(status(f.client).applied_release, applied);
    f.state.listed = [1];
    const downgrade = await f.request();
    assert.notEqual(downgrade.code, 0);
    assert.match(downgrade.stderr, /downgrade/i);
    assert.deepEqual(status(f.client).applied_release, applied);
  });
}

test('a radio-off client can decline or fail pairing without changing the deployed harness', async t => {
  const f = await publishedUpdateJourney(t, 'codex');
  const current = status(f.client);
  current.sharing = { status_signal_enabled: false, radio_choice: 'declined' };
  put(f.client, 'status/status.json', JSON.stringify(current));
  const before = read(f.client, 'status/status.json');
  const code = 'BCDF-GHJK-LMNP';
  const env = { ORION_PAIRING_CODE: code };
  const paused = await f.request(env);
  assert.notEqual(paused.code, 0);
  assert.match(paused.stderr, /update paused.*radio/i);
  assert.match(paused.stderr, /--pair-radio/);
  assert.ok(!paused.stderr.includes(code));

  const declined = await f.request({ ORION_PAIRING_CODE: '' }, [], [
    ['Turn on check-ins and continue your update?', 'no'],
  ]);
  assert.notEqual(declined.code, 0);
  assert.match(declined.stderr, /radio choice was kept/);
  assert.equal(read(f.client, 'status/status.json'), before);

  for (const problem of ['pairingRejected', 'pairingUnavailable']) {
    f.state[problem] = true;
    const failed = await f.request(env, ['--pair-radio']);
    assert.notEqual(failed.code, 0);
    assert.match(failed.stderr, /pairing.*failed/i);
    assert.ok(!(failed.stdout + failed.stderr).includes(code));
    assert.equal(read(f.client, 'status/status.json'), before);
    assert.equal(existsSync(join(f.client, 'status/radio.key')), false);
    assert.equal(existsSync(join(f.client, f.newSkill)), false);
    assert.equal(existsSync(join(f.client, '.update-backup')), false);
    f.state[problem] = false;
  }
});

for (const home of [false, true]) {
  test(`a radio opt-in updates from the publication eligible after pairing (${home ? 'with a home' : 'local only'})`, async t => {
    const f = await publishedUpdateJourney(t, 'codex');
    const current = status(f.client);
    current.sharing = { status_signal_enabled: false, radio_choice: 'declined' };
    if (home) current.home = { enabled: true, branch: 'main' };
    put(f.client, 'status/status.json', JSON.stringify(current));
    f.state.listed = [1];
    f.state.publishAfterPair = [2, 1];
    const code = 'BCDF-GHJK-LMNP';
    const resumed = home
      ? await f.request({ ORION_PAIRING_CODE: code }, ['--pair-radio'])
      : await f.request({ ORION_PAIRING_CODE: '' }, [], [
        ['Turn on check-ins and continue your update?', 'yes'],
        ['Enter your Daily Practice pairing code', code],
      ]);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.match(resumed.stderr, /radio pairing confirmed.*continuing/i);
    assert.ok(!(resumed.stdout + resumed.stderr).includes(f.token));
    assert.ok(!(resumed.stdout + resumed.stderr).includes(code));
    assert.equal(read(f.client, f.newSkill), '# Next release skill\n');
    const after = status(f.client);
    assert.equal(after.sharing.radio_choice, 'accepted');
    assert.equal(after.sharing.status_signal_enabled, true);
    assert.equal(after.sharing.harness_id, '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62');
    assert.equal(after.applied_release.commit, f.commit);
    if (home) {
      assert.equal(after.sharing.install_token, null);
      assert.equal(read(f.client, 'status/radio.key'), f.token + '\n');
      if (process.platform !== 'win32') {
        assert.equal(statSync(join(f.client, 'status/radio.key')).mode & 0o777, 0o600);
      }
    } else {
      assert.equal(after.sharing.install_token, f.token);
      assert.equal(existsSync(join(f.client, 'status/radio.key')), false);
    }
  });
}

test('a resumed update still refuses a release withdrawn at the prewrite check', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code');
  const current = status(f.client);
  current.sharing = { status_signal_enabled: false, radio_choice: 'declined' };
  put(f.client, 'status/status.json', JSON.stringify(current));
  f.state.withdrawn = true;
  const result = await f.request({ ORION_PAIRING_CODE: 'BCDF-GHJK-LMNP' }, ['--pair-radio']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /withdrawn or identity changed/);
  const after = status(f.client);
  assert.equal(after.sharing.radio_choice, 'accepted');
  assert.deepEqual(after.applied_release, current.applied_release);
  assert.equal(existsSync(join(f.client, f.newSkill)), false);
  assert.deepEqual(readdirSync(join(f.client, '.update-backup')), []);
});

test('withdrawal or changed publication identity stops before the first harness write', async t => {
  const f = await publishedUpdateJourney(t, 'codex');
  const before = read(f.client, 'status/status.json');
  for (const problem of ['withdrawn', 'identityChanged']) {
    f.state[problem] = true;
    const denied = await f.request();
    assert.notEqual(denied.code, 0);
    assert.match(denied.stderr, /withdrawn or identity changed/);
    assert.equal(read(f.client, 'status/status.json'), before);
    assert.equal(existsSync(join(f.client, f.newSkill)), false);
    assert.equal(existsSync(join(f.client, '.update-backup')), false);
    f.state[problem] = false;
  }
});

test('client requests refuse same-version replacement identities and version-only status', async t => {
  const f = await publishedUpdateJourney(t, 'codex');
  assert.equal((await f.request()).code, 0);
  const before = read(f.client, 'status/status.json');
  f.state.replacementId = 20;
  const different = await f.request();
  assert.notEqual(different.code, 0);
  assert.match(different.stderr, /integrity conflict/i);
  assert.equal(read(f.client, 'status/status.json'), before);

  f.state.replacementId = 0;
  const versionOnly = status(f.client);
  delete versionOnly.applied_release;
  put(f.client, 'status/status.json', JSON.stringify(versionOnly));
  const legacy = await f.request();
  assert.notEqual(legacy.code, 0);
  assert.match(legacy.stderr, /declared verification migration/i);
  assert.deepEqual(status(f.client), versionOnly);
});

test('a staged syntax failure writes nothing to the harness', async t => {
  const f = await publishedUpdateJourney(t, 'codex');
  const before = status(f.client);
  git(f.release, 'checkout', '-q', '--detach', f.commit);
  put(f.release, 'status/done.mjs', 'const invalid =\n');
  git(f.release, 'add', '.');
  git(f.release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'broken candidate');
  git(f.release, 'tag', '-f', 'v2.10.0');
  const failed = await f.request();
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /Invalid script status\/done.mjs/);
  assert.deepEqual(status(f.client), before);
  assert.equal(existsSync(join(f.client, f.newSkill)), false);
  assert.equal(existsSync(join(f.client, '.update-backup')), false);
});

function readRequiredReview(t, result) {
  const directory = result.stderr.match(/^Private review folder: (.+)$/m)?.[1];
  assert.ok(directory, result.stderr);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, review: JSON.parse(read(directory, 'review.json')) };
}

test('a required updater edit can be deferred, then replaced after reviewing all three versions', async t => {
  const destination = 'update/apply.mjs';
  const privateEdit = 'Local notes containing a private credential\n';
  const f = await publishedUpdateJourney(t, 'codex', {
    customizeCandidate({ release }) {
      put(release, destination, read(release, destination) + '\n// Required change\n');
    },
  });
  const before = read(f.client, 'status/status.json');
  put(f.client, destination, privateEdit);
  const deferred = await f.request();
  assert.notEqual(deferred.code, 0);
  assert.match(deferred.stderr, /Required update is blocked by a local edit: update\/apply\.mjs/);
  assert.ok(!(deferred.stdout + deferred.stderr).includes(privateEdit.trim()));
  assert.ok(!(deferred.stdout + deferred.stderr).includes(f.token));
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(read(f.client, destination), privateEdit);
  assert.equal(existsSync(join(f.client, '.update-backup')), false);

  const { directory, review } = readRequiredReview(t, deferred);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  const [conflict] = review.conflicts;
  assert.equal(conflict.destination, destination);
  assert.equal(conflict.choice, null);
  assert.equal(read(directory, conflict.prior), git(f.release, 'show', 'v2.0.0:' + destination) + '\n');
  assert.equal(read(directory, conflict.edited), privateEdit);
  assert.equal(statSync(join(directory, conflict.edited)).mode & 0o777, 0o600);
  assert.match(read(directory, conflict.incoming), /Required change/);

  conflict.choice = 'replace';
  put(directory, 'review.json', JSON.stringify(review));
  const continued = await f.request({}, ['--resolve-required', directory]);
  assert.equal(continued.code, 0, continued.stderr);
  const report = JSON.parse(continued.stdout);
  assert.deepEqual(report.resolved_required, [{ destination, choice: 'replace' }]);
  assert.equal(read(f.client, destination), read(directory, conflict.incoming));
  assert.equal(read(f.client, `${report.backup}/files/${destination}`), privateEdit);
  assert.equal(read(f.client, f.edit), '# Client-edited skill\n');
  assert.ok(report.kept.includes(f.edit));
  assert.equal(status(f.client).applied_release.commit, f.commit);
});

test('a reviewed required merge retains the local text and must pass update smoke checks', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code', {
    customizeCandidate({ manifest }) {
      manifest.update_compatibility[0].required_destinations.push('.claude/skills/hire-agent/SKILL.md');
    },
  });
  const before = read(f.client, 'status/status.json');
  const first = await f.request();
  const { directory, review } = readRequiredReview(t, first);
  const [conflict] = review.conflicts;
  assert.equal(conflict.destination, f.edit);
  const merged = '# Changed upstream\n\nClient-edited skill\n';
  conflict.choice = 'merge';
  put(directory, conflict.merged, merged);
  put(directory, 'review.json', JSON.stringify(review));

  const failing = await f.request({ ORION_UPDATE_SMOKE_FAIL: '1' }, ['--resolve-required', directory]);
  assert.match(failing.stderr, /prior release was restored/);
  assert.equal(read(f.client, f.edit), '# Client-edited skill\n');
  assert.equal(read(f.client, 'status/status.json'), before);

  const resumed = await f.request({}, ['--resolve-required', directory]);
  assert.equal(resumed.code, 0, resumed.stderr);
  const report = JSON.parse(resumed.stdout);
  assert.deepEqual(report.resolved_required, [{ destination: f.edit, choice: 'merge' }]);
  assert.equal(read(f.client, f.edit), merged);
  assert.equal(read(f.client, `${report.backup}/files/${f.edit}`), '# Client-edited skill\n');
  assert.equal(status(f.client).applied_release.commit, f.commit);
});

test('a failed declared text migration for an edited required file can be resolved by review', async t => {
  const f = await publishedUpdateJourney(t, 'codex', {
    customizeCandidate({ release, manifest }) {
      const destination = '.agents/skills/hire-agent/SKILL.md';
      const script = 'update/migrations/skill-text.json';
      manifest.update_compatibility[0].required_destinations.push(destination);
      manifest.update_compatibility[0].steps = [{
        from_version: '2.0.0', to_version: '2.10.0', script,
        changes: [{ path: destination, operation: 'replace' }],
      }];
      put(release, script, JSON.stringify([{
        op: 'replace-text', path: destination,
        find: 'A heading the client replaced', replace: '# Changed upstream',
      }]));
    },
  });
  const deferred = await f.request();
  const { directory, review } = readRequiredReview(t, deferred);
  const [conflict] = review.conflicts;
  assert.equal(conflict.destination, f.edit);
  assert.equal(read(f.client, f.edit), '# Client-edited skill\n');
  assert.equal(existsSync(join(f.client, '.update-backup')), false);

  conflict.choice = 'replace';
  put(directory, 'review.json', JSON.stringify(review));
  const continued = await f.request({}, ['--resolve-required', directory]);
  assert.equal(continued.code, 0, continued.stderr);
  assert.equal(read(f.client, f.edit), '# Changed upstream\n');
  assert.equal(status(f.client).applied_release.commit, f.commit);
});

test('an approved required-edit review cannot be reused after the local bytes or publication change', async t => {
  const f = await publishedUpdateJourney(t, 'codex', {
    customizeCandidate({ manifest }) {
      manifest.update_compatibility[0].required_destinations.push('.agents/skills/hire-agent/SKILL.md');
    },
  });
  const before = read(f.client, 'status/status.json');
  const first = readRequiredReview(t, await f.request());
  first.review.conflicts[0].choice = 'replace';
  put(first.directory, 'review.json', JSON.stringify(first.review));

  put(f.client, f.edit, 'Changed after review\n');
  const changed = await f.request({}, ['--resolve-required', first.directory]);
  assert.notEqual(changed.code, 0);
  assert.match(changed.stderr, /earlier review is stale/);
  const refreshed = readRequiredReview(t, changed);
  assert.equal(refreshed.review.conflicts[0].choice, null);
  assert.equal(read(refreshed.directory, refreshed.review.conflicts[0].edited), 'Changed after review\n');
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(read(f.client, f.edit), 'Changed after review\n');

  refreshed.review.conflicts[0].choice = 'replace';
  put(refreshed.directory, 'review.json', JSON.stringify(refreshed.review));
  put(refreshed.directory, refreshed.review.conflicts[0].incoming, 'A different incoming copy\n');
  const tampered = await f.request({}, ['--resolve-required', refreshed.directory]);
  assert.notEqual(tampered.code, 0);
  assert.match(tampered.stderr, /earlier review is stale/);
  const reviewed = readRequiredReview(t, tampered);
  assert.equal(read(reviewed.directory, reviewed.review.conflicts[0].incoming), '# Changed upstream\n');
  reviewed.review.conflicts[0].choice = 'replace';
  put(reviewed.directory, 'review.json', JSON.stringify(reviewed.review));
  f.state.replacementId = 5;
  const republished = await f.request({}, ['--resolve-required', reviewed.directory]);
  assert.notEqual(republished.code, 0);
  assert.match(republished.stderr, /earlier review is stale/);
  assert.equal(readRequiredReview(t, republished).review.pin.release_id, 5);
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(read(f.client, f.edit), 'Changed after review\n');
  assert.equal(existsSync(join(f.client, f.newSkill)), false);
  assert.equal(existsSync(join(f.client, '.update-backup')), false);
});

test('a moved historical tag stops a required-edit review without using local or current release files as the prior version', async t => {
  const f = await publishedUpdateJourney(t, 'codex', {
    customizeCandidate({ manifest }) {
      manifest.update_compatibility[0].required_destinations.push('.agents/skills/hire-agent/SKILL.md');
    },
  });
  git(f.release, 'tag', '-f', 'v2.0.0', f.commit);
  const before = read(f.client, 'status/status.json');
  const stopped = await f.request();
  assert.notEqual(stopped.code, 0);
  assert.match(stopped.stderr, /cannot verify the exact prior shipped release/i);
  assert.doesNotMatch(stopped.stderr, /Private review folder/);
  assert.equal(read(f.client, f.edit), '# Client-edited skill\n');
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(f.client, '.update-backup')), false);
});

test('smoke-check failure restores the prior release and keeps a failure report', async t => {
  const f = await publishedUpdateJourney(t, 'codex');
  const before = read(f.client, 'status/status.json');
  const failed = await f.request({ ORION_UPDATE_SMOKE_FAIL: '1' });
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /prior release was restored/);
  const reportPath = failed.stderr.match(/Report: (\.update-backup\/\S+\/failure\.json)/)[1];
  const report = JSON.parse(read(f.client, reportPath));
  assert.match(report.failure, /smoke-check failure/);
  assert.equal(report.restoration, 'restored');
  assert.ok(report.affected_files.includes(f.newSkill));
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(f.client, f.newSkill)), false);
  assert.equal(existsSync(join(f.client, dirname(f.newSkill))), false);
});

test('retry recovers a process interrupted mid-promotion before applying anew', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code');
  const before = read(f.client, 'status/status.json');
  const interrupted = await f.request({ ORION_UPDATE_INTERRUPT_AFTER: '1' });
  assert.notEqual(interrupted.code, 0);
  assert.equal(read(f.client, 'status/status.json'), before);
  f.state.listed = [1];
  const changedRelease = await f.request();
  assert.notEqual(changedRelease.code, 0);
  assert.match(changedRelease.stderr, /requires recovery from a separate pinned source/);
  assert.equal(read(f.client, 'status/status.json'), before);
  f.state.listed = [2, 1, 3];
  const retried = await f.request();
  assert.equal(retried.code, 0, retried.stderr);
  assert.equal(status(f.client).applied_release.commit, f.commit);
  assert.equal(read(f.client, f.newSkill), '# Next release skill\n');
});

test('ordered published migrations promote only declared changes and back up edited client files', async t => {
  const f = await publishedUpdateJourney(t, 'codex', {
    customizeCandidate({ release, client, manifest }) {
      put(client, 'agent/client.txt', 'Client notes\n');
      manifest.update_compatibility[0].steps = [
        {
          from_version: '2.0.0', to_version: '2.4.0', script: 'update/migrations/first.json',
          changes: [{ path: 'agent/client.txt', operation: 'replace' }],
        },
        {
          from_version: '2.4.0', to_version: '2.10.0', script: 'update/migrations/second.json',
          changes: [{ path: 'agent/client.txt', operation: 'replace' }],
        },
      ];
      const program = (find, replace) => [{ op: 'replace-text', path: 'agent/client.txt', find, replace }];
      put(release, 'update/migrations/first.json', JSON.stringify(program('Client', 'Team')));
      put(release, 'update/migrations/second.json', JSON.stringify(program('Team notes', 'Team playbook')));
    },
  });
  const failed = await f.request({ ORION_UPDATE_SMOKE_FAIL: '1' });
  assert.match(failed.stderr, /prior release was restored/);
  assert.equal(read(f.client, 'agent/client.txt'), 'Client notes\n');
  assert.equal(status(f.client).template_version, '2.0.0');

  const result = await f.request();
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(read(f.client, 'agent/client.txt'), 'Team playbook\n');
  assert.equal(read(f.client, `${report.backup}/files/agent/client.txt`), 'Client notes\n');
  assert.deepEqual(report.migrations.map(step => step.changed), [
    [{ path: 'agent/client.txt', operation: 'replace' }],
    [{ path: 'agent/client.txt', operation: 'replace' }],
  ]);
  assert.equal(status(f.client).template_version, '2.10.0');
  assert.equal(status(f.client).sharing.radio_choice, 'accepted');
});

test('a real v1.5.0 same-folder harness migrates into a new deployed folder', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code', { legacy: true });
  f.state.listed = [1];
  const pinned = git(f.release, 'rev-parse', 'v2.0.0');
  const before = read(f.client, 'status/status.json');
  const bad = await f.request({ ORION_UPDATE_SMOKE_FAIL: '1' });
  assert.notEqual(bad.code, 0);
  const failedReport = bad.stderr.trim().match(/Report: (.*\/failure\.json)$/)[1];
  assert.match(readFileSync(failedReport, 'utf8'), /smoke-check failure/);
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(dirname(f.client), 'client-deployed')), false);

  const interrupted = await f.request({ ORION_UPDATE_INTERRUPT_AFTER: '1' });
  assert.notEqual(interrupted.code, 0);
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(dirname(f.client), 'client-deployed')), false);

  const result = await f.request();
  assert.equal(result.code, 0, result.stderr);
  const { deployed_folder: destination, backup } = JSON.parse(result.stdout);
  assert.equal(destination, join(realpathSync(dirname(f.client)), 'client-deployed'));
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(f.client, 'update/request.mjs')), false);
  assert.equal(read(destination, '.claude/agents/follow-up.md'), 'Hired job sheet\n');
  assert.equal(read(destination, 'agent/knowledge-base/01-business-context.md'), 'Personal business context\n');
  assert.equal(read(destination, 'AGENTS.md'), 'Personal agent instructions\n');
  assert.equal(read(destination, `${backup}/files/status/status.json`), before);
  assert.equal(status(destination).selected_tool, 'claude-code');
  assert.equal(status(destination).applied_release.commit, pinned);
  assert.equal(status(destination).applied_release.release_id, 1);
  assert.equal(status(destination).sharing.radio_choice, 'accepted');
  assert.equal(status(destination).checklist.n8n_wf01_imported, undefined);
  for (const excluded of ['tests', 'specs', '.github', '.specify', 'skills', 'agents']) {
    assert.equal(existsSync(join(destination, excluded)), false, excluded);
  }
});

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} same-version backfill requires exact pinned runtime and verified layout`, async t => {
    const f = await publishedUpdateJourney(t, tool);
    f.state.listed = [1];
    // The fixture helper appends a separate candidate's edit after the fresh
    // install. Restore the exact tag bytes rather than trusting the version.
    const shipped = execFileSync('git', ['show', 'v2.0.0:skills/hire-agent/SKILL.md'], { cwd: f.release });
    put(f.client, f.edit, shipped);
    put(f.client, 'AGENTS.md', 'Customized agent instructions\n');
    const before = status(f.client);
    const forged = status(f.client);
    delete forged.applied_release;
    delete forged.selected_tool;
    put(f.client, 'status/status.json', JSON.stringify(forged));
    const runtime = 'status/done.mjs';
    const original = read(f.client, runtime);
    put(f.client, runtime, original + '\n// Other bytes for the same version.\n');
    const denied = await f.request();
    assert.notEqual(denied.code, 0);
    assert.match(denied.stderr, /exact installed publication at status\/done\.mjs/);
    assert.deepEqual(status(f.client), forged);
    assert.equal(existsSync(join(f.client, '.update-backup')), false);

    put(f.client, runtime, original);
    const applied = await f.request();
    assert.equal(applied.code, 0, applied.stderr);
    const after = status(f.client);
    assert.equal(after.selected_tool, before.selected_tool);
    assert.equal(after.applied_release.commit, before.applied_release.commit);
    assert.equal(after.applied_release.release_id, 1);
    assert.equal(read(f.client, 'AGENTS.md'), 'Customized agent instructions\n');
    const unchanged = await f.request();
    assert.match(unchanged.stdout, /already applied/);
    assert.deepEqual(status(f.client), after);
  });
}

test('missing or ambiguous migration declarations and undeclared writes leave the harness untouched', async t => {
  for (const problem of ['duplicate', 'gap', 'missing-checks', 'undeclared-write']) {
    const f = await publishedUpdateJourney(t, 'codex', {
      customizeCandidate({ release, client, manifest }) {
        put(client, 'agent/client.txt', 'Client bytes\n');
        const path = manifest.update_compatibility[0];
        path.steps = [{
          from_version: problem === 'gap' ? '2.1.0' : '2.0.0',
          to_version: '2.10.0',
          script: 'update/migrations/change.json',
          changes: [{ path: 'agent/client.txt', operation: 'replace' }],
        }];
        put(release, 'update/migrations/change.json', JSON.stringify([{
          op: 'write-text', path: problem === 'undeclared-write' ? 'agent/other.txt' : 'agent/client.txt', text: 'New text',
        }]));
        if (problem === 'duplicate') manifest.update_compatibility.push(structuredClone(path));
        if (problem === 'missing-checks') delete path.checks;
      },
    });
    const messages = {
      duplicate: /expected one supported update path/i,
      gap: /out-of-order migration step/i,
      'missing-checks': /missing or invalid required post-apply checks/i,
      'undeclared-write': /undeclared or unsupported migration operation/i,
    };
    const before = read(f.client, 'status/status.json');
    const denied = await f.request();
    assert.notEqual(denied.code, 0, problem);
    assert.match(denied.stderr, messages[problem]);
    assert.equal(read(f.client, 'status/status.json'), before);
    assert.equal(read(f.client, 'agent/client.txt'), 'Client bytes\n');
    assert.equal(existsSync(join(f.client, 'agent/other.txt')), false);
    assert.equal(existsSync(join(f.client, '.update-backup')), false);
  }
});

test('a separately migrating client can continue a required-edit review after their single radio opt-in', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code', { legacy: true });
  const legacy = status(f.client);
  legacy.sharing = { status_signal_enabled: false, radio_choice: 'declined' };
  put(f.client, 'status/status.json', JSON.stringify(legacy));
  const before = read(f.client, 'status/status.json');
  const destination = join(dirname(f.client), 'new-deployed');
  const path = 'status/shapes.mjs';
  put(f.client, path, 'My prior updater edits\n');
  f.state.listed = [1];
  const paused = await f.request({ ORION_PAIRING_CODE: 'BCDF-GHJK-LMNP' }, [
    '--pair-radio', '--migrate-to', destination,
  ]);
  const { directory, review } = readRequiredReview(t, paused);
  const [conflict] = review.conflicts;
  assert.equal(conflict.destination, path);
  assert.equal(read(directory, conflict.prior), git(f.release, 'show', 'v1.5.0:' + path) + '\n');
  for (const displayed of ['prior', 'edited', 'incoming']) {
    assert.ok(!read(directory, conflict[displayed]).includes(f.token));
  }
  assert.ok(!(paused.stdout + paused.stderr).includes(f.token));
  assert.ok(!read(directory, 'review.json').includes(f.token));
  assert.equal(existsSync(destination), false);
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(f.client, '.update-backup')), false);

  conflict.choice = 'replace';
  put(directory, 'review.json', JSON.stringify(review));
  f.state.pairingRejected = true;
  const resumed = await f.request({}, ['--resolve-required', directory, '--migrate-to', destination]);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.ok(!(resumed.stdout + resumed.stderr).includes(f.token));
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(read(f.client, path), 'My prior updater edits\n');
  assert.equal(status(destination).sharing.radio_choice, 'accepted');
  assert.equal(status(destination).applied_release.tag, 'v2.0.0');
});

test('a claimed legacy version without its historical layout and pinned anchors stops at clean-install guidance', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code', { legacy: true });
  f.state.listed = [1];
  const before = read(f.client, 'status/status.json');
  const manifest = read(f.client, 'update/manifest.json');
  put(f.client, 'update/manifest.json', manifest + '  ');
  const forged = await f.request();
  assert.notEqual(forged.code, 0);
  assert.match(forged.stderr, /separate clean install/i);
  put(f.client, 'update/manifest.json', manifest);
  put(f.client, 'skills/foreign/SKILL.md', 'Layout from another version\n');
  const mixed = await f.request();
  assert.notEqual(mixed.code, 0);
  assert.match(mixed.stderr, /separate clean install/i);
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(existsSync(join(dirname(f.client), 'client-deployed')), false);
});

test('failed rollback blocks updates and recovers through the exact separate publication even after withdrawal', async t => {
  const f = await publishedUpdateJourney(t, 'codex', { damageUpdater: true });
  const priorStatus = read(f.client, 'status/status.json');
  const priorUpdater = read(f.client, 'update/apply.mjs');
  const failed = await f.request({ ORION_UPDATE_SMOKE_FAIL: '1', ORION_UPDATE_RESTORE_FAIL: '1' });
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /requires recovery/);
  const backup = failed.stderr.match(/Evidence: (\.update-backup\/\S+)/)[1];
  const failurePath = `${backup}/failure.json`;
  const failure = read(f.client, failurePath);
  assert.match(JSON.parse(failure).restoration, /Injected restoration failure/);
  assert.ok(JSON.parse(failure).affected_files.includes('update/apply.mjs'));
  assert.equal(read(f.client, `${backup}/files/update/apply.mjs`), priorUpdater);
  const journalPath = `${backup}/journal.json`;
  const journal = read(f.client, journalPath);
  assert.equal(JSON.parse(journal).state, 'recovery-required');
  assert.equal(read(f.client, 'status/status.json'), priorStatus);
  assert.equal(read(f.client, f.newSkill), '# Next release skill\n');

  const blocked = await f.request();
  assert.notEqual(blocked.code, 0);
  assert.match(blocked.stderr, /requires recovery/);
  assert.equal(read(f.client, journalPath), journal);
  assert.match(run(f.client, 'update/apply.mjs', 'recover', '--root', f.client).stderr, /Damaged deployed updater/);
  f.state.listed = [];
  assert.match((await f.request()).stderr, /requires recovery/);
  f.state.listed = [2, 1, 3];

  const source = join(dirname(f.client), 'recovery');
  git(f.release, '-c', 'advice.detachedHead=false', 'clone', '-q', '--branch', 'v2.10.0', f.release, source);
  const recover = (commit = f.commit) => f.execute([join(source, 'update/apply.mjs'), 'recover-published',
    '--root', f.client, '--backup', backup, '--tag', 'v2.10.0', '--commit', commit, '--release-id', '2']);
  const wrong = await recover('a'.repeat(40));
  assert.notEqual(wrong.code, 0);
  assert.match(wrong.stderr, /original transaction release/);
  assert.equal(read(f.client, journalPath), journal);

  put(f.client, f.newSkill, '# Client wrote this after the failed update\n');
  const collision = await recover();
  assert.notEqual(collision.code, 0);
  assert.match(collision.stderr, /recovery collisions/);
  assert.equal(read(f.client, f.newSkill), '# Client wrote this after the failed update\n');
  assert.equal(read(f.client, failurePath), failure);
  assert.equal(JSON.parse(read(f.client, journalPath)).state, 'recovery-required');
  assert.match(read(f.client, `${backup}/recovery.json`), /recovery collisions/);
  assert.match((await f.request()).stderr, /requires recovery/);

  put(f.client, 'agent/knowledge-base/01-later.md', '# Unsynced client notes\n');
  put(f.client, f.newSkill, '# Next release skill\n');
  f.state.withdrawn = true;
  const recovered = await recover();
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.match(recovered.stdout, /restored/);
  assert.equal(read(f.client, 'update/apply.mjs'), priorUpdater);
  assert.equal(read(f.client, 'status/status.json'), priorStatus);
  assert.equal(read(f.client, 'agent/knowledge-base/01-later.md'), '# Unsynced client notes\n');
  assert.equal(existsSync(join(f.client, f.newSkill)), false);
  assert.equal(JSON.parse(read(f.client, journalPath)).state, 'recovered');
  assert.equal(read(f.client, failurePath), failure);
});

test('explicit radio opt-in pairs the legacy migration target and preserves the original choice and key file', async t => {
  const f = await publishedUpdateJourney(t, 'claude-code', { legacy: true });
  f.state.listed = [1];
  const legacy = status(f.client);
  legacy.sharing = { ...legacy.sharing, radio_choice: 'declined', status_signal_enabled: false, install_token: null };
  legacy.home = { enabled: true, branch: 'main' };
  put(f.client, 'status/status.json', JSON.stringify(legacy));
  const previousKey = 'orion_' + 'previous'.repeat(3);
  put(f.client, 'status/radio.key', previousKey + '\n');
  const before = read(f.client, 'status/status.json');
  const destination = join(dirname(f.client), 'separately-deployed');
  const result = await f.request({ ORION_PAIRING_CODE: 'BCDF-GHJK-LMNP' }, ['--pair-radio', '--migrate-to', destination]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Radio pairing confirmed/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(f.token));
  assert.equal(read(f.client, 'status/status.json'), before);
  assert.equal(read(f.client, 'status/radio.key'), previousKey + '\n');
  assert.equal(status(destination).sharing.radio_choice, 'accepted');
  assert.equal(status(destination).sharing.install_token, null);
  assert.equal(read(destination, 'status/radio.key'), f.token + '\n');
  assert.equal(statSync(join(destination, 'status/radio.key')).mode & 0o777, 0o600);
});
