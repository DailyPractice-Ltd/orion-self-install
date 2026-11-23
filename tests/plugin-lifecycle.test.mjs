import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildCatalog, catalogName, MANIFEST_PATHS, pluginManifests } from '../update/plugin-package.mjs';
import { codexOwnedText } from '../update/plugin-registration.mjs';
import { runPluginSetup } from '../update/plugin-setup.mjs';
import { RECEIPT_PATH, receiptText } from '../update/receipt.mjs';
import { plainEnv } from './helpers/env.mjs';

// Coordinated update and restore for the Orion plugin (spec 008 acceptance #7); the tool
// switch's plugin tests are in tests/switch-ai.test.mjs.
// The native CLIs are the fake in tests/helpers/fake-native.mjs; HOME is a temp folder.
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = join(repo, 'update/apply.mjs');
const FAKE = join(repo, 'tests/helpers/fake-native.mjs');
const ID = '0b6f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const CATALOG = catalogName(ID);
const PLUGIN_ID = `orion@${CATALOG}`;
const hash = (body) => createHash('sha256').update(body).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const CATALOG_PATH = { 'claude-code': '.claude-plugin/marketplace.json', codex: '.agents/plugins/marketplace.json' };
const SKILLS = { 'claude-code': '.claude/skills', codex: '.agents/skills' };

function put(root, path, body) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); }
const get = (root, path) => readFileSync(join(root, path), 'utf8');
const has = (root, path) => existsSync(join(root, path));

function packageFiles(version, skills) {
  const files = {};
  for (const [path, value] of Object.entries(pluginManifests(version))) files[path] = json(value);
  for (const [name, body] of Object.entries(skills)) files[`plugins/orion/skills/${name}/SKILL.md`] = body;
  return files;
}
const V1 = packageFiles('1.0.0', { hello: 'hello v1\n', gone: 'gone v1\n' });
const V2 = packageFiles('2.0.0', { hello: 'hello v2\n', fresh: 'fresh v2\n' });

function manifestFor(version, files) {
  return {
    template_version: version,
    deployment: {
      tools: ['claude-code', 'codex'],
      common_sources: ['AGENTS.md', 'update/manifest.json', 'update/pristine.json'],
      entries: Object.keys(files).sort().map((source) => ({ source, ownership: 'release', fingerprint_key: source })),
    },
  };
}

