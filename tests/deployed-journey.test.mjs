/** A client journey using a complete release checkout and only deployed commands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

function journey(t, tool, { beforeInstall } = {}) {
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
  beforeInstall?.(release);
  ok(run(release, 'install.mjs', '--tool', tool, '--target', client, '--local-only'));
  return { release, client };
}

const lfHash = bytes => createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} install from a locally modified, uncommitted checkout records the bytes it installed`, t => {
    const edits = {
      'AGENTS.md': 'You are **Orion**, from a maintainer branch.\r\nLocal edit, never committed.\r\n',
      [`${pkg}/post-call-debrief/SKILL.md`]: null,
    };
    const { client } = journey(t, tool, {
      beforeInstall: release => {
        edits[`${pkg}/post-call-debrief/SKILL.md`] = `${read(release, `${pkg}/post-call-debrief/SKILL.md`)}\nLocal, uncommitted note.\n`;
        for (const [path, text] of Object.entries(edits)) put(release, path, text);
        assert.notEqual(git(release, 'status', '--porcelain'), '', 'the release checkout has uncommitted edits');
      },
    });
    const receipt = JSON.parse(read(client, 'status/installed-files.json'));
    for (const [path, text] of Object.entries(edits)) {
      assert.equal(read(client, path), text, `${path} installed from the working tree`);
      assert.equal(receipt.files[path].hash, lfHash(Buffer.from(text)), `${path} recorded as installed`);
    }
    // CRLF and LF installs of the same text record the same fingerprint.
    assert.equal(receipt.files['AGENTS.md'].hash, lfHash(Buffer.from(edits['AGENTS.md'].replace(/\r\n/g, '\n'))));
    for (const [path, entry] of Object.entries(receipt.files)) assert.equal(entry.hash, lfHash(readFileSync(join(client, path))), path);
  });
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
    const installedSkill = read(client, `${pkg}/prospecting/SKILL.md`);
    const edited = installedSkill + '\nClient note.\n';
    put(client, `${pkg}/prospecting/SKILL.md`, edited);
    const installedReadme = read(client, 'README.md');
    put(client, 'README.md', installedReadme + '\nOur own notes.\n');
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
    put(client, 'status/status.json', JSON.stringify({ ...prior, packages: packageHistory, sharing: { ...prior.sharing} }));
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
    put(release, 'README.md', installedReadme + '\nRelease readme.\n');
    put(release, `${pkg}/prospecting/SKILL.md`, installedSkill + '\nRelease skill change.\n');
    const installedGuard = read(client, 'status/guard.mjs');
    put(release, 'status/guard.mjs', installedGuard + '\n// Release runtime change.\n');
    put(client, 'status/guard.mjs', installedGuard + '\n// Client runtime edit.\n');
    git(release, 'add', '.');
    git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'next release');
    const pinned = git(release, 'rev-parse', 'HEAD');
    put(release, 'AGENTS.md', 'Uncommitted poison.\n');
    const update = () => run(client, 'update/apply.mjs', 'update', '--root', client, '--release-repo', release, '--commit', pinned);
    const receiptBefore = read(client, 'status/installed-files.json');

    // The plugin edit stops the update before any release file changes, ordinary ones included.
    const blocked = update();
    assert.equal(blocked.status, 2, blocked.stdout + blocked.stderr);
    const conflict = JSON.parse(blocked.stdout);
    assert.equal(conflict.state, 'conflict');
    assert.deepEqual(conflict.conflicts, [{ path: 'status/guard.mjs', reason: 'modified' }, { path: `${pkg}/prospecting/SKILL.md`, reason: 'modified' }]);
    assert.equal(read(client, 'AGENTS.md'), original);
    assert.equal(read(client, `${pkg}/prospecting/SKILL.md`), edited);
    assert.equal(existsSync(join(client, `${pkg}/new-release/SKILL.md`)), false);
    assert.equal(read(client, 'status/installed-files.json'), receiptBefore);
    assert.equal(existsSync(join(client, '.update-backup')), false);
    assert.equal(status(client).template_version, prior.template_version);

    // The client moves the edit out. Installed files with Windows line endings still count as untouched.
    put(client, `${pkg}/prospecting/SKILL.md`, installedSkill.replace(/\n/g, '\r\n'));
    put(client, 'status/guard.mjs', installedGuard);
    put(client, 'AGENTS.md', original.replace(/\n/g, '\r\n'));
    // An update killed partway (the package is already replaced) is recovered with its receipt.
    const killed = spawnSync(process.execPath, [join(client, 'update/apply.mjs'), 'update', '--root', client, '--release-repo', release, '--commit', pinned],
      { cwd: client, encoding: 'utf8', env: plainEnv({ ORION_UPDATE_CRASH_AFTER: '2' }) });
    assert.notEqual(killed.status, 0);
    rmSync(join(client, 'status/.radio-lock'), { recursive: true });
    ok(run(client, 'update/apply.mjs', 'recover', '--root', client));
    assert.equal(read(client, 'status/installed-files.json'), receiptBefore);
    assert.equal(read(client, `${pkg}/prospecting/SKILL.md`), installedSkill.replace(/\n/g, '\r\n'));
    assert.equal(read(client, 'AGENTS.md'), original.replace(/\n/g, '\r\n'));
    assert.equal(existsSync(join(client, `${pkg}/new-release/SKILL.md`)), false);
    assert.equal(status(client).template_version, prior.template_version);
    const result = update();
    ok(result);
    const report = JSON.parse(result.stdout);
    assert.match(read(client, 'status/guard.mjs'), /Release runtime change/);
    assert.match(read(client, 'AGENTS.md'), /Release update\./);
    assert.doesNotMatch(read(client, 'AGENTS.md'), /Uncommitted poison/);
    assert.equal(read(client, `${pkg}/prospecting/SKILL.md`), read(release, `${pkg}/prospecting/SKILL.md`));
    assert.deepEqual(report.package.edits_backed_up, []);
    assert.equal(report.active, false, 'the target is not announced as active before discovery');
    assert.equal(status(client).plugin.pending_version, manifest.template_version);
    assert.equal(read(client, `${skill(tool)}/personal/SKILL.md`), '# Personal skill\n');
    assert.equal(read(client, `${pkg}/new-release/SKILL.md`), '# New release skill\n');
    // An edited ordinary file is kept byte for byte, with the baseline it was installed with.
    assert.ok(report.kept.includes('README.md'));
    assert.equal(read(client, 'README.md'), installedReadme + '\nOur own notes.\n');
    // Shipped bytes from an older release, at paths this install never wrote, are not Orion's to remove.
    for (const path of [retiredPage, retiredMeetingPackage, editedPage]) assert.ok(report.unknown.includes(path), path);
    assert.equal(read(client, retiredPage), oldPage);
    assert.equal(read(client, retiredMeetingPackage), oldMeetingPackage);
    assert.equal(read(client, editedPage), '# Client debrief instructions\n');
    assert.equal(read(client, shiftRecord), shiftHistory);
    assert.deepEqual(status(client).packages, packageHistory);
    const receipt = JSON.parse(read(client, 'status/installed-files.json'));
    assert.equal(receipt.template_version, manifest.template_version);
    assert.equal(receipt.files['README.md'].hash, lfHash(Buffer.from(installedReadme)));
    assert.equal(receipt.files[`${pkg}/new-release/SKILL.md`].hash, lfHash(Buffer.from('# New release skill\n')));
    for (const path of [retiredPage, retiredMeetingPackage, editedPage, `${skill(tool)}/personal/SKILL.md`, 'legacy/hire-agent/SKILL.md']) assert.equal(receipt.files[path], undefined, path);
    for (const [path, entry] of Object.entries(receipt.files)) {
      if (path !== 'README.md') assert.equal(entry.hash, lfHash(readFileSync(join(client, path))), `${path} is recorded as it was installed`);
    }
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
    // A runtime edit made after the update is the client's: restore keeps it.
    const updatedGuard = read(client, 'status/guard.mjs');
    const laterGuard = updatedGuard + '\n// Client edit after the update.\n';
    put(client, 'status/guard.mjs', laterGuard);
    const restore = run(client, 'update/apply.mjs', 'restore', '--root', client, '--backup', report.backup);
    ok(restore);
    assert.ok(JSON.parse(restore.stdout).kept.includes('status/guard.mjs'));
    assert.equal(read(client, 'status/guard.mjs'), laterGuard);
    assert.equal(read(client, retiredMeetingPackage), oldMeetingPackage);
    assert.equal(read(client, 'AGENTS.md'), original.replace(/\n/g, '\r\n'));
    assert.equal(read(client, `${skill(tool)}/hire-agent/SKILL.md`), 'Custom legacy instructions\n');
    assert.equal(existsSync(join(client, `${pkg}/new-release/SKILL.md`)), false);
    assert.equal(read(client, `${pkg}/prospecting/SKILL.md`), installedSkill.replace(/\n/g, '\r\n'));
    assert.equal(existsSync(join(client, pkg, 'post-call-debrief', 'SKILL.md')), false, 'the prior package comes back exactly');
    assert.equal(status(client).plugin.setup_state, 'pending', 'recovery waits for a fresh check');
    // The receipt follows the restored files: it no longer claims the update's files.
    const restoredReceipt = JSON.parse(read(client, 'status/installed-files.json'));
    assert.equal(restoredReceipt.files[`${pkg}/new-release/SKILL.md`], undefined);
    assert.equal(restoredReceipt.files['status/guard.mjs'].hash, lfHash(Buffer.from(updatedGuard)), 'the kept edit keeps the update\'s baseline');
    for (const [path, entry] of Object.entries(restoredReceipt.files)) {
      if (!['README.md', 'status/guard.mjs'].includes(path) && existsSync(join(client, path))) assert.equal(entry.hash, lfHash(readFileSync(join(client, path))), `${path} after restore`);
    }

    // Updating again uses those baselines: the restored files update, both edits stay.
    const again = update();
    ok(again);
    const second = JSON.parse(again.stdout);
    assert.ok(second.kept.includes('status/guard.mjs') && second.kept.includes('README.md'));
    assert.equal(read(client, 'status/guard.mjs'), laterGuard);
    assert.match(read(client, 'AGENTS.md'), /Release update\./);
    assert.equal(read(client, `${pkg}/new-release/SKILL.md`), '# New release skill\n');
    const finalReceipt = JSON.parse(read(client, 'status/installed-files.json'));
    assert.equal(finalReceipt.files['status/guard.mjs'].hash, lfHash(Buffer.from(updatedGuard)));
    for (const [path, entry] of Object.entries(finalReceipt.files)) {
      if (!['README.md', 'status/guard.mjs'].includes(path)) assert.equal(entry.hash, lfHash(readFileSync(join(client, path))), `${path} after the second update`);
    }
  });

  test(`${tool} deployed journey: local skill and interrupted tool switch`, t => {
    const { release, client } = journey(t, tool);
    put(client, `${skill(tool)}/meeting-sizing/SKILL.md`, '# Meeting sizing\nSize the meeting.\n');
    put(client, `${jobs(tool)}/follow-up.md`, '---\nname: follow-up\ntools: Read\n---\n# Follow-up\n');
    const native = fakeNative(dirname(client));
    const name = catalogName(status(client).plugin.catalog_identity);
    const switchAi = (env = {}) => spawnSync(process.execPath, [join(client, 'switch_ai.mjs'), '--json'],
      { cwd: client, encoding: 'utf8', env: { ...native.env, ...env } });
    // Codex shows Orion installed for this folder only after the human's native install,
    // so a switch to Codex waits for it, and the selected tool stays as it was.
    const targetReady = (to) => {
      if (to !== 'codex') return;
      const waiting = switchAi();
      ok(waiting);
      assert.equal(JSON.parse(waiting.stdout).state, 'pending_switch');
      assert.equal(status(client).ai_assistant, other(to));
      ok(native.humanInstall(client, name));
    };
    targetReady(other(tool));
    const interrupted = switchAi({ ORION_SWITCH_FAIL_AFTER: '1' });
    assert.notEqual(interrupted.status, 0);
    assert.match(interrupted.stderr, /Injected switch interruption/);
    assert.equal(status(client).ai_assistant, tool);
    assert.equal(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`).includes('Size the meeting'), true);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);

    targetReady(other(tool));
    const switched = switchAi();
    ok(switched);
    const report = JSON.parse(switched.stdout);
    assert.equal(report.to, other(tool));
    assert.equal(status(client).ai_assistant, other(tool));
    assert.equal(existsSync(join(client, '.specify')), false);
    assert.match(read(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(tool)}/meeting-sizing/SKILL.md`)), false);
    assert.equal(existsSync(join(client, `${jobs(tool)}/follow-up.md`)), true);
    assert.equal(existsSync(join(client, `${jobs(other(tool))}/follow-up.md`)), false);
    targetReady(tool);
    ok(switchAi());
    assert.equal(status(client).ai_assistant, tool);
    assert.equal(catalogName(status(client).plugin.catalog_identity), name, 'the catalog identity survives both switches');
    assert.match(read(client, `${skill(tool)}/meeting-sizing/SKILL.md`), /Size the meeting/);
    assert.equal(existsSync(join(client, `${skill(other(tool))}/meeting-sizing/SKILL.md`)), false);
  });
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} deployed journey: plugin activation fails, then succeeds, then is restored, and the receipt follows the files`, t => {
    const { release, client } = journey(t, tool);
    const native = fakeNative(dirname(client));
    const RECEIPT = 'status/installed-files.json';
    const receipt = () => JSON.parse(read(client, RECEIPT));
    // Every claim matches the disk, and activation's own settings are never claimed.
    const matchesDisk = (when) => {
      const { files } = receipt();
      for (const [path, entry] of Object.entries(files)) assert.equal(entry.hash, lfHash(readFileSync(join(client, path))), `${path} ${when}`);
      for (const path of ['.claude/settings.local.json', '.codex/config.toml', 'status/status.json']) assert.equal(files[path], undefined, `${path} ${when}`);
      return files;
    };
    const installed = matchesDisk('after install');
    // The real path: plugin-setup.mjs runs only when invoked as itself (macOS temp folders are symlinked).
    const node = (script, ...args) => spawnSync(process.execPath, [realpathSync(join(client, script)), ...args], { cwd: client, encoding: 'utf8', env: native.env });

    put(release, 'AGENTS.md', read(release, 'AGENTS.md') + '\nRelease update.\n');
    put(release, `${pkg}/prospecting/SKILL.md`, read(release, `${pkg}/prospecting/SKILL.md`) + '\nRelease skill change.\n');
    git(release, 'add', '.');
    git(release, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'next release');
    const pinned = git(release, 'rev-parse', 'HEAD');
    const update = () => node('update/apply.mjs', 'update', '--root', client, '--release-repo', release, '--commit', pinned);

    // A confirmed native failure puts back the files and, with them, the receipt.
    const before = read(client, RECEIPT);
    native.edit(state => { state.faults = tool === 'codex' ? { codexListFails: true } : { validate: true }; });
    const failed = update();
    assert.equal(failed.status, 3, failed.stdout + failed.stderr);
    assert.equal(JSON.parse(failed.stdout).state, 'rolled_back');
    assert.equal(read(client, RECEIPT), before);
    assert.doesNotMatch(read(client, 'AGENTS.md'), /Release update\./);
    matchesDisk('after the failed activation');

    // The same update with a working tool applies; activation waits for a fresh session.
    native.edit(state => { state.faults = {}; });
    const applied = update();
    ok(applied);
    const report = JSON.parse(applied.stdout);
    assert.equal(report.files_applied, true);
    assert.equal(report.active, false);
    assert.match(read(client, `${pkg}/prospecting/SKILL.md`), /Release skill change\./);
    const files = matchesDisk('after the update');
    assert.equal(files['AGENTS.md'].hash, lfHash(Buffer.from(read(release, 'AGENTS.md'))));
    const appliedReceipt = read(client, RECEIPT);

    // Resuming and confirming activation rewrites no baseline.
    if (tool === 'codex') ok(native.humanInstall(client, catalogName(status(client).plugin.catalog_identity)));
    const resumed = node('update/plugin-setup.mjs', 'resume');
    ok(resumed);
    assert.match(resumed.stdout, /registered|complete/);
    ok(node('update/plugin-setup.mjs', 'verify', '--discovered'));
    assert.equal(status(client).plugin.setup_state, 'complete', JSON.stringify(status(client).plugin));
    assert.equal(read(client, RECEIPT), appliedReceipt);
    matchesDisk('after activation');

    // Restore brings back the installed files and their install baselines.
    ok(node('update/apply.mjs', 'restore', '--root', client, '--backup', report.backup));
    assert.deepEqual(matchesDisk('after restore'), installed);
  });
}

for (const tool of ['claude-code', 'codex']) {
  test(`${tool} update retires shipped Spec Kit files and keeps client edits`, t => {
    const { release, client } = journey(t, tool);
    // Spec Kit files only exist in harnesses from before receipts: such a harness has none.
    rmSync(join(client, 'status/installed-files.json'));
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
