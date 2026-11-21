import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildCatalog, catalogName, pluginManifests } from '../update/plugin-package.mjs';
import { runPluginSetup } from '../update/plugin-setup.mjs';
import { plainEnv } from './helpers/env.mjs';

// Coordinated update, restore and tool switch for the Orion plugin (spec 008 acceptance #7).
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
function world(t, { tool = 'claude-code', at = '1.0.0', faults = {}, codexInstalled = '1.0.0' } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'orion-lifecycle-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const release = join(base, 'release'), client = join(base, 'Acme Orion'), home = join(base, 'home');
  mkdirSync(release); mkdirSync(client); mkdirSync(home);
  const manifest2 = manifestFor('2.0.0', V2);
  for (const [path, body] of Object.entries(V2)) put(release, path, body);
  put(release, 'AGENTS.md', 'agents v2\n');
  put(release, 'update/manifest.json', json(manifest2));
  const pristine = { files: { 'AGENTS.md': [hash('agents v1\n')] } };
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

  // The native CLIs already know this harness for its tool, as a finished install left them.
  const statePath = join(base, 'native.json');
  const native = { faults, claude: { marketplaces: {}, installs: {} }, codex: { marketplaces: {}, installed: [], adds: 0 } };
  if (tool === 'claude-code') {
    native.claude.marketplaces[CATALOG] = { path: client, scopes: ['local'] };
    native.claude.installs[`${PLUGIN_ID}|${client}`] = { id: PLUGIN_ID, scope: 'local', enabled: true, projectPath: client };
  } else {
    native.codex.marketplaces[CATALOG] = client;
    if (codexInstalled) native.codex.installed = [{ id: PLUGIN_ID, name: 'orion', marketplace: CATALOG, version: codexInstalled, installed: true, enabled: true }];
  }
  writeFileSync(statePath, JSON.stringify(native));
  const bin = join(base, 'bin'); mkdirSync(bin);
  const extra = { FAKE_NATIVE_STATE: statePath, HOME: home };
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
    setNative: (change) => { const s = JSON.parse(readFileSync(statePath, 'utf8')); change(s); writeFileSync(statePath, JSON.stringify(s)); },
    update: (more) => apply(['update', '--root', client, '--release-repo', release, '--commit', commit], more),
    switchTo: (to, more) => apply(['switch', '--root', client, '--release-repo', release, '--commit', commit, '--to', to], more),
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

  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const r = report(run);

  // The package is exactly the release's: no merged leftovers, no kept edits inside it.
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v2\n');
  assert.equal(get(w.client, 'plugins/orion/skills/fresh/SKILL.md'), 'fresh v2\n');
  assert.equal(has(w.client, 'plugins/orion/skills/gone'), false);
  assert.equal(has(w.client, 'plugins/orion/skills/extra'), false);
  assert.equal(JSON.parse(get(w.client, 'plugins/orion/.claude-plugin/plugin.json')).version, '2.0.0');
  // ...and the complete prior package, in-place edits included, is in the backup.
  assert.equal(get(w.client, `${r.backup}/package/plugins/orion/skills/hello/SKILL.md`), 'hello v1 with my in-place edit\n');
  assert.equal(get(w.client, `${r.backup}/package/plugins/orion/skills/extra/SKILL.md`), 'a file I dropped into the package\n');
  assert.deepEqual(r.package.edits_backed_up.sort(), ['plugins/orion/skills/extra/SKILL.md', 'plugins/orion/skills/hello/SKILL.md']);

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
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1 with my in-place edit\n');
  const run = w.update();
  assert.equal(run.status, 3, out(run));
  const r = report(run);
  assert.equal(r.state, 'rolled_back');
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1 with my in-place edit\n');
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
  put(w.client, 'plugins/orion/skills/hello/SKILL.md', 'hello v1 with my in-place edit\n');
  const run = w.update();
  assert.equal(run.status, 0, out(run));
  const { backup } = report(run);

  put(w.client, 'plugins/orion/skills/fresh/SKILL.md', 'edited after the update\n');
  const blocked = w.restore(backup);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /plugins\/orion/);
  assert.match(blocked.stderr, /client skill|\.claude\/skills/);
  assert.equal(get(w.client, 'plugins/orion/skills/fresh/SKILL.md'), 'edited after the update\n');
  assert.equal(get(w.client, 'AGENTS.md'), 'agents v2\n', 'nothing restored before the conflict was found');
  assert.equal(w.status().template_version, '2.0.0');

  put(w.client, 'plugins/orion/skills/fresh/SKILL.md', 'fresh v2\n');
  rmSync(join(w.client, CATALOG_PATH['claude-code']));
  put(w.client, '.claude/skills/later/SKILL.md', 'made after the update\n');
  const restored = w.restore(backup);
  assert.equal(restored.status, 0, out(restored));
  const r = report(restored);
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v1 with my in-place edit\n');
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

