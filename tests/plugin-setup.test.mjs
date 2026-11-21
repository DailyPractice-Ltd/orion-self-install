import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Fresh install and resumable plugin setup (spec 008 acceptance #3, #4, #5).
// The native `claude` / `codex` CLIs are always stubbed through ORION_*_BIN overrides,
// so no real tool, home folder or network is ever reached. A stub that answers "ok"
// proves preparation behaviour only; the installer must never call that real discovery.
const release = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = join(release, 'tests/helpers/fake-native.mjs');
const VERSION = JSON.parse(readFileSync(join(release, 'update/manifest.json'), 'utf8')).template_version;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function world(t, { tools = ['claude', 'codex'], faults = {} } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'orion-plugin-setup-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const bin = join(base, 'bin'); mkdirSync(bin);
  const statePath = join(base, 'native-state.json');
  writeFileSync(statePath, JSON.stringify({ faults }));
  const home = join(base, 'home'); mkdirSync(home);
  // A temp home: no real ~/.codex or ~/.claude is ever read.
  const env = { ...process.env, FAKE_NATIVE_STATE: statePath, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex') };
  for (const [tool, envVar] of [['claude', 'ORION_CLAUDE_BIN'], ['codex', 'ORION_CODEX_BIN']]) {
    const file = join(bin, process.platform === 'win32' ? `${tool}.cmd` : tool);
    env[envVar] = file; // absent file = client not installed on this computer
    if (!tools.includes(tool)) continue;
    if (process.platform === 'win32') writeFileSync(file, `@"${process.execPath}" "${FAKE}" ${tool} %*\r\n`);
    else { writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${tool} "$@"\n`); chmodSync(file, 0o755); }
  }
  const target = join(base, 'Acme Orion');
  const native = () => JSON.parse(readFileSync(statePath, 'utf8'));
  const install = (tool, extra = []) => spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target, '--local-only', ...extra], { encoding: 'utf8', env });
  const setup = (...args) => spawnSync(process.execPath, [join(target, 'update/plugin-setup.mjs'), ...args], { encoding: 'utf8', env, cwd: target });
  const status = () => JSON.parse(readFileSync(join(target, 'status/status.json'), 'utf8'));
  const addTool = (tool) => {
    const file = env[tool === 'claude' ? 'ORION_CLAUDE_BIN' : 'ORION_CODEX_BIN'];
    if (process.platform === 'win32') writeFileSync(file, `@"${process.execPath}" "${FAKE}" ${tool} %*\r\n`);
    else { writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" ${tool} "$@"\n`); chmodSync(file, 0o755); }
  };
  return { base, bin, home, env, target, native, install, setup, status, addTool };
}

const out = (run) => `${run.stdout}${run.stderr}`;

function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory()
    ? files(join(dir, item.name), `${prefix}${item.name}/`) : [`${prefix}${item.name}`]);
}

