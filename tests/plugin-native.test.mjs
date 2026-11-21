import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findNativeClient, retirePlugin, setupPlugin, verifyPlugin } from '../update/plugin-native.mjs';

// Native CLIs are always stubbed: a fake `claude` / `codex` first on an otherwise empty PATH,
// and HOME pointed at an empty folder so no real install on this machine can be found.
const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'helpers/fake-native.mjs');
const VERSION = '9.8.7';
const CATALOG = 'orion-3f9c2a7e1b';

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
  }
});

test('Claude Code: validate, register and install with local scope, then confirm by inspection', (t) => {
  const w = world(t);
  const result = setupPlugin(w.opts('claude-code'));
  assert.equal(result.state, 'complete', JSON.stringify(result));
  assert.equal(result.details.plugin_id, `orion@${CATALOG}`);
  assert.equal(result.details.version, VERSION);
  assert.equal(result.details.verified_by, 'claude plugin list --json');
  const calls = w.read().calls.map((c) => c.args.join(' '));
  assert.deepEqual(calls, [
    `plugin validate ${join(w.root, 'plugins/orion')} --json`,
    `plugin validate ${w.root} --json`,
    'plugin marketplace list --json',
    `plugin marketplace add ${w.root} --scope local --json`,
    `plugin install orion@${CATALOG} --scope local --json`,
    'plugin list --json',
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

test('Codex: registration prepares the catalog and leaves install + fresh chat as the remaining action', (t) => {
  const w = world(t);
  const result = setupPlugin(w.opts('codex'));
  assert.equal(result.state, 'pending', JSON.stringify(result));
  assert.match(result.remaining_action, /Plugins Directory/);
  assert.match(result.remaining_action, /\/plugins/);
  assert.match(result.remaining_action, /fresh chat/);
  assert.match(result.remaining_action, new RegExp(CATALOG));
  const { codex, calls } = w.read();
  assert.equal(codex.marketplaces[CATALOG], w.root);
  assert.ok(!codex.forbiddenAdd, 'never installs the plugin unattended');
  assert.deepEqual(calls.map((c) => c.args.join(' ')), [
    'plugin marketplace list --json',
    `plugin marketplace add ${w.root} --json`,
    'plugin marketplace list --json',
    'plugin list --json',
  ]);
});

test('Codex: a re-run does not register the catalog twice', (t) => {
  const w = world(t);
  setupPlugin(w.opts('codex'));
  assert.equal(setupPlugin(w.opts('codex')).state, 'pending');
  assert.equal(w.read().codex.adds, 1);
});

test('Codex: a catalog name already pointing at another folder is left alone', (t) => {
  const w = world(t, { state: { codex: { marketplaces: { [CATALOG]: '/elsewhere/other' }, installed: [], adds: 0 } } });
  const result = setupPlugin(w.opts('codex'));
  assert.equal(result.state, 'failed');
  assert.equal(result.details.reason, 'catalog_name_points_elsewhere');
  assert.equal(w.read().codex.adds, 0);
});

test('Codex: verify is complete only when the plugin list shows this harness install at the expected version', (t) => {
  const installed = (extra = {}) => ({ id: `orion@${CATALOG}`, name: 'orion', marketplace: CATALOG, version: VERSION, installed: true, enabled: true, ...extra });
  const w = world(t);
  setupPlugin(w.opts('codex'));
  assert.equal(verifyPlugin(w.opts('codex')).state, 'pending', 'registration alone is not an install');
  w.write((s) => { s.codex.installed = [installed({ version: '0.0.1' })]; });
  const stale = verifyPlugin(w.opts('codex'));
  assert.equal(stale.state, 'pending', 'an outdated cached copy is a reinstall step, not a failure');
  assert.equal(stale.details.reason, 'cached_copy_outdated');
  w.write((s) => { s.codex.installed = [installed({ enabled: false })]; });
  assert.equal(verifyPlugin(w.opts('codex')).state, 'pending');
  w.write((s) => { s.codex.installed = [installed({ marketplace: 'orion-other', id: 'orion@orion-other' })]; });
  assert.equal(verifyPlugin(w.opts('codex')).state, 'pending');
  w.write((s) => { s.codex.installed = [installed()]; });
  const done = verifyPlugin(w.opts('codex'));
  assert.equal(done.state, 'complete', JSON.stringify(done));
  assert.equal(done.details.verified_by, 'codex plugin list --json');
  assert.match(done.details.next, /fresh chat/);
});

test('Codex: verify fails when the catalog name is registered from another folder', (t) => {
  const w = world(t, { state: { codex: { marketplaces: { [CATALOG]: '/elsewhere/other' }, installed: [{ id: `orion@${CATALOG}`, version: VERSION, installed: true, enabled: true }], adds: 0 } } });
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

test('Codex: retire removes only this harness plugin and catalog', (t) => {
  const w = world(t);
  setupPlugin(w.opts('codex'));
  w.write((s) => {
    s.codex.installed = [{ id: `orion@${CATALOG}`, version: VERSION, installed: true }, { id: 'other@elsewhere', version: '1', installed: true }];
    s.codex.marketplaces.elsewhere = '/somewhere/else';
  });
  assert.equal(retirePlugin(w.opts('codex')).state, 'complete');
  const { codex } = w.read();
  assert.deepEqual(codex.installed.map((p) => p.id), ['other@elsewhere']);
  assert.deepEqual(Object.keys(codex.marketplaces), ['elsewhere']);
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
    const result = verifyPlugin(w.opts(tool));
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