/** A pinned release at 2.0.0 and a harness folder installed for `tool` at `version`. */
function world(t, { tool = 'claude-code', at = '1.0.0', faults = {}, codexInstalled = '1.0.0', receipt = false } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'orion-lifecycle-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const release = join(base, 'release'), client = join(base, 'Acme Orion'), home = join(base, 'home');
  mkdirSync(release); mkdirSync(client); mkdirSync(home);
  const manifest2 = manifestFor('2.0.0', V2);
  for (const [path, body] of Object.entries(V2)) put(release, path, body);
  put(release, 'AGENTS.md', 'agents v2\n');
  put(release, 'update/manifest.json', json(manifest2));
  // The frozen registry recognises everything the 1.0.0 harness was shipped with: it has no receipt.
  const pristine = { files: { 'AGENTS.md': [hash('agents v1\n')], 'update/manifest.json': [hash(json(manifestFor('1.0.0', V1)))] } };
  for (const [path, body] of Object.entries(V1)) pristine.files[path] = [hash(body)];
  put(release, 'update/pristine.json', json(pristine));
  execFileSync('git', ['init', '-q'], { cwd: release });
  execFileSync('git', ['add', '.'], { cwd: release });
  execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'release'], { cwd: release });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: release, encoding: 'utf8' }).trim();

  const pkg = at === '2.0.0' ? V2 : V1;
  for (const [path, body] of Object.entries(pkg)) put(client, path, body);
  put(client, 'AGENTS.md', at === '2.0.0' ? 'agents v2\n' : 'agents v1\n');
  put(client, 'update/manifest.json', json(at === '2.0.0' ? manifest2 : manifestFor('1.0.0', V1)));
  put(client, CATALOG_PATH[tool], json(buildCatalog(tool, ID)));
  put(client, `${SKILLS[tool]}/mine/SKILL.md`, 'my own skill\n');
  put(client, '.claude/settings.json', '{"theme":"mine"}\n');
  put(client, '.agents/other/notes.md', 'unrelated\n');
  put(client, 'knowledge-base/offer.md', 'our offer\n');
  put(client, 'status/status.json', json({
    template_version: at, ai_assistant: tool, notes: 'before',
    plugin: { catalog_identity: ID, setup_state: 'complete', remaining_action: null, verified_version: at, verified_at: '2026-11-01T00:00:00.000Z', pending_version: null, pending_switch: null },
  }));

  // The receipt an install leaves: every managed file it wrote and the generated catalog.
  if (receipt) {
    const files = {};
    for (const path of ['AGENTS.md', 'update/manifest.json', ...Object.keys(pkg)].sort()) files[path] = { key: path, hash: hash(get(client, path)), origin: 'release' };
    files[CATALOG_PATH[tool]] = { key: CATALOG_PATH[tool], hash: hash(get(client, CATALOG_PATH[tool])), origin: 'generated' };
    put(client, RECEIPT_PATH, receiptText({ schema: 'orion-installed-files', version: 1, algorithm: 'sha256-utf8-lf', ai_assistant: tool, template_version: at, recorded_by: 'install', recorded_at: '2026-11-01T00:00:00.000Z', files }));
  }

  // The native CLIs already know this harness for its tool, as a finished install left them.
  const statePath = join(base, 'native.json');
  const native = { faults, claude: { marketplaces: {}, installs: {} }, codex: { marketplaces: {}, installed: [], adds: 0 } };
  if (tool === 'claude-code') {
    native.claude.marketplaces[CATALOG] = { path: client, scopes: ['local'] };
    native.claude.installs[`${PLUGIN_ID}|${client}`] = { id: PLUGIN_ID, scope: 'local', enabled: true, projectPath: client };
  } else {
    // Codex: this folder's own project config, and the copy Codex loads from its cache.
    put(client, '.codex/config.toml', `model = "mine"\n\n${codexOwnedText(CATALOG, client)}\n`);
    if (codexInstalled) {
      const cached = join(home, '.codex/plugins/cache', CATALOG, 'orion/local');
      for (const [path, body] of Object.entries(codexInstalled === '2.0.0' ? V2 : V1)) put(cached, path.slice('plugins/orion/'.length), body);
      native.codex.installed = [{ id: PLUGIN_ID, name: 'orion', marketplace: CATALOG, version: 'local', installed: true, enabled: true }];
    }
  }
  writeFileSync(statePath, JSON.stringify(native));
  const bin = join(base, 'bin'); mkdirSync(bin);
  const extra = { FAKE_NATIVE_STATE: statePath, HOME: home, CODEX_HOME: join(home, '.codex') };
  for (const [name, envVar] of [['claude', 'ORION_CLAUDE_BIN'], ['codex', 'ORION_CODEX_BIN']]) {
    const file = join(bin, name);
    writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${name} "$@"\n`); chmodSync(file, 0o755);
    extra[envVar] = file;
  }
  const env = plainEnv(extra);
  const apply = (args, more = {}) => spawnSync(process.execPath, [APPLY, ...args], { encoding: 'utf8', env: { ...env, ...more }, cwd: client });
  return {
    base, release, client, commit, env, home,
    status: () => JSON.parse(get(client, 'status/status.json')),
    native: () => JSON.parse(readFileSync(statePath, 'utf8')),
    humanInstall: () => spawnSync(process.execPath, [FAKE, 'codex', 'plugin', '__human-install', CATALOG], { cwd: client, env, encoding: 'utf8' }),
    setNative: (change) => { const s = JSON.parse(readFileSync(statePath, 'utf8')); change(s); writeFileSync(statePath, JSON.stringify(s)); },
    update: (more) => apply(['update', '--root', client, '--release-repo', release, '--commit', commit], more),
    restore: (backup) => apply(['restore', '--root', client, '--backup', backup]),
    recover: () => apply(['recover', '--root', client]),
  };
}

const out = (run) => `${run.stdout}${run.stderr}`;
const report = (run) => JSON.parse(run.stdout);
const nativeCalls = (w) => (w.native().calls || []).map((c) => `${c.tool} ${c.args.join(' ')}`);

test('update replaces the package as a unit, keeps client skills and records the target as pending until discovery', async (t) => {
  const w = world(t);
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1 with my in-place edit\n');
  put(w.client, 'plugins/orion/skills/extra/SKILL.md', 'a file I dropped into the package\n');
  const catalogBefore = get(w.client, CATALOG_PATH['claude-code']);

  // This harness predates receipts: package bytes no release shipped stop the update before any change.
  const blocked = w.update();
  assert.equal(blocked.status, 2, out(blocked));
  assert.deepEqual(report(blocked).conflicts, [
    { path: 'plugins/orion/skills/extra/SKILL.md', reason: 'unknown' },
    { path: 'plugins/orion/skills/hello/SKILL.md', reason: 'unknown' },
  ]);
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v1\n');
  assert.equal(has(w.client, 'status/installed-files.json'), false);
  assert.equal(has(w.client, '.update-backup'), false);
  // The client moves the edit out: the shipped file goes back and the dropped-in one leaves.
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1\n');
  rmSync(join(w.client, 'plugins/orion/skills/extra'), { recursive: true });

  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const r = report(run);

  // The package is exactly the release's: no merged leftovers, no kept edits inside it.
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v2\n');
  assert.equal(get(w.client, 'plugins/orion/skills/fresh/SKILL.md'), 'fresh v2\n');
  assert.equal(has(w.client, 'plugins/orion/skills/gone'), false);
  assert.equal(has(w.client, 'plugins/orion/skills/extra'), false);
  assert.equal(JSON.parse(get(w.client, 'plugins/orion/.claude-plugin/plugin.json')).version, '2.0.0');
  assert.equal(JSON.parse(get(w.client, 'plugins/orion/plugin.json')).version, '2.0.0', 'existing dual-manifest installations retain both');
  // ...and the complete prior package is in the backup.
  assert.equal(get(w.client, `${r.backup}/package/plugins/orion/skills/hello/SKILL.md`), 'hello v1\n');
  assert.equal(get(w.client, `${r.backup}/package/plugins/orion/skills/gone/SKILL.md`), 'gone v1\n');
  assert.deepEqual(r.package.edits_backed_up, []);

  // Client-owned work and unrelated settings are untouched; the catalog keeps its identity.
  assert.equal(get(w.client, '.claude/skills/mine/SKILL.md'), 'my own skill\n');
  assert.equal(get(w.client, '.claude/settings.json'), '{"theme":"mine"}\n');
  assert.equal(get(w.client, 'knowledge-base/offer.md'), 'our offer\n');
  assert.equal(get(w.client, CATALOG_PATH['claude-code']), catalogBefore);
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v2\n');

  // The tool was refreshed through its own CLI; a stub's "ok" is registration, not discovery.
  assert.ok(nativeCalls(w).some((c) => c.startsWith(`claude plugin install ${PLUGIN_ID} --scope local`)));
  const { plugin, template_version } = w.status();
  assert.equal(template_version, '2.0.0');
  assert.equal(plugin.catalog_identity, ID);
  assert.equal(plugin.setup_state, 'registered');
  assert.equal(plugin.pending_version, '2.0.0');
  assert.equal(plugin.verified_version, '1.0.0', 'the last verified active release stays until discovery is confirmed');
  assert.equal(r.active, false);
  assert.equal(r.plugin.pending_version, '2.0.0');
  assert.match(r.plugin.remaining_action, /fresh Claude Code session/);
  assert.equal(JSON.parse(get(w.client, `${r.backup}/journal.json`)).state, 'complete');

  // Discovery confirmed in a fresh session makes the target the active release.
  const confirmed = await runPluginSetup(w.client, { mode: 'verify', discovered: true, env: w.env, home: w.home });
  assert.equal(confirmed.setup_state, 'complete');
  assert.equal(w.status().plugin.verified_version, '2.0.0');
  assert.equal(w.status().plugin.pending_version, null);
});

test('Codex update counts a stale cached copy as pending, and never runs a marketplace upgrade', (t) => {
  const w = world(t, { tool: 'codex' });
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const r = report(run);
  const { plugin } = w.status();
  assert.equal(plugin.setup_state, 'pending');
  assert.equal(plugin.pending_version, '2.0.0');
  assert.equal(plugin.verified_version, '1.0.0');
  assert.match(plugin.remaining_action, /reinstall|Plugins Directory|\/plugins/i);
  assert.equal(r.active, false);
  assert.equal(get(w.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
  assert.equal(get(w.client, '.agents/other/notes.md'), 'unrelated\n');
  for (const call of nativeCalls(w)) assert.doesNotMatch(call, /marketplace upgrade|codex plugin add/);
});

test('a confirmed native failure restores the previous package, catalog and status, and asks for a fresh check', (t) => {
  const w = world(t, { faults: { validate: true } });
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1\r\n');
  const run = w.update();
  assert.equal(run.status, 3, out(run));
  const r = report(run);
  assert.equal(r.state, 'rolled_back');
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1\r\n');
  assert.equal(has(w.client, 'status/installed-files.json'), false, 'a harness without a receipt has none again');
  assert.equal(get(w.client, 'plugins/orion/skills/gone/SKILL.md'), 'gone v1\n');
  assert.equal(has(w.client, 'plugins/orion/skills/fresh'), false);
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v1\n');
  const status = w.status();
  assert.equal(status.template_version, '1.0.0');
  assert.equal(status.plugin.catalog_identity, ID);
  assert.equal(status.plugin.setup_state, 'pending', 'recovery is not claimed before a fresh check');
  assert.match(status.plugin.remaining_action, /fresh .*session/i);
  assert.match(status.plugin.remaining_action, /verify --discovered/);
  assert.equal(JSON.parse(get(w.client, `${r.backup}/journal.json`)).state, 'rolled_back');
});

test('an interrupted update rolls the package back with the files', (t) => {
  for (const after of ['1', '2', '3']) {
    const w = world(t);
    const run = w.update({ ORION_UPDATE_FAIL_AFTER: after });
    assert.equal(run.status, 2, out(run));
    assert.match(run.stderr, /Injected update interruption/);
    assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1\n', `after ${after}`);
    assert.equal(has(w.client, 'plugins/orion/skills/fresh'), false);
    assert.equal(get(w.client, 'AGENTS.md'), 'agents v1\n');
    assert.equal(w.status().template_version, '1.0.0');
    assert.equal(w.status().plugin.pending_version, null);
    assert.equal(nativeCalls(w).length, 0, 'no native refresh after an interruption');
  }
});

test('a crashed update journal is recovered from its backup, but never over a concurrent edit', (t) => {
  const w = world(t);
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const { backup } = report(run);
  const journalPath = join(w.client, backup, 'journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  journal.state = 'pending'; writeFileSync(journalPath, JSON.stringify(journal));
  // The status changed after the crash (as runPluginSetup does); recovery restores only owned fields.
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'edited after the crash\n');
  const blocked = w.recover();
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /plugins\/orion/);
  assert.match(blocked.stderr, /Nothing was overwritten/);
  assert.match(blocked.stderr, /recover/);
  assert.match(blocked.stderr, /changed after the update, and putting the backup back would overwrite those changes/, 'the reason comes before the steps');
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'edited after the crash\n');
  assert.equal(w.status().template_version, '2.0.0');

  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v2\n');
  const recovered = w.recover();
  assert.equal(recovered.status, 0, out(recovered));
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1\n');
  assert.equal(get(w.client, 'plugins/orion/skills/gone/SKILL.md'), 'gone v1\n');
  assert.equal(w.status().template_version, '1.0.0');
});

test('restore puts the package and catalog back and says a fresh check is needed; a later package edit stops it', (t) => {
  const w = world(t);
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1\r\n');
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const { backup } = report(run);

  put(w.client, 'plugins/orion/skills/fresh/SKILL.md', 'edited after the update\n');
  const blocked = w.restore(backup);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /plugins\/orion/);
  assert.match(blocked.stderr, /client skill|\.claude\/skills/);
  assert.match(blocked.stderr, /putting the backup back would overwrite those changes/);
  assert.equal(get(w.client, 'plugins/orion/skills/fresh/SKILL.md'), 'edited after the update\n');
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v2\n', 'nothing restored before the conflict was found');
  assert.equal(w.status().template_version, '2.0.0');

  put(w.client, 'plugins/orion/skills/fresh/SKILL.md', 'fresh v2\n');
  rmSync(join(w.client, CATALOG_PATH['claude-code']));
  put(w.client, '.claude/skills/later/SKILL.md', 'made after the update\n');
  const restored = w.restore(backup);
  assert.equal(restored.status, 0, out(restored));
  const r = report(restored);
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1\r\n');
  assert.equal(has(w.client, 'plugins/orion/skills/fresh'), false);
  assert.equal(JSON.parse(get(w.client, CATALOG_PATH['claude-code'])).name, CATALOG);
  assert.equal(get(w.client, '.claude/skills/later/SKILL.md'), 'made after the update\n');
  assert.equal(r.reload_required, true);
  assert.match(r.remaining_action, /verify --discovered/);
  const { plugin, template_version } = w.status();
  assert.equal(template_version, '1.0.0');
  assert.equal(plugin.setup_state, 'pending');
  assert.equal(plugin.pending_version, '1.0.0');
  assert.equal(plugin.catalog_identity, ID);
});

test('a pending update whose later check fails confirmedly names the restore that puts the previous release back', async (t) => {
  const w = world(t);
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const { backup } = report(run);
  assert.equal(w.status().plugin.update_backup, backup);

  w.setNative((s) => { s.faults = { listOverride: { errors: ['Source path does not exist'] } }; });
  const checked = await runPluginSetup(w.client, { mode: 'verify', env: w.env, home: w.home });
  assert.equal(checked.setup_state, 'failed');
  const { plugin } = w.status();
  assert.equal(plugin.setup_state, 'failed');
  assert.match(plugin.remaining_action, /^Orion 2\.0\.0 could not be confirmed/, 'the reason comes first, in plain words');
  assert.ok(plugin.remaining_action.includes(`node update/apply.mjs restore --root . --backup ${backup}`), plugin.remaining_action);
  assert.match(plugin.remaining_action, /1\.0\.0/);

  w.setNative((s) => { s.faults = {}; });
  const confirmed = await runPluginSetup(w.client, { mode: 'verify', discovered: true, env: w.env, home: w.home });
  assert.equal(confirmed.setup_state, 'complete');
  assert.equal(w.status().plugin.update_backup, null, 'a confirmed release needs no way back');
});

test('restore and recovery write status only under the shared status lock', (t) => {
  const w = world(t);
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const { backup } = report(run);
  const before = get(w.client, 'status/status.json');
  // Another Orion command (the radio, a scheduled run) holds the status lock.
  mkdirSync(join(w.client, 'status/.radio-lock'));
  const blocked = w.restore(backup);
  assert.equal(blocked.status, 2, out(blocked));
  assert.match(blocked.stderr, /Status is locked/);
  assert.equal(get(w.client, 'status/status.json'), before);
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v2\n', 'nothing restored without the lock');
  rmSync(join(w.client, 'status/.radio-lock'), { recursive: true });
  assert.equal(w.restore(backup).status, 0);
  assert.equal(w.status().template_version, '1.0.0');
});

const SETTINGS = '.claude/settings.local.json';
const priorSettings = (client) => ({
  extraKnownMarketplaces: { [CATALOG]: { source: { source: 'directory', path: client }, autoUpdate: false } },
  enabledPlugins: { [PLUGIN_ID]: true, 'other@elsewhere': true },
  permissions: { allow: ['Bash(ls)'] },
});

test('a failed plugin refresh puts back this harness\'s own Claude Code registration entries and keeps the rest', (t) => {
  const w = world(t, { faults: { listOverride: { errors: ['Source path does not exist'] } } });
  put(w.client, SETTINGS, json(priorSettings(w.client)));
  const run = w.update();
  assert.equal(run.status, 3, out(run));
  const r = report(run);
  assert.equal(r.state, 'rolled_back');
  assert.deepEqual(JSON.parse(get(w.client, SETTINGS)), priorSettings(w.client));
  assert.ok(has(w.client, `${r.backup}/registration.json`), 'the registration state is in the backup');
});

test('restoring an update puts back the Claude Code registration entries; later unrelated settings stay', (t) => {
  const w = world(t);
  put(w.client, SETTINGS, json(priorSettings(w.client)));
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const after = JSON.parse(get(w.client, SETTINGS));
  assert.equal(after.extraKnownMarketplaces[CATALOG].autoUpdate, undefined, 'the refresh re-declared the catalog');
  after.later = { mine: true };
  put(w.client, SETTINGS, json(after));
  const restored = w.restore(report(run).backup);
  assert.equal(restored.status, 0, out(restored));
  assert.deepEqual(JSON.parse(get(w.client, SETTINGS)), { ...priorSettings(w.client), later: { mine: true } });
});

test('a failed plugin refresh puts back this harness\'s own Codex project entries exactly', (t) => {
  const w = world(t, { tool: 'codex', faults: { codexListFails: true } });
  const prior = `model = "mine"\n\n[marketplaces."${CATALOG}"]\n# pinned by me\nsource_type = "local"\nsource = ${JSON.stringify(w.client)}\n\n[plugins."${PLUGIN_ID}"]\nenabled = true\n`;
  put(w.client, '.codex/config.toml', prior);
  const run = w.update();
  assert.equal(run.status, 3, out(run));
  assert.equal(report(run).state, 'rolled_back');
  assert.equal(get(w.client, '.codex/config.toml'), prior);
});

