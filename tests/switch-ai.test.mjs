import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildCatalog, catalogName, pluginManifests } from '../update/plugin-package.mjs';
import { codexOwnedText } from '../update/plugin-registration.mjs';
import { plainEnv } from './helpers/env.mjs';

const script = new URL('../switch_ai.mjs', import.meta.url).pathname;
const put = (root, path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); };
/** A file's text; with `missing`, that value when the file is absent. */
const get = (root, path, missing) => (missing !== undefined && !existsSync(join(root, path)) ? missing : readFileSync(join(root, path), 'utf8'));
const has = (root, path) => existsSync(join(root, path));
const status = (root) => JSON.parse(get(root, 'status/status.json'));
const skills = (tool) => tool === 'codex' ? '.agents/skills' : '.claude/skills';
const other = (tool) => tool === 'codex' ? 'claude-code' : 'codex';

function folder(t, from) {
  const root = mkdtempSync(join(tmpdir(), 'orion-switch-ai-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, 'status/status.json', JSON.stringify({ template_version: '2.0.0', ai_assistant: from, notes: 'keep', machine_profile: { chosen_surface: from } }));
  put(root, `${skills(from)}/foo/SKILL.md`, 'release foo\n');
  put(root, `${skills(from)}/bar/SKILL.md`, 'my edited bar\n');
  put(root, `${skills(from)}/custom/SKILL.md`, 'my skill\n');
  put(root, `${skills(from)}/custom/references/notes.md`, 'my notes\n');
  put(root, `${skills(from)}/speckit-plan/SKILL.md`, 'maintainer only\n');
  put(root, 'status/shift-log.md', 'old log\n');
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });

for (const from of ['codex', 'claude-code']) test(`switch from ${from} moves every skill and records the new assistant`, (t) => {
  const root = folder(t, from), to = other(from);
  if (from === 'claude-code') put(root, '.claude/settings.json', '{}\n');
  const result = run(root, '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.from, from); assert.equal(report.to, to);
  assert.equal(status(root).ai_assistant, to);
  assert.equal(status(root).machine_profile.chosen_surface, to);
  assert.match(status(root).notes, /^keep\nswitched from/);
  assert.equal(get(root, `${skills(to)}/foo/SKILL.md`), 'release foo\n');
  assert.equal(get(root, `${skills(to)}/bar/SKILL.md`), 'my edited bar\n');
  assert.equal(get(root, `${skills(to)}/custom/references/notes.md`), 'my notes\n');
  assert.equal(has(root, `${skills(to)}/speckit-plan`), false);
  assert.equal(has(root, skills(from)), false);
  if (from === 'codex') assert.equal(has(root, '.agents'), false);
  else assert.equal(get(root, '.claude/settings.json'), '{}\n', 'other files in .claude stay');
  assert.equal(get(root, `${report.backup}/${skills(from)}/speckit-plan/SKILL.md`), 'maintainer only\n');
  assert.equal(get(root, `${report.backup}/${skills(from)}/bar/SKILL.md`), 'my edited bar\n');
  assert.equal(JSON.parse(get(root, `${report.backup}/status/status.json`)).ai_assistant, from);
  assert.equal(get(root, 'status/shift-log.md'), 'old log\n');
});

test('running it again switches back', (t) => {
  const root = folder(t, 'codex');
  const there = run(root); assert.equal(there.status, 0, there.stderr);
  assert.match(there.stdout, /from Codex to Claude Code/);
  const back = run(root); assert.equal(back.status, 0, back.stderr);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(get(root, '.agents/skills/bar/SKILL.md'), 'my edited bar\n');
  assert.equal(has(root, '.claude'), false);
});

test('--to names the assistant and refuses the current one', (t) => {
  const root = folder(t, 'codex');
  const same = run(root, '--to', 'codex');
  assert.equal(same.status, 2); assert.match(same.stderr, /already uses Codex/);
  assert.equal(run(root, '--to', 'copilot').status, 2);
  const ok = run(root, '--to', 'claude-code'); assert.equal(ok.status, 0, ok.stderr);
  assert.equal(status(root).ai_assistant, 'claude-code');
});

test('a collision changes nothing', (t) => {
  const root = folder(t, 'codex');
  put(root, '.claude/skills/foo/SKILL.md', 'already here\n');
  const blocked = run(root);
  assert.equal(blocked.status, 2); assert.match(blocked.stderr, /Nothing was changed[\s\S]*\.claude\/skills\/foo\/SKILL\.md/);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(get(root, '.agents/skills/foo/SKILL.md'), 'release foo\n');
  assert.equal(get(root, '.claude/skills/foo/SKILL.md'), 'already here\n');
  assert.equal(has(root, '.claude/skills/bar'), false);
  assert.equal(has(root, '.update-backup'), false);
});

test('a symlinked skill is refused before anything changes', (t) => {
  const root = folder(t, 'codex');
  symlinkSync(join(root, 'status/shift-log.md'), join(root, '.agents/skills/custom/link.md'));
  const blocked = run(root);
  assert.equal(blocked.status, 2); assert.match(blocked.stderr, /link or special file/);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(has(root, '.claude'), false);
});

test('a folder with no recorded assistant is read from its layout', (t) => {
  const root = folder(t, 'claude-code');
  const s = status(root); delete s.ai_assistant; put(root, 'status/status.json', JSON.stringify(s));
  const result = run(root); assert.equal(result.status, 0, result.stderr);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(get(root, '.agents/skills/custom/SKILL.md'), 'my skill\n');
});

test('with no --root it switches the folder it sits in', (t) => {
  const root = folder(t, 'codex');
  copyFileSync(script, join(root, 'switch_ai.mjs'));
  // A deployed folder carries the status store the script imports.
  copyFileSync(new URL('../status/store.mjs', import.meta.url), join(root, 'status/store.mjs'));
  const result = spawnSync(process.execPath, [join(root, 'switch_ai.mjs')], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(status(root).ai_assistant, 'claude-code');
});

test('update/apply.mjs switch points to switch_ai.mjs', () => {
  const apply = new URL('../update/apply.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [apply, 'switch', '--root', tmpdir()], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.match(result.stderr, /node switch_ai\.mjs/);
});

// ── The Orion plugin moves with the switch (spec 008 acceptance #7) ─────────
// The native CLIs are the fake in tests/helpers/fake-native.mjs; HOME is a temp folder.

const FAKE = new URL('./helpers/fake-native.mjs', import.meta.url).pathname;
const ID = '0b6f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const CATALOG = catalogName(ID);
const PLUGIN_ID = `orion@${CATALOG}`;
const CATALOG_PATH = { 'claude-code': '.claude-plugin/marketplace.json', codex: '.agents/plugins/marketplace.json' };
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const PACKAGE = {};
for (const [path, value] of Object.entries(pluginManifests('2.0.0'))) PACKAGE[path] = json(value);
PACKAGE['plugins/orion/skills/hello/SKILL.md'] = 'hello v2\n';
PACKAGE['plugins/orion/skills/fresh/SKILL.md'] = 'fresh v2\n';

/** A harness at 2.0.0 whose plugin is set up for `tool`, as a finished install left it. */
function pluginWorld(t, { tool = 'claude-code', faults = {}, codexInstalled = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'orion-switch-plugin-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const client = join(base, 'Acme Orion'), home = join(base, 'home');
  mkdirSync(client); mkdirSync(home);
  for (const [path, body] of Object.entries(PACKAGE)) put(client, path, body);
  put(client, CATALOG_PATH[tool], json(buildCatalog(tool, ID)));
  put(client, `${skills(tool)}/mine/SKILL.md`, 'my own skill\n');
  put(client, '.claude/settings.json', '{"theme":"mine"}\n');
  put(client, '.agents/other/notes.md', 'unrelated\n');
  put(client, 'status/status.json', json({
    template_version: '2.0.0', ai_assistant: tool, notes: 'before',
    plugin: { catalog_identity: ID, setup_state: 'complete', remaining_action: null, verified_version: '2.0.0', verified_at: '2026-11-01T00:00:00.000Z', pending_version: null, pending_switch: null },
  }));
  const statePath = join(base, 'native.json');
  const native = { faults, claude: { marketplaces: {}, installs: {} }, codex: { marketplaces: {}, installed: [], adds: 0 } };
  if (tool === 'claude-code') {
    native.claude.marketplaces[CATALOG] = { path: client, scopes: ['local'] };
    native.claude.installs[`${PLUGIN_ID}|${client}`] = { id: PLUGIN_ID, scope: 'local', enabled: true, projectPath: client };
  } else {
    put(client, '.codex/config.toml', `model = "mine"\n\n${codexOwnedText(CATALOG, client)}\n`);
    if (codexInstalled) {
      const cached = join(home, '.codex/plugins/cache', CATALOG, 'orion/local');
      for (const [path, body] of Object.entries(PACKAGE)) put(cached, path.slice('plugins/orion/'.length), body);
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
  return {
    client,
    status: () => status(client),
    native: () => JSON.parse(readFileSync(statePath, 'utf8')),
    humanInstall: () => spawnSync(process.execPath, [FAKE, 'codex', 'plugin', '__human-install', CATALOG], { cwd: client, env, encoding: 'utf8' }),
    switchTo: (to, more = {}) => spawnSync(process.execPath, [script, '--root', client, '--json', ...(to ? ['--to', to] : [])], { encoding: 'utf8', env: { ...env, ...more }, cwd: client }),
  };
}
const out = (r) => `${r.stdout}${r.stderr}`;
const report = (r) => JSON.parse(r.stdout);
const nativeCalls = (w) => (w.native().calls || []).map((c) => `${c.tool} ${c.args.join(' ')}`);

test('switch to Codex waits for the native install as a pending switch, then commits and retires only Claude Code\'s Orion', (t) => {
  const w = pluginWorld(t);
  const pending = w.switchTo('codex');
  assert.equal(pending.status, 0, out(pending));
  assert.equal(report(pending).state, 'pending_switch');
  assert.match(report(pending).remaining_action, /node switch_ai\.mjs/);
  let s = w.status();
  assert.equal(s.ai_assistant, 'claude-code', 'the selected tool does not change before the target is installed');
  assert.equal(s.plugin.pending_switch.to, 'codex');
  assert.match(s.plugin.pending_switch.remaining_action, /\/plugins/);
  assert.equal(JSON.parse(get(w.client, CATALOG_PATH.codex)).name, CATALOG);
  assert.ok(has(w.client, CATALOG_PATH['claude-code']));
  assert.equal(get(w.client, '.claude/skills/mine/SKILL.md'), 'my own skill\n');
  assert.ok(!nativeCalls(w).some((c) => c.startsWith('claude plugin uninstall')));

  // The human installs Orion in Codex; running the switch again (no --to) finishes it.
  assert.ok(get(w.client, '.codex/config.toml').includes(`[plugins."${PLUGIN_ID}"]\nenabled = true`), 'Codex is registered in this folder only');
  assert.equal(w.humanInstall().status, 0);
  const done = w.switchTo();
  assert.equal(done.status, 0, out(done));
  assert.equal(report(done).state, 'switched');
  s = w.status();
  assert.equal(s.ai_assistant, 'codex');
  assert.equal(s.plugin.pending_switch, null);
  assert.equal(s.plugin.catalog_identity, ID, 'the catalog identity stays the same');
  assert.equal(s.plugin.setup_state, 'registered');
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
  const w = pluginWorld(t, { tool: 'codex' });
  const run = w.switchTo('claude-code');
  assert.equal(run.status, 0, out(run));
  assert.equal(report(run).state, 'switched');
  const s = w.status();
  assert.equal(s.ai_assistant, 'claude-code');
  assert.equal(s.plugin.setup_state, 'registered');
  assert.equal(s.plugin.pending_version, '2.0.0');
  assert.equal(get(w.client, '.claude/skills/mine/SKILL.md'), 'my own skill\n');
  assert.equal(has(w.client, CATALOG_PATH.codex), false);
  assert.equal(get(w.client, '.agents/other/notes.md'), 'unrelated\n', 'only Orion-owned items leave .agents');
  assert.ok(nativeCalls(w).includes(`codex plugin remove ${PLUGIN_ID} --json`));
  assert.equal(get(w.client, '.codex/config.toml'), 'model = "mine"\n', 'only Orion\'s own Codex entries leave');
  assert.deepEqual(w.native().codex.installed, []);
});

test('a failed target setup restores the previous tool\'s state; an interrupted commit rolls back', (t) => {
  const failed = pluginWorld(t, { tool: 'codex', faults: { validate: true } });
  const run = failed.switchTo('claude-code');
  assert.equal(run.status, 3, out(run));
  assert.equal(report(run).state, 'rolled_back');
  assert.equal(failed.status().ai_assistant, 'codex');
  assert.equal(failed.status().plugin.pending_switch, null);
  assert.equal(has(failed.client, CATALOG_PATH['claude-code']), false);
  assert.ok(has(failed.client, CATALOG_PATH.codex));
  assert.equal(get(failed.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
  assert.ok(!nativeCalls(failed).some((c) => c.startsWith('codex plugin remove') || c.startsWith('codex plugin marketplace remove')));

  const torn = pluginWorld(t, { tool: 'codex' });
  put(torn.client, '.agents/skills/mine/references/more.md', 'more\n');
  const interrupted = torn.switchTo('claude-code', { ORION_SWITCH_FAIL_AFTER: '1' });
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

test('switching back reuses the same catalog identity and package', (t) => {
  const w = pluginWorld(t, { tool: 'codex' });
  assert.equal(report(w.switchTo('claude-code')).state, 'switched');
  // Codex's Orion was retired, so the way back waits for its native install again.
  const back = w.switchTo();
  assert.equal(report(back).state, 'pending_switch', out(back));
  assert.equal(w.humanInstall().status, 0);
  const done = w.switchTo();
  assert.equal(report(done).state, 'switched', out(done));
  const s = w.status();
  assert.equal(s.ai_assistant, 'codex');
  assert.equal(s.plugin.catalog_identity, ID);
  assert.equal(JSON.parse(get(w.client, CATALOG_PATH.codex)).name, CATALOG);
  assert.equal(has(w.client, CATALOG_PATH['claude-code']), false);
  assert.equal(get(w.client, '.agents/skills/mine/SKILL.md'), 'my own skill\n');
});

test('a waiting switch resumes by naming the target again and is cancelled by naming the current assistant', (t) => {
  const w = pluginWorld(t);
  assert.equal(report(w.switchTo('codex')).state, 'pending_switch');
  assert.equal(report(w.switchTo('codex')).state, 'pending_switch', 'naming the target again resumes it');
  const cancelled = w.switchTo('claude-code');
  assert.equal(cancelled.status, 0, out(cancelled));
  assert.equal(report(cancelled).state, 'cancelled');
  const s = w.status();
  assert.equal(s.ai_assistant, 'claude-code');
  assert.equal(s.plugin.pending_switch, null);
  assert.equal(has(w.client, CATALOG_PATH.codex), false);
  assert.ok(!get(w.client, '.codex/config.toml', '').includes(CATALOG), 'Orion\'s Codex entries for this folder are gone');
  assert.ok(has(w.client, CATALOG_PATH['claude-code']));
  assert.equal(Object.keys(w.native().claude.installs).length, 1, 'Claude Code keeps Orion');
});

test('a switch commits only on the target tool\'s discovery evidence, not on its install record', (t) => {
  const w = pluginWorld(t, { tool: 'codex', faults: { detailsSkills: ['hello'] } });
  const run = w.switchTo('claude-code');
  assert.equal(run.status, 0, out(run));
  const r = report(run);
  assert.equal(r.state, 'pending_switch');
  assert.match(r.remaining_action, /fresh Claude Code session/);
  assert.equal(w.status().ai_assistant, 'codex');
  assert.ok(!nativeCalls(w).some((c) => c.startsWith('codex plugin remove')), 'the current tool keeps Orion');
});

test('the previous tool\'s Orion is retired only after the switch is committed', (t) => {
  const w = pluginWorld(t);
  assert.equal(report(w.switchTo('codex')).state, 'pending_switch');
  assert.equal(w.humanInstall().status, 0);
  const torn = w.switchTo('codex', { ORION_SWITCH_FAIL_BEFORE_COMMIT: '1' });
  assert.equal(torn.status, 2, out(torn));
  assert.match(torn.stderr, /Injected switch interruption/);
  assert.equal(w.status().ai_assistant, 'claude-code');
  assert.equal(w.status().plugin.pending_switch, null);
  assert.ok(!nativeCalls(w).some((c) => c.startsWith('claude plugin uninstall')), 'Claude Code keeps Orion');
  assert.equal(Object.keys(w.native().claude.installs).length, 1);
  assert.ok(has(w.client, CATALOG_PATH['claude-code']));
  assert.equal(get(w.client, '.claude/skills/mine/SKILL.md'), 'my own skill\n');
});
