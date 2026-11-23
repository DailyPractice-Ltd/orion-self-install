import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNativeClient, retirePlugin, setupPlugin, verifyPlugin } from '../update/plugin-native.mjs';

// Native CLIs are always stubbed: a fake `claude` / `codex` first on an otherwise empty PATH,
// and HOME pointed at an empty folder so no real install on this machine can be found.
const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'helpers/fake-native.mjs');
const VERSION = '9.8.7';
const CATALOG = 'orion-3f9c2a7e1b';
const SKILLS = ['hello', 'prospecting'];

function world(t, { tools = ['claude', 'codex'], faults = {}, state = {} } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'orion-native-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const bin = join(base, 'bin'); const home = join(base, 'home'); const root = join(base, 'Acme Orion');
  mkdirSync(bin); mkdirSync(home);
  for (const tool of tools) {
    if (process.platform === 'win32') {
      writeFileSync(join(bin, `${tool}.cmd`), `@"${process.execPath}" "${FAKE}" ${tool} %*\r\n`);
    } else {
      writeFileSync(join(bin, tool), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${tool} "$@"\n`);
      chmodSync(join(bin, tool), 0o755);
    }
  }
  const statePath = join(base, 'native-state.json');
  writeFileSync(statePath, JSON.stringify({ faults, ...state }));
  const put = (path, value) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(value)); };
  put('plugins/orion/plugin.json', { name: 'orion', version: VERSION });
  put('plugins/orion/.claude-plugin/plugin.json', { name: 'orion', version: VERSION });
  for (const skill of SKILLS) put(`plugins/orion/skills/${skill}/SKILL.md`, `${skill}\n`);
  put('.claude-plugin/marketplace.json', { name: CATALOG, owner: { name: 'Daily Practice' }, plugins: [{ name: 'orion', source: './plugins/orion' }] });
  put('.agents/plugins/marketplace.json', { name: CATALOG, plugins: [{ name: 'orion', source: { source: 'local', path: './plugins/orion' } }] });
  const env = { PATH: bin, HOME: home, USERPROFILE: home, FAKE_NATIVE_STATE: statePath, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT };
  const read = () => JSON.parse(readFileSync(statePath, 'utf8'));
  const write = (mutate) => { const s = read(); mutate(s); writeFileSync(statePath, JSON.stringify(s)); };
  const opts = (tool, extra = {}) => ({ root, tool, catalogName: CATALOG, version: VERSION, env, ...extra });
  return { base, root, bin, home, env, read, write, opts };
}

test('a missing native client leaves setup pending with an install instruction', (t) => {
  for (const tool of ['claude-code', 'codex']) {
    const w = world(t, { tools: [] });
    const result = setupPlugin(w.opts(tool));
    assert.equal(result.state, 'pending', tool);
    assert.match(result.remaining_action, tool === 'codex' ? /Codex/ : /Claude Code/);
    assert.match(result.remaining_action, tool === 'codex' ? /ORION_CODEX_BIN/ : /ORION_CLAUDE_BIN/);
    // Non-technical first: the reason in plain words before any program name or setting.
    assert.match(result.remaining_action, /^Orion's skills reach (Codex|Claude Code) through its plugin system, and (Codex|Claude Code) was not found on this computer\./);
  }
});

test('Claude Code: validate, register and install with local scope, then confirm by inspection', (t) => {
  const w = world(t);
  const result = setupPlugin(w.opts('claude-code'));
  assert.equal(result.state, 'complete', JSON.stringify(result));
  assert.equal(result.details.plugin_id, `orion@${CATALOG}`);
  assert.equal(result.details.version, VERSION);
  assert.equal(result.details.verified_by, `claude plugin list --json; claude plugin details orion@${CATALOG}`);
  assert.deepEqual(result.details.skills, SKILLS);
  const calls = w.read().calls.map((c) => c.args.join(' '));
  assert.deepEqual(calls, [
    `plugin validate ${join(w.root, 'plugins/orion')} --json`,
    `plugin validate ${w.root} --json`,
    'plugin marketplace list --json',
    `plugin marketplace add ${w.root} --scope local --json`,
    `plugin install orion@${CATALOG} --scope local --json`,
    'plugin list --json',
    `plugin details orion@${CATALOG}`,
  ]);
  assert.ok(w.read().calls.every((c) => c.cwd === w.root), 'every native call runs from the harness');
});

test('Claude Code: a re-run reaches the same state without a second registration', (t) => {
  const w = world(t);
  assert.equal(setupPlugin(w.opts('claude-code')).state, 'complete');
  assert.equal(setupPlugin(w.opts('claude-code')).state, 'complete');
  const { claude } = w.read();
  assert.deepEqual(Object.keys(claude.marketplaces), [CATALOG]);
  assert.deepEqual(claude.marketplaces[CATALOG].scopes, ['local'], 'never declared outside local scope');
  assert.equal(Object.keys(claude.installs).length, 1);
});

test('Claude Code: a catalog name already pointing at another folder is left alone', (t) => {
  const w = world(t, { state: { claude: { marketplaces: { [CATALOG]: { path: '/elsewhere/other-harness', scopes: ['local'] } }, installs: {} } } });
  const result = setupPlugin(w.opts('claude-code'));
  assert.equal(result.state, 'failed');
  assert.equal(result.details.reason, 'catalog_name_points_elsewhere');
  assert.equal(w.read().claude.marketplaces[CATALOG].path, '/elsewhere/other-harness');
  assert.ok(!w.read().calls.some((c) => ['add', 'install'].includes(c.args[1]) || c.args[2] === 'add'));
});

test('Claude Code: failed validation stops before anything is registered', (t) => {
  const w = world(t, { faults: { validate: true } });
  const result = setupPlugin(w.opts('claude-code'));
  assert.equal(result.state, 'failed');
  assert.equal(result.details.reason, 'validation_failed');
  assert.deepEqual(w.read().calls.map((c) => c.args[1]), ['validate']);
});

test('Claude Code: inspection that does not prove this harness package fails explicitly', (t) => {
  const cases = [
    [{ errors: ['Source path does not exist'] }, 'plugin_reports_errors'],
    [{ readFromFolder: '/elsewhere/plugins/orion' }, 'source_outside_harness_package'],
    [{ readFromFolder: null }, 'source_outside_harness_package'],
    [{ folderVersion: '0.0.1', version: '0.0.1' }, 'version_mismatch'],
  ];
  for (const [listOverride, reason] of cases) {
    const w = world(t, { faults: { listOverride } });
    const result = setupPlugin(w.opts('claude-code'));
    assert.equal(result.state, 'failed', reason);
    assert.equal(result.details.reason, reason);
  }
});

test('Claude Code: complete needs the native skill inventory to match the package', (t) => {
  const short = world(t, { faults: { detailsSkills: ['hello'] } });
  const partial = setupPlugin(short.opts('claude-code'));
  assert.equal(partial.state, 'pending', JSON.stringify(partial));
  assert.equal(partial.details.reason, 'skills_not_discovered');
  assert.deepEqual(partial.details.missing, ['prospecting']);
  assert.match(partial.remaining_action, /fresh Claude Code session/);

  const unloaded = world(t, { faults: { detailsFails: true } });
  const result = setupPlugin(unloaded.opts('claude-code'));
  assert.equal(result.state, 'pending', JSON.stringify(result));
  assert.equal(result.details.reason, 'skills_not_discovered');
});

test('Claude Code: an installed-but-disabled plugin is enabled in local scope only', (t) => {
  const w = world(t, { faults: { installDisabled: true } });
  const result = setupPlugin(w.opts('claude-code'));
  assert.equal(result.state, 'complete', JSON.stringify(result.details));
  const enable = w.read().calls.find((c) => c.args[1] === 'enable');
  assert.deepEqual(enable.args, ['plugin', 'enable', `orion@${CATALOG}`, '--scope', 'local', '--json']);
});

test('Claude Code: verify before install is pending with the exact install command', (t) => {
  const w = world(t);
  const result = verifyPlugin(w.opts('claude-code'));
  assert.equal(result.state, 'pending');
  assert.match(result.remaining_action, new RegExp(`claude plugin install orion@${CATALOG} --scope local`));
  assert.match(result.remaining_action, /fresh Claude Code session/);
});

test('a catalog file naming a different catalog is refused before any native call', (t) => {
  const w = world(t);
  const result = setupPlugin(w.opts('claude-code', { catalogName: 'orion-someone-else' }));
  assert.equal(result.state, 'failed');
  assert.equal(result.details.reason, 'catalog_identity_mismatch');
  assert.equal(w.read().calls, undefined);
});

const PROJECT_CONFIG = '.codex/config.toml';
const userConfig = (w) => join(w.home, '.codex/config.toml');
const project = (w) => readFileSync(join(w.root, PROJECT_CONFIG), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;
/** What a person does in Codex's Plugins Directory or /plugins: the fake copies the package into its cache. */
const humanInstall = (w) => spawnSync(process.execPath, [FAKE, 'codex', 'plugin', '__human-install', CATALOG], { cwd: w.root, env: w.env, encoding: 'utf8' });

test('Codex: setup registers the catalog in this folder\'s own Codex config, never user-wide, and leaves the install as the remaining action', (t) => {
  const w = world(t);
  mkdirSync(join(w.root, '.codex'));
  writeFileSync(join(w.root, PROJECT_CONFIG), '# mine\nmodel = "gpt-x"\n\n[mcp_servers.crm]\ncommand = "crm"\n');
  const result = setupPlugin(w.opts('codex'));
  assert.equal(result.state, 'pending', JSON.stringify(result));
  assert.equal(result.details.reason, 'not_installed');
  assert.match(result.remaining_action, /Plugins Directory/);
  assert.match(result.remaining_action, /\/plugins/);
  assert.match(result.remaining_action, /fresh chat/);
  assert.match(result.remaining_action, /search for "orion" and install Orion/);
  const text = project(w);
  assert.match(text, /^# mine\nmodel = "gpt-x"\n\n\[mcp_servers\.crm\]\ncommand = "crm"\n/, 'unrelated settings stay as written');
  assert.ok(text.includes(`[marketplaces."${CATALOG}"]\nsource_type = "local"\nsource = ${JSON.stringify(w.root)}`));
  assert.ok(text.includes(`[plugins."orion@${CATALOG}"]\nenabled = true`));
  assert.equal(existsSync(userConfig(w)), false, 'the user-wide Codex config is never written');
  const { codex, calls } = w.read();
  assert.equal(codex.adds, 0, 'no global marketplace add');
  assert.ok(!codex.forbiddenAdd, 'never installs the plugin unattended');
  assert.deepEqual(calls.map((c) => c.args.join(' ')), [
    'plugin marketplace list --json',
    'plugin marketplace list --json',
    'plugin list --json',
  ]);
});

test('Codex: a re-run keeps one set of Orion entries', (t) => {
  const w = world(t);
  setupPlugin(w.opts('codex'));
  const first = project(w);
  assert.equal(setupPlugin(w.opts('codex')).state, 'pending');
  assert.equal(project(w), first);
  assert.equal(count(project(w), `[marketplaces."${CATALOG}"]`), 1);
  assert.equal(count(project(w), `[plugins."orion@${CATALOG}"]`), 1);
});

test('Codex: an untrusted folder is pending with the trust step, not complete', (t) => {
  const w = world(t, { faults: { untrusted: true } });
  const result = setupPlugin(w.opts('codex'));
  assert.equal(result.state, 'pending', JSON.stringify(result));
  assert.equal(result.details.reason, 'project_not_trusted');
  assert.match(result.remaining_action, /trust/);
});

test('Codex: a catalog name already pointing at another folder is left alone', (t) => {
  const w = world(t, { state: { codex: { marketplaces: { [CATALOG]: '/elsewhere/other' }, installed: [], adds: 0 } } });
  const result = setupPlugin(w.opts('codex'));
  assert.equal(result.state, 'failed');
  assert.equal(result.details.reason, 'catalog_name_points_elsewhere');
  assert.equal(existsSync(join(w.root, PROJECT_CONFIG)), false);
  assert.equal(w.read().codex.adds, 0);
});

test('Codex: verify is complete only for a project-scoped install whose cached copy holds this release and every skill', (t) => {
  const w = world(t);
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'project_config_missing', 'verify changes nothing; resume writes the config');
  setupPlugin(w.opts('codex'));
  assert.equal(verifyPlugin(w.opts('codex')).state, 'pending', 'registration alone is not an install');

  assert.equal(humanInstall(w).status, 0);
  const done = verifyPlugin(w.opts('codex'));
  assert.equal(done.state, 'complete', JSON.stringify(done));
  assert.equal(done.details.version, VERSION);
  assert.equal(done.details.scope, 'project');
  assert.deepEqual(done.details.skills, SKILLS);
  assert.match(done.details.verified_by, /codex plugin list --json/);
  assert.match(done.details.verified_by, /cached copy/);
  assert.match(done.details.next, /fresh chat/);

  const cache = join(w.home, '.codex/plugins/cache', CATALOG, 'orion/local');
  writeFileSync(join(cache, 'plugin.json'), JSON.stringify({ name: 'orion', version: '0.0.1' }));
  const stale = verifyPlugin(w.opts('codex'));
  assert.equal(stale.state, 'pending', 'an outdated cached copy is a reinstall step, not a failure');
  assert.equal(stale.details.reason, 'cached_copy_outdated');
  assert.match(stale.remaining_action, /reinstall/);

  writeFileSync(join(cache, 'plugin.json'), JSON.stringify({ name: 'orion', version: VERSION }));
  rmSync(join(cache, 'skills/prospecting'), { recursive: true });
  const partial = verifyPlugin(w.opts('codex'));
  assert.equal(partial.details.reason, 'cached_copy_outdated');
  assert.deepEqual(partial.details.missing, ['prospecting']);

  rmSync(cache, { recursive: true });
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'version_unconfirmed');
});

test('Codex: a release version in the plugin list must match too', (t) => {
  const w = world(t);
  setupPlugin(w.opts('codex'));
  humanInstall(w);
  w.write((s) => { s.codex.installed[0].version = '0.0.1'; });
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'cached_copy_outdated');
  w.write((s) => { s.codex.installed[0].version = 'local'; s.codex.installed[0].enabled = false; });
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'disabled');
  w.write((s) => { s.codex.installed = [{ ...s.codex.installed[0], enabled: true, id: 'orion@orion-other', marketplace: 'orion-other' }]; });
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'not_installed');
});

test('Codex: Orion switched on in the user-wide Codex config is reported as a limitation, never complete', (t) => {
  const w = world(t, { faults: { userEnable: true } });
  setupPlugin(w.opts('codex'));
  humanInstall(w);
  const result = verifyPlugin(w.opts('codex'));
  assert.equal(result.state, 'pending', JSON.stringify(result));
  assert.equal(result.details.reason, 'enabled_user_wide');
  assert.match(result.remaining_action, /every folder/);
  assert.match(result.remaining_action, new RegExp(`orion@${CATALOG}`));
  assert.match(readFileSync(userConfig(w), 'utf8'), /enabled = true/, 'Orion never edits the user-wide config');
});

test('Codex: verify fails when the catalog name is registered from another folder', (t) => {
  const w = world(t);
  setupPlugin(w.opts('codex'));
  w.write((s) => { s.codex.marketplaces[CATALOG] = '/elsewhere/other'; s.faults = { untrusted: true }; });
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'catalog_name_points_elsewhere');
});

test('Claude Code: retire removes only this harness enablement and catalog, in local scope', (t) => {
  const w = world(t);
  setupPlugin(w.opts('claude-code'));
  w.write((s) => { s.claude.marketplaces.unrelated = { path: '/somewhere/else', scopes: ['user'] }; s.calls = []; });
  const result = retirePlugin(w.opts('claude-code'));
  assert.equal(result.state, 'complete', JSON.stringify(result));
  const { claude, calls } = w.read();
  assert.deepEqual(Object.keys(claude.marketplaces), ['unrelated']);
  assert.equal(Object.keys(claude.installs).length, 0);
  assert.equal(claude.removedUnscoped || 0, 0, 'never an unscoped marketplace remove');
  assert.deepEqual(calls.map((c) => c.args.join(' ')), [
    'plugin marketplace list --json',
    `plugin uninstall orion@${CATALOG} --scope local --json`,
    `plugin marketplace remove ${CATALOG} --scope local --json`,
  ]);
  assert.equal(retirePlugin(w.opts('claude-code')).state, 'complete', 'retiring twice is harmless');
});

test('Codex: retire removes only this harness plugin and its own config entries', (t) => {
  const w = world(t);
  mkdirSync(join(w.root, '.codex'));
  writeFileSync(join(w.root, PROJECT_CONFIG), 'model = "gpt-x"\n');
  setupPlugin(w.opts('codex'));
  humanInstall(w);
  w.write((s) => {
    s.codex.installed.push({ id: 'other@elsewhere', version: '1', installed: true });
    s.codex.marketplaces.elsewhere = '/somewhere/else';
    s.calls = [];
  });
  assert.equal(retirePlugin(w.opts('codex')).state, 'complete');
  const { codex, calls } = w.read();
  assert.deepEqual(codex.installed.map((p) => p.id), ['other@elsewhere']);
  assert.deepEqual(Object.keys(codex.marketplaces), ['elsewhere']);
  assert.equal(project(w), 'model = "gpt-x"\n');
  assert.ok(!calls.some((c) => c.args.join(' ').startsWith('plugin marketplace remove')), 'nothing user-wide to remove');
  assert.equal(retirePlugin(w.opts('codex')).state, 'complete', 'retiring twice is harmless');
});

test('Codex: retire also drops a user-wide registration of this catalog made from this folder', (t) => {
  const w = world(t);
  mkdirSync(join(w.home, '.codex'), { recursive: true });
  writeFileSync(userConfig(w), `[marketplaces."${CATALOG}"]\nsource_type = "local"\nsource = ${JSON.stringify(w.root)}\n`);
  w.write((s) => { s.codex = { marketplaces: { [CATALOG]: w.root }, installed: [], adds: 1 }; });
  assert.equal(retirePlugin(w.opts('codex')).state, 'complete');
  assert.ok(w.read().calls.some((c) => c.args.join(' ') === `plugin marketplace remove ${CATALOG} --json`));
});

test('retire refuses a catalog name registered from another folder', (t) => {
  for (const tool of ['claude-code', 'codex']) {
    const state = tool === 'codex'
      ? { codex: { marketplaces: { [CATALOG]: '/elsewhere/other' }, installed: [], adds: 0 } }
      : { claude: { marketplaces: { [CATALOG]: { path: '/elsewhere/other', scopes: ['local'] } }, installs: {} } };
    const w = world(t, { state });
    const result = retirePlugin(w.opts(tool));
    assert.equal(result.state, 'failed', tool);
    assert.equal(result.details.reason, 'catalog_name_points_elsewhere');
    assert.deepEqual(w.read().calls.map((c) => c.args[2]), ['list'], 'nothing removed');
  }
});

test('a catalog listed without a readable path is unverified, never a conflict', (t) => {
  for (const tool of ['claude-code', 'codex']) {
    const w = world(t, { faults: { listNoPath: true } });
    if (tool === 'codex') w.write((s) => { s.codex = { marketplaces: { [CATALOG]: w.root }, installed: [], adds: 0 }; });
    else w.write((s) => { s.claude = { marketplaces: { [CATALOG]: { path: w.root, scopes: ['local'] } }, installs: {} }; });
    const result = setupPlugin(w.opts(tool));
    assert.equal(result.state, 'pending', `${tool}: ${JSON.stringify(result)}`);
    assert.equal(result.details.reason, 'catalog_path_unverified');
    assert.ok(result.remaining_action);
  }
});

test('Codex: retire fails, and removes nothing, when the plugin list cannot be read', (t) => {
  const w = world(t);
  w.write((s) => { s.codex = { marketplaces: { [CATALOG]: w.root }, installed: [{ id: `orion@${CATALOG}`, version: VERSION }], adds: 0 }; s.faults = { codexListFails: true }; });
  const result = retirePlugin(w.opts('codex'));
  assert.equal(result.state, 'failed', JSON.stringify(result));
  assert.equal(result.details.reason, 'plugin_list_failed');
  assert.ok(!w.read().calls.some((c) => c.args.includes('remove')), 'nothing removed');
});

test('Claude Code bundled inside the desktop app is found when it is not on PATH', { skip: process.platform === 'win32' }, (t) => {
  const w = world(t, { tools: [] });
  const appBin = (v, b) => join(w.home, 'Library/Application Support/Claude/claude-code', v, b, 'claude.app/Contents/MacOS');
  for (const [v, b] of [['2.1.9', 'aaa'], ['2.1.328', 'bbb']]) {
    mkdirSync(appBin(v, b), { recursive: true });
    writeFileSync(join(appBin(v, b), 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" claude "$@"\n`);
    chmodSync(join(appBin(v, b), 'claude'), 0o755);
  }
  assert.equal(findNativeClient('claude-code', { env: w.env }), join(appBin('2.1.328', 'bbb'), 'claude'), 'newest bundled version wins');
  assert.equal(setupPlugin(w.opts('claude-code')).state, 'complete');
  assert.equal(findNativeClient('codex', { env: w.env }), null);
});