for (const tool of ['codex', 'claude-code']) test(`update preserves the ${tool} manifest layout and restore recovers it`, (t) => {
  const w = world(t, { tool, at: '2.0.0', codexInstalled: '2.0.0' });
  const other = tool === 'codex' ? 'claude-code' : 'codex';
  rmSync(join(w.client, MANIFEST_PATHS[other]));
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1\n'); // an older shipped version
  const result = w.update();
  assert.equal(result.status, 0, out(result));
  assert.equal(has(w.client, MANIFEST_PATHS[other]), false);
  assert.ok(has(w.client, MANIFEST_PATHS[tool]));
  assert.equal(w.status().plugin.setup_state, 'registered');
  assert.equal(w.restore(report(result).backup).status, 0);
  assert.equal(has(w.client, MANIFEST_PATHS[other]), false);
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1\n');
});

test('setup EPERM after files commit reports activation pending and survives an update retry', t => {
  const w = world(t, { tool: 'codex' });
  // Force a registration write only after files have committed.
  put(w.client, '.codex/config.toml', 'model = "mine"\n');
  const result = w.update({ NODE_OPTIONS: `--import=${new URL('./helpers/update-permissions.mjs', import.meta.url).href}`, TEST_DENY_SETUP: '1' });
  assert.equal(result.status, 0, out(result));
  const r = report(result);
  assert.equal(r.files_applied, true);
  assert.equal(r.activation_pending, true);
  assert.equal(r.state, 'pending_activation');
  assert.equal(r.active, false);
  assert.equal(r.reason, 'EPERM');
  assert.ok(r.backup);
  assert.equal(w.status().template_version, '2.0.0');
  assert.equal(w.status().plugin.pending_version, '2.0.0');
  assert.equal(w.status().plugin.update_backup, r.backup);
  assert.equal(JSON.parse(get(w.client, `${r.backup}/journal.json`)).state, 'complete');
  const retry = w.update();
  assert.equal(retry.status, 0, out(retry));
  const again = report(retry);
  assert.equal(again.up_to_date, false);
  assert.equal(again.files_up_to_date, true);
  assert.equal(again.activation_pending, true);
  assert.equal(again.backup, r.backup);
  assert.match(again.plugin.remaining_action, /resume/);
  assert.equal(w.restore(r.backup).status, 0);
});