test('switch to Codex waits for the native install as a pending switch, then commits and retires only Claude Code\'s Orion', (t) => {
  const w = world(t, { at: '2.0.0' });
  const pending = w.switchTo('codex');
  assert.equal(pending.status, 0, out(pending));
  assert.equal(report(pending).state, 'pending_switch');
  let status = w.status();
  assert.equal(status.ai_assistant, 'claude-code', 'the selected tool does not change before the target is installed');
  assert.equal(status.plugin.pending_switch.to, 'codex');
  assert.match(status.plugin.pending_switch.remaining_action, /\/plugins/);
  assert.equal(JSON.parse(get(w.client, CATALOG_PATH.codex)).name, CATALOG);
  assert.ok(has(w.client, CATALOG_PATH['claude-code']));
  assert.equal(get(w.client, '.claude/skills/mine/SKILL.md'), 'my own skill\n');
  assert.ok(!nativeCalls(w).some((c) => c.startsWith('claude plugin uninstall')));
  assert.equal(w.native().codex.marketplaces[CATALOG], w.client);

  // The human installs Orion in Codex; running the same switch again finishes it.
  w.setNative((s) => { s.codex.installed = [{ id: PLUGIN_ID, name: 'orion', marketplace: CATALOG, version: '2.0.0', installed: true, enabled: true }]; });
  const done = w.switchTo('codex');
  assert.equal(done.status, 0, out(done));
  assert.equal(report(done).state, 'switched');
  status = w.status();
  assert.equal(status.ai_assistant, 'codex');
  assert.equal(status.plugin.pending_switch, null);
  assert.equal(status.plugin.catalog_identity, ID);
  assert.equal(status.plugin.setup_state, 'registered');
  assert.equal(get(w.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
  assert.equal(has(w.client, '.claude/skills/mine'), false);
  assert.equal(has(w.client, CATALOG_PATH['claude-code']), false);
  assert.equal(get(w.client, '.claude/settings.json'), '{"theme":"mine"}\n', 'unrelated settings stay');
  assert.equal(get(w.client, '.agents/other/notes.md'), 'unrelated\n');
  assert.equal(get(w.client, 'plugins/orion/skills/hello/SKILL.md'), 'hello v2\n', 'the same package serves both tools');
  const calls = nativeCalls(w);
  assert.ok(calls.includes(`claude plugin uninstall ${PLUGIN_ID} --scope local --json`));
  assert.ok(calls.includes(`claude plugin marketplace remove ${CATALOG} --scope local --json`));
  assert.equal(w.native().claude.removedUnscoped || 0, 0);
  assert.deepEqual(w.native().claude.installs, {});
});

test('switch to Claude Code commits once its own CLI lists Orion for this folder', (t) => {
  const w = world(t, { tool: 'codex', at: '2.0.0', codexInstalled: '2.0.0' });
  const run = w.switchTo('claude-code');
  assert.equal(run.status, 0, out(run));
  assert.equal(report(run).state, 'switched');
  const status = w.status();
  assert.equal(status.ai_assistant, 'claude-code');
  assert.equal(status.plugin.setup_state, 'registered');
  assert.equal(status.plugin.pending_version, '2.0.0');
  assert.equal(get(w.client, '.claude/skills/mine/SKILL.md'), 'my own skill\n');
  assert.equal(has(w.client, CATALOG_PATH.codex), false);
  assert.equal(get(w.client, '.agents/other/notes.md'), 'unrelated\n', 'only Orion-owned items leave .agents');
  assert.ok(nativeCalls(w).includes(`codex plugin marketplace remove ${CATALOG} --json`));
  assert.deepEqual(w.native().codex.installed, []);
});

test('a failed target setup restores the previous tool\'s state; an interrupted commit rolls back', (t) => {
  const failed = world(t, { tool: 'codex', at: '2.0.0', codexInstalled: '2.0.0', faults: { validate: true } });
  const run = failed.switchTo('claude-code');
  assert.equal(run.status, 3, out(run));
  assert.equal(report(run).state, 'rolled_back');
  assert.equal(failed.status().ai_assistant, 'codex');
  assert.equal(failed.status().plugin.pending_switch, null);
  assert.equal(has(failed.client, CATALOG_PATH['claude-code']), false);
  assert.ok(has(failed.client, CATALOG_PATH.codex));
  assert.equal(get(failed.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
  assert.ok(!nativeCalls(failed).some((c) => c.startsWith('codex plugin remove') || c.startsWith('codex plugin marketplace remove')));

  const torn = world(t, { tool: 'codex', at: '2.0.0', codexInstalled: '2.0.0' });
  const interrupted = torn.switchTo('claude-code', { ORION_SWITCH_FAIL_AFTER: '2' });
  assert.equal(interrupted.status, 2, out(interrupted));
  assert.match(interrupted.stderr, /Injected switch interruption/);
  assert.equal(torn.status().ai_assistant, 'codex');
  assert.equal(torn.status().plugin.pending_switch, null);
  assert.equal(has(torn.client, CATALOG_PATH['claude-code']), false);
  assert.ok(has(torn.client, CATALOG_PATH.codex));
  assert.equal(get(torn.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
  assert.equal(has(torn.client, '.claude/skills/mine'), false);
  assert.ok(!nativeCalls(torn).some((c) => c.startsWith('codex plugin remove')));
});

test('restoring a completed switch brings back the old catalog and asks for re-registration and a fresh check', (t) => {
  const w = world(t, { tool: 'codex', at: '2.0.0', codexInstalled: '2.0.0' });
  const run = w.switchTo('claude-code');
  assert.equal(run.status, 0, out(run));
  const restored = w.restore(report(run).backup);
  assert.equal(restored.status, 0, out(restored));
  const r = report(restored);
  assert.equal(r.reload_required, true);
  assert.match(r.remaining_action, /plugin-setup\.mjs resume/);
  const status = w.status();
  assert.equal(status.ai_assistant, 'codex');
  assert.equal(status.plugin.setup_state, 'pending');
  assert.equal(status.plugin.catalog_identity, ID);
  assert.equal(JSON.parse(get(w.client, CATALOG_PATH.codex)).name, CATALOG);
  assert.equal(has(w.client, CATALOG_PATH['claude-code']), false);
  assert.equal(get(w.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
});