test('ORION_CLAUDE_BIN points at a client that is not on PATH', (t) => {
  const w = world(t);
  const env = { ...w.env, PATH: w.home, ORION_CLAUDE_BIN: join(w.bin, process.platform === 'win32' ? 'claude.cmd' : 'claude') };
  assert.equal(setupPlugin(w.opts('claude-code', { env })).state, 'complete');
});

test('Codex handoff explains exact catalog selection and scope correction before installation', t => {
  const w = world(t, { faults: { userEnable: true } });
  const handoff = setupPlugin(w.opts('codex'));
  assert.match(handoff.remaining_action, new RegExp(CATALOG));
  assert.ok(handoff.remaining_action.includes(`codex plugin add orion@${CATALOG} --json`));
  assert.ok(handoff.remaining_action.includes(userConfig(w)));
  assert.match(handoff.remaining_action, /delete.*\[plugins\./i);
  assert.match(handoff.remaining_action, /enabled = true/);
  assert.match(handoff.remaining_action, /verify/);
  humanInstall(w);
  assert.equal(verifyPlugin(w.opts('codex')).details.reason, 'enabled_user_wide');
  // Follow the handed-off scope correction; the project enablement remains on.
  writeFileSync(userConfig(w), '# unrelated user settings\n');
  assert.equal(verifyPlugin(w.opts('codex')).state, 'complete');
  assert.match(project(w), /enabled = true/);
});