test('preflight reports both protected destinations before replacing release files', t => {
  const w = world(t, { tool: 'codex' });
  rmSync(join(w.client, '.codex'), { recursive: true });
  const before = get(w.client, 'status/status.json');
  const result = w.update({ NODE_OPTIONS: `--import=${new URL('./helpers/update-permissions.mjs', import.meta.url).href}`, TEST_DENY_PREFLIGHT: '1' });
  assert.equal(result.status, 2, out(result));
  const r = report(result);
  assert.equal(r.state, 'preflight_failed');
  assert.equal(r.files_applied, false);
  assert.ok(r.permissions.some(p => p.path.startsWith('.agents/')));
  assert.ok(r.permissions.some(p => p.path.startsWith('.codex/')));
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v1\n');
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1\n');
  assert.equal(get(w.client, 'status/status.json'), before);
  assert.equal(has(w.client, '.update-backup'), false);
  assert.equal(has(w.client, '.codex'), false, 'temporary preflight directories are cleaned up');
  assert.equal(nativeCalls(w).length, 0);
});

// ── Plugin activation and the installed-file receipt ──────────────────────────
// Whatever activation does, the receipt describes the files on disk: the applied ones
// while activation waits or succeeds, the previous ones once a failure puts them back.
const PERMISSIONS = new URL('./helpers/update-permissions.mjs', import.meta.url).href;
const receiptOf = (w) => JSON.parse(get(w.client, RECEIPT_PATH));
const CLIENT_OWNED = /^(status\/status\.json|knowledge-base\/|\.claude\/settings|\.codex\/|\.claude\/skills\/|\.agents\/skills\/|\.agents\/other\/)/;