test('Claude Code install: package, own catalog, local-scope registration at the final path; never claims discovery', (t) => {
  const w = world(t);
  const run = w.install('claude-code');
  assert.equal(run.status, 0, out(run));
  const real = realpathSync(w.target);

  // Layout: the package and the selected tool's catalog only; no loose shipped skills.
  for (const path of ['plugins/orion/plugin.json', 'plugins/orion/.claude-plugin/plugin.json', 'plugins/orion/skills/prospecting/SKILL.md', '.claude-plugin/marketplace.json']) {
    assert.ok(existsSync(join(w.target, path)), path);
  }
  for (const path of ['.agents', '.claude/skills', 'skills']) assert.equal(existsSync(join(w.target, path)), false, `${path} must not exist`);

  const { plugin } = w.status();
  assert.match(plugin.catalog_identity, UUID);
  const catalog = JSON.parse(readFileSync(join(w.target, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(catalog.name, `orion-${plugin.catalog_identity.replaceAll('-', '').slice(0, 12)}`);
  assert.equal(catalog.plugins[0].source, './plugins/orion');

  // Harness business state never enters the package.
  const pkg = files(join(w.target, 'plugins/orion'));
  assert.ok(!pkg.some((path) => /status\.json|radio\.key|knowledge-base|marketplace\.json/.test(path)), pkg.join(', '));
  for (const path of pkg) assert.doesNotMatch(readFileSync(join(w.target, 'plugins/orion', path), 'utf8'), new RegExp(plugin.catalog_identity));

  // Registration happened against the final folder, never the staging folder.
  const calls = w.native().calls;
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.cwd, real);
    assert.doesNotMatch(call.args.join(' '), /-install-/);
  }
  const add = calls.find((c) => c.args[1] === 'marketplace' && c.args[2] === 'add');
  assert.equal(add.args[3], real);
  assert.deepEqual(add.args.slice(4, 6), ['--scope', 'local']);
  const install = calls.find((c) => c.args[1] === 'install');
  assert.deepEqual(install.args.slice(2), [`orion@${catalog.name}`, '--scope', 'local', '--json']);

  // A stubbed "ok" is registration, not discovery: honest state, a fresh session still owed.
  assert.equal(plugin.setup_state, 'registered');
  assert.equal(plugin.verified_version, null);
  assert.equal(plugin.verified_at, null);
  assert.match(plugin.remaining_action, /fresh Claude Code session/);
  assert.match(plugin.remaining_action, /plugin-setup\.mjs verify --discovered/);
  assert.doesNotMatch(out(run), /plugin setup complete/i);
  assert.ok(run.stdout.includes(w.env.ORION_CLAUDE_BIN), 'names the program that was checked');
});

test('Claude Code resume reuses the identity, registers once, and preserves client skills and settings', (t) => {
  const w = world(t);
  assert.equal(w.install('claude-code').status, 0);
  const identity = w.status().plugin.catalog_identity;
  mkdirSync(join(w.target, '.claude/skills/mine'), { recursive: true });
  writeFileSync(join(w.target, '.claude/skills/mine/SKILL.md'), 'my skill\n');
  writeFileSync(join(w.target, '.claude/settings.json'), '{"theme":"mine"}\n');

  for (let i = 0; i < 2; i += 1) {
    const again = w.setup('resume');
    assert.equal(again.status, 0, out(again));
    assert.doesNotMatch(out(again), /plugin setup complete/i);
  }
  assert.equal(w.status().plugin.catalog_identity, identity);
  assert.equal(w.status().plugin.setup_state, 'registered');
  const native = w.native().claude;
  assert.equal(Object.keys(native.marketplaces).length, 1);
  assert.equal(Object.keys(native.installs).length, 1);
  assert.deepEqual(native.marketplaces[Object.keys(native.marketplaces)[0]].scopes, ['local']);
  assert.equal(readFileSync(join(w.target, '.claude/skills/mine/SKILL.md'), 'utf8'), 'my skill\n');
  assert.equal(readFileSync(join(w.target, '.claude/settings.json'), 'utf8'), '{"theme":"mine"}\n');

  // Only an assistant that sees the skills in a fresh session can confirm discovery.
  const verified = w.setup('verify', '--discovered');
  assert.equal(verified.status, 0, out(verified));
  assert.match(verified.stdout, /plugin setup complete/i);
  const { plugin } = w.status();
  assert.equal(plugin.setup_state, 'complete');
  assert.equal(plugin.verified_version, VERSION);
  assert.ok(plugin.verified_at);
  assert.equal(plugin.remaining_action, null);
});

test('Codex install prepares its own catalog and leaves the native install as the exact remaining step', (t) => {
  const w = world(t);
  const run = w.install('codex');
  assert.equal(run.status, 0, out(run));
  assert.ok(existsSync(join(w.target, '.agents/plugins/marketplace.json')));
  for (const path of ['.claude-plugin', '.claude', '.agents/skills']) assert.equal(existsSync(join(w.target, path)), false, path);
  const { plugin } = w.status();
  const name = `orion-${plugin.catalog_identity.replaceAll('-', '').slice(0, 12)}`;
  assert.equal(plugin.setup_state, 'pending');
  assert.match(plugin.remaining_action, /\/plugins/);
  assert.ok(plugin.remaining_action.includes(name));
  assert.ok(run.stdout.includes(plugin.remaining_action));
  // Registered in this folder's own Codex config only; nothing user-wide.
  const config = readFileSync(join(w.target, '.codex/config.toml'), 'utf8');
  assert.ok(config.includes(`[marketplaces."${name}"]\nsource_type = "local"\nsource = ${JSON.stringify(realpathSync(w.target))}`), config);
  assert.ok(config.includes(`[plugins."orion@${name}"]\nenabled = true`), config);
  assert.equal(existsSync(join(w.home, '.codex')), false, 'the user-wide Codex home is never written');
  assert.equal(w.native().codex.adds, 0, 'no user-wide marketplace add');
  assert.equal(w.native().codex.forbiddenAdd, undefined, 'never an unattended plugin install');

  const again = w.setup('resume');
  assert.equal(again.status, 0, out(again));
  assert.equal(readFileSync(join(w.target, '.codex/config.toml'), 'utf8'), config, 'the entries are written once');
  assert.equal(w.status().plugin.catalog_identity, plugin.catalog_identity);

  // Asserting discovery cannot skip a native install that has not happened.
  const verify = w.setup('verify', '--discovered');
  assert.equal(verify.status, 0, out(verify));
  assert.equal(w.status().plugin.setup_state, 'pending');
  assert.doesNotMatch(out(verify), /plugin setup complete/i);
});

test('a missing client leaves a resumable pending setup, then resume finishes registration', (t) => {
  const w = world(t, { tools: [] });
  const run = w.install('claude-code');
  assert.equal(run.status, 0, out(run));
  const { plugin } = w.status();
  assert.equal(plugin.setup_state, 'pending');
  assert.match(plugin.remaining_action, /Install Claude Code/);
  assert.ok(run.stdout.includes(plugin.remaining_action));
  assert.equal(existsSync(join(w.target, '.claude/skills')), false, 'no loose shipped skills as a fallback');

  w.addTool('claude');
  const resumed = w.setup('resume');
  assert.equal(resumed.status, 0, out(resumed));
  assert.equal(w.status().plugin.setup_state, 'registered');
  assert.equal(w.status().plugin.catalog_identity, plugin.catalog_identity);
});

test('failed native setup is explicit and keeps the installed folder resumable', (t) => {
  const w = world(t, { faults: { validate: true } });
  const run = w.install('claude-code');
  assert.equal(run.status, 3, out(run));
  assert.match(out(run), /plugin setup failed/i);
  assert.ok(existsSync(join(w.target, 'status/status.json')));
  const { plugin } = w.status();
  assert.equal(plugin.setup_state, 'failed');
  assert.match(plugin.remaining_action, /plugin-setup\.mjs resume/);
  assert.equal(w.native().calls.some((c) => c.args[1] === 'install'), false);
});

test('a nonempty target is refused before any native call', (t) => {
  const w = world(t);
  mkdirSync(w.target);
  writeFileSync(join(w.target, 'notes.md'), 'mine\n');
  const run = w.install('claude-code');
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(join(w.target, 'notes.md'), 'utf8'), 'mine\n');
  assert.deepEqual(w.native().calls || [], []);
});

test('resume refuses a folder whose catalog identity was tampered with', (t) => {
  const w = world(t);
  assert.equal(w.install('claude-code').status, 0);
  const status = w.status();
  status.plugin.catalog_identity = 'acme-co';
  writeFileSync(join(w.target, 'status/status.json'), JSON.stringify(status));
  const run = w.setup('resume');
  assert.notEqual(run.status, 0);
  assert.match(out(run), /catalog_identity is malformed/);
});