/** The receipt names `tool`, claims every package file and the catalog, and each claim matches the disk (`edited` paths aside). */
function aligned(w, tool, { edited = [] } = {}) {
  const receipt = receiptOf(w);
  assert.equal(receipt.ai_assistant, tool);
  for (const [path, entry] of Object.entries(receipt.files)) {
    assert.doesNotMatch(path, CLIENT_OWNED, `${path} is the client's, never a managed file`);
    if (edited.includes(path)) assert.notEqual(hash(get(w.client, path)), entry.hash, `${path} reads as edited`);
    else assert.equal(hash(get(w.client, path)), entry.hash, `${path} is recorded as it is`);
  }
  const onDisk = (dir) => readdirSync(join(w.client, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? onDisk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  for (const path of onDisk('plugins/orion')) assert.ok(receipt.files[path], `${path} is claimed`);
  for (const path of Object.keys(receipt.files).filter((p) => p.startsWith('plugins/orion/'))) assert.ok(has(w.client, path), `${path} is on disk`);
  assert.equal(receipt.files[CATALOG_PATH[tool]]?.origin, 'generated');
  return receipt;
}
const clientFiles = (w, tool) => [`${SKILLS[tool]}/mine/SKILL.md`, '.claude/settings.json', '.agents/other/notes.md', 'knowledge-base/offer.md'].map((p) => get(w.client, p));

for (const tool of ['claude-code', 'codex']) {
  test(`${tool}: activation left pending keeps the applied receipt, resuming it advances nothing, and restore puts the prior baselines back`, async (t) => {
    const w = world(t, { tool, receipt: true });
    const installed = receiptOf(w), mine = clientFiles(w, tool);
    // The sandbox refuses the catalog write the activation makes after the files committed.
    const run = w.update({ NODE_OPTIONS: `--import=${PERMISSIONS}`, TEST_DENY_CATALOG: '1' });
    assert.equal(run.status, 0, out(run));
    const r = report(run);
    assert.equal(r.state, 'pending_activation');
    assert.equal(r.files_applied, true);
    let receipt = aligned(w, tool);
    assert.equal(receipt.template_version, '2.0.0');
    assert.equal(receipt.files['plugins/orion/skills/fresh/SKILL.md'].hash, hash('fresh v2\n'));
    assert.equal(receipt.files['plugins/orion/skills/gone/SKILL.md'], undefined);
    assert.equal(receipt.files['AGENTS.md'].hash, hash('agents v2\n'));
    const applied = get(w.client, RECEIPT_PATH);

    // The client edits an ordinary file and finishes activation: no baseline moves.
    put(w.client, 'AGENTS.md', 'agents v2 with my note\n');
    rmSync(join(w.client, CATALOG_PATH[tool]));
    const resumed = await runPluginSetup(w.client, { mode: 'setup', env: w.env, home: w.home });
    assert.notEqual(resumed.setup_state, 'failed', JSON.stringify(resumed));
    assert.equal(get(w.client, RECEIPT_PATH), applied, 'activation never rewrites the receipt');
    aligned(w, tool, { edited: ['AGENTS.md'] });
    const retry = w.update();
    assert.equal(retry.status, 0, out(retry));
    assert.equal(report(retry).files_up_to_date, true);
    assert.equal(get(w.client, RECEIPT_PATH), applied);

    // Restore: the restored files take back their install baselines; the kept edit keeps the update's.
    const restored = w.restore(r.backup);
    assert.equal(restored.status, 0, out(restored));
    assert.ok(report(restored).kept.includes('AGENTS.md'));
    assert.equal(get(w.client, 'AGENTS.md'), 'agents v2 with my note\n');
    receipt = aligned(w, tool, { edited: ['AGENTS.md'] });
    assert.equal(receipt.template_version, '1.0.0');
    assert.equal(receipt.files['AGENTS.md'].hash, hash('agents v2\n'));
    for (const [path, entry] of Object.entries(installed.files)) if (path !== 'AGENTS.md') assert.deepEqual(receipt.files[path], entry, path);
    assert.equal(receipt.files['plugins/orion/skills/fresh/SKILL.md'], undefined);

    // A later update finds the same evidence: the package updates, the edit stays.
    const again = w.update();
    assert.equal(again.status, 0, out(again));
    assert.ok(report(again).kept.includes('AGENTS.md'));
    assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v2\n');
    aligned(w, tool, { edited: ['AGENTS.md'] });
    assert.deepEqual(clientFiles(w, tool), mine);
  });

  test(`${tool}: successful activation leaves the receipt as the update wrote it, and a restore and later update stay aligned`, async (t) => {
    const w = world(t, { tool, receipt: true });
    const installed = receiptOf(w), mine = clientFiles(w, tool);
    const run = w.update();
    assert.equal(run.status, 0, out(run));
    const r = report(run);
    aligned(w, tool);
    const applied = get(w.client, RECEIPT_PATH);
    if (tool === 'codex') assert.equal(w.humanInstall().status, 0);
    const resumed = await runPluginSetup(w.client, { mode: 'setup', env: w.env, home: w.home });
    assert.equal(resumed.setup_state, 'registered', JSON.stringify(resumed));
    const confirmed = await runPluginSetup(w.client, { mode: 'verify', discovered: true, env: w.env, home: w.home });
    assert.equal(confirmed.setup_state, 'complete');
    assert.equal(get(w.client, RECEIPT_PATH), applied, 'activation never rewrites the receipt');
    aligned(w, tool);
    assert.deepEqual(clientFiles(w, tool), mine);

    const restored = w.restore(r.backup);
    assert.equal(restored.status, 0, out(restored));
    const receipt = aligned(w, tool);
    assert.deepEqual(receipt.files, installed.files, 'every file came back, and so did every baseline');
    const again = w.update();
    assert.equal(again.status, 0, out(again));
    assert.equal(receiptOf(w).template_version, '2.0.0');
    aligned(w, tool);
  });

  test(`${tool}: a confirmed activation failure (exit 3) puts back the receipt with the files, and a later update is aligned`, (t) => {
    const w = world(t, { tool, receipt: true, faults: tool === 'codex' ? { codexListFails: true } : { validate: true } });
    const before = get(w.client, RECEIPT_PATH);
    const run = w.update();
    assert.equal(run.status, 3, out(run));
    assert.equal(report(run).state, 'rolled_back');
    assert.equal(get(w.client, RECEIPT_PATH), before, 'the receipt is the one from before the update');
    assert.equal(get(w.client, 'plugins/orion/skills/gone/SKILL.md'), 'gone v1\n');
    aligned(w, tool);

    w.setNative((s) => { s.faults = {}; });
    const again = w.update();
    assert.equal(again.status, 0, out(again));
    assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v2\n');
    assert.equal(receiptOf(w).template_version, '2.0.0');
    aligned(w, tool);
  });
}
