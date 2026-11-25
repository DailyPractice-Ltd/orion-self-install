/**
 * status/store.mjs owns status/status.json and status/radio.key: every change
 * reads fresh under the status lock and saves atomically, so no Orion command
 * loses another's change. These tests drive the real scripts on scratch folders.
 *
 *   node --test tests/store-ownership.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { changeStatus, createStatus, readStatus, withStatusLock } from '../status/store.mjs';
import { checkWork } from '../status/guard.mjs';
import { plainEnv } from './helpers/env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDENTITY = '11111111-1111-1111-1111-111111111111';
const KEY = 'orion_' + 'test'.repeat(6);
const SHORT_WAIT = plainEnv({ ORION_STATUS_LOCK_WAIT_MS: '300' });

/** A folder with the real status scripts, a paired radio and the send level at low. */
function harness(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'status'));
  for (const f of readdirSync(join(ROOT, 'status')).filter((n) => n.endsWith('.mjs') || n === 'status.schema-template.json')) {
    copyFileSync(join(ROOT, 'status', f), join(dir, 'status', f));
  }
  mkdirSync(join(dir, 'update'));
  for (const f of ['manifest.json', 'destination-resolver.mjs']) copyFileSync(join(ROOT, 'update', f), join(dir, 'update', f));
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
    template_version: '2.0.0', ai_assistant: 'claude-code', client_name: 'Priya',
    scopes: { crm_write: true, send_risk: 'low', send_risk_set_by: 'Priya', send_risk_set_on: '2026-11-01' },
    sharing: { status_signal_enabled: true, bridge_url: 'https://bridge.test/api/bridge', harness_id: IDENTITY, install_token: KEY },
    ...extra,
  }, null, 2));
  return dir;
}
const statusOf = (dir) => JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
const node = (dir, args, env = plainEnv()) => {
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env });
  return { code: r.status, out: r.stdout + r.stderr };
};

// ── The interface ───────────────────────────────────────────────────────────

test('changeStatus reads fresh, saves the change with updated_at, and returns what the change returns', async (t) => {
  const dir = harness(t);
  const result = await changeStatus(dir, (status) => { status.agent_name = 'Orion'; return 'done'; });
  assert.equal(result, 'done');
  assert.equal(statusOf(dir).agent_name, 'Orion');
  assert.ok(Number.isFinite(Date.parse(statusOf(dir).updated_at)));
  assert.equal(statSync(join(dir, 'status', 'status.json')).mode & 0o777, 0o600);
});

test('changeStatus writes nothing when the change throws or changes nothing', async (t) => {
  const dir = harness(t);
  const before = readFileSync(join(dir, 'status', 'status.json'), 'utf8');
  await assert.rejects(changeStatus(dir, (status) => { status.agent_name = 'half'; throw new Error('stop'); }), /stop/);
  assert.equal(await changeStatus(dir, () => 'looked'), 'looked');
  assert.equal(readFileSync(join(dir, 'status', 'status.json'), 'utf8'), before);
  assert.equal(existsSync(join(dir, 'status', '.radio-lock')), false, 'the lock is released either way');
});

test('changeStatus refuses an unreadable status file rather than writing over it', async (t) => {
  const dir = harness(t);
  writeFileSync(join(dir, 'status', 'status.json'), '{ not json');
  await assert.rejects(changeStatus(dir, (status) => { status.x = 1; }));
  assert.equal(readFileSync(join(dir, 'status', 'status.json'), 'utf8'), '{ not json');
});

test('createStatus makes status.json from the template once, and never replaces one', async (t) => {
  const dir = harness(t);
  rmSync(join(dir, 'status', 'status.json'));
  const manifestPath = join(dir, 'update', 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, 'utf8')), template_version: '9.9.9' }));
  assert.equal(await readStatus(dir), null);
  assert.equal(await createStatus(dir), true);
  assert.equal(statusOf(dir).template_version, '9.9.9', 'the version comes from the manifest');
  assert.deepEqual(Object.keys(statusOf(dir)).filter((k) => k.endsWith('_version')), ['template_version'], 'the record carries one version');
  await changeStatus(dir, (status) => { status.agent_name = 'Orion'; });
  assert.equal(await createStatus(dir), false);
  assert.equal(statusOf(dir).agent_name, 'Orion');
});

test('createStatus takes the version from the manifest even when a template carries its own', async (t) => {
  const dir = harness(t);
  rmSync(join(dir, 'status', 'status.json'));
  const templatePath = join(dir, 'status', 'status.schema-template.json');
  writeFileSync(templatePath, JSON.stringify({ ...JSON.parse(readFileSync(templatePath, 'utf8')), template_version: '0.0.1' }));
  const manifestPath = join(dir, 'update', 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, 'utf8')), template_version: '9.9.9' }));
  assert.equal(await createStatus(dir), true);
  assert.equal(statusOf(dir).template_version, '9.9.9');
});

test('the key is written owner-only and read back, and removed, only under the lock', async (t) => {
  const dir = harness(t);
  await withStatusLock(dir, async (store) => {
    await store.writeKey(KEY);
    assert.equal((await store.readKey()).trim(), KEY);
  });
  assert.equal(statSync(join(dir, 'status', 'radio.key')).mode & 0o777, 0o600);
  await withStatusLock(dir, (store) => store.removeKey());
  assert.equal(existsSync(join(dir, 'status', 'radio.key')), false);
});

// ── No lost updates ─────────────────────────────────────────────────────────

test('a send level set while the guard is mid-check survives the guard saving its result', async (t) => {
  const dir = harness(t);
  let entered, answer;
  const inFlight = new Promise((resolve) => { entered = resolve; });
  const held = new Promise((resolve) => { answer = resolve; });
  const fetchImpl = async () => {
    entered();
    await held;
    return { status: 200, json: async () => ({ status: 'accepted', harness_id: IDENTITY }) };
  };
  const guard = checkWork({ root: dir, fetchImpl, scope: false });
  await inFlight; // the guard holds the lock and has its copy of status

  const send = spawn(process.execPath, [join(dir, 'status', 'send.mjs'), 'set-level', 'off'], { cwd: dir, env: plainEnv() });
  let out = '';
  send.stdout.on('data', (d) => { out += d; });
  send.stderr.on('data', (d) => { out += d; });
  const sent = new Promise((resolve) => send.on('exit', resolve));
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(statusOf(dir).scopes.send_risk, 'low', 'send waits for the lock instead of writing under the guard');

  answer();
  assert.equal((await guard).allow, true);
  assert.equal(await sent, 0, out);
  const status = statusOf(dir);
  assert.equal(status.scopes.send_risk, 'off', 'the level is not lost to the guard');
  assert.equal(status.sharing.pairing.last_check, 'accepted', 'nor is the guard result lost to the level');
});

// ── A busy lock: wait, then stop or skip; never write around it ─────────────

test('send stops with the lock message and changes nothing when the lock stays busy', (t) => {
  const dir = harness(t);
  mkdirSync(join(dir, 'status', '.radio-lock'));
  const { code, out } = node(dir, [join(dir, 'status', 'send.mjs'), 'set-level', 'off'], SHORT_WAIT);
  assert.equal(code, 1, out);
  assert.match(out, /Status is locked\..*Nothing was changed\./s);
  assert.equal(statusOf(dir).scopes.send_risk, 'low');
});

test('send stops rather than set a level over an unreadable status file', (t) => {
  const dir = harness(t);
  writeFileSync(join(dir, 'status', 'status.json'), '{ not json');
  const { code, out } = node(dir, [join(dir, 'status', 'send.mjs'), 'set-level', 'off']);
  assert.equal(code, 1, out);
  assert.match(out, /could not be read or saved, so nothing was changed/);
  assert.equal(readFileSync(join(dir, 'status', 'status.json'), 'utf8'), '{ not json');
});

test('home stops at the key move when the lock stays busy, and the key stays where it was', (t) => {
  const dir = harness(t);
  mkdirSync(join(dir, 'status', '.radio-lock'));
  const { out } = node(dir, [join(dir, 'status', 'home.mjs'), 'prepare', '--yes'], SHORT_WAIT);
  assert.match(out, /Could not: Move the radio key.*Status is locked\./s);
  assert.equal(statusOf(dir).sharing.install_token, KEY);
  assert.equal(existsSync(join(dir, 'status', 'radio.key')), false);
});

test('a tool switch takes the lock: it waits, and changes nothing when the lock stays busy', (t) => {
  const dir = harness(t);
  mkdirSync(join(dir, '.claude', 'skills', 'demo'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'skills', 'demo', 'SKILL.md'), '# demo\n');
  // A deployed folder carries the switch and the receipt modules it imports.
  for (const path of ['switch_ai.mjs', 'update/destination-resolver.mjs', 'update/receipt.mjs']) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(dir, path));
  }
  // The receipt its install wrote: a folder without one is refused before the lock.
  writeFileSync(join(dir, 'status', 'installed-files.json'), JSON.stringify({ schema: 'orion-installed-files', version: 1, algorithm: 'sha256-utf8-lf',
    ai_assistant: 'claude-code', template_version: '2.0.0', recorded_by: 'install', recorded_at: '2026-11-01T00:00:00.000Z', files: {} }));
  mkdirSync(join(dir, 'status', '.radio-lock'));
  const { code, out } = node(dir, [join(dir, 'switch_ai.mjs')], SHORT_WAIT);
  assert.equal(code, 2, out);
  assert.match(out, /Status is locked\./);
  assert.equal(statusOf(dir).ai_assistant, 'claude-code');
  assert.ok(existsSync(join(dir, '.claude', 'skills', 'demo', 'SKILL.md')));
});

test('an update run takes the lock for its whole run', (t) => {
  const dir = harness(t);
  mkdirSync(join(dir, 'status', '.radio-lock'));
  const { code, out } = node(ROOT, [join(ROOT, 'update', 'apply.mjs'), 'recover', '--root', dir], SHORT_WAIT);
  assert.equal(code, 2, out);
  assert.match(out, /Status is locked\./);
});

// ── One writer ──────────────────────────────────────────────────────────────

// Scripts allowed to write status.json or radio.key themselves: the store, and
// install.mjs, which only writes into its private staging folder before the
// folder is a harness anyone else can run in.
const OWNERS = new Set(['status/store.mjs', 'install.mjs']);
const WRITERS = /(?:\b|\.)(writeFileSync|appendFileSync|renameSync|copyFileSync|rmSync|unlinkSync|writeFile|appendFile|rename|copyFile|rm|unlink|copy|copyTo)\(/g;
// The destination is the first argument, or the second for a rename or copy.
const SECOND = new Set(['renameSync', 'copyFileSync', 'rename', 'copyFile', 'copy', 'copyTo']);
const LIVE = /STATUS_PATH|statusPath|KEY_PATH|status\.json['"`]|radio\.key['"`]|RADIO_KEY_FILE/;
const ASIDE = /backup|stage|temporary|\.tmp/i;

/** The top-level arguments of the call whose '(' is at `open`. */
function callArgs(text, open) {
  const args = [];
  let depth = 0, quote = null, start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (depth === 0) { args.push(text.slice(start, i)); return args; } }
    else if (c === ',' && depth === 1) { args.push(text.slice(start, i)); start = i + 1; }
  }
  return args;
}
function liveStatusWrites(text) {
  const found = [];
  for (const m of text.matchAll(WRITERS)) {
    const target = callArgs(text, m.index + m[0].length - 1)[SECOND.has(m[1]) ? 1 : 0] || '';
    if (LIVE.test(target) && !ASIDE.test(target)) found.push(`${m[1]}(${target.trim()})`);
  }
  return found;
}

test('the scan finds the ways status.json used to be written around the store', () => {
  for (const line of [
    "writeFileSync(STATUS_PATH, JSON.stringify(fresh, null, 2) + '\\n');",
    "fs.writeFileSync(KEY_PATH, token + '\\n', { mode: 0o600 });",
    "renameSync(join(backup,'stage/status/status.json'),statusPath);",
    "copy(join(backup, 'status/status.json'), statusPath);",
    "writeFileSync(join(root, 'status', 'status.json'), text);",
    "rmSync(KEY_PATH, {force:true});",
  ]) assert.notDeepEqual(liveStatusWrites(line), [], line);
  for (const line of [
    "copy(statusPath, join(backup, 'status/status.json'));",
    "writeFileSync(join(backup,'stage/status/status.json'),nextStatus);",
    "const status = JSON.parse(readFileSync(STATUS_PATH, 'utf8'));",
  ]) assert.deepEqual(liveStatusWrites(line), [], line);
});

test('only status/store.mjs writes status.json and radio.key', () => {
  const scripts = execFileSync('git', ['ls-files', '*.mjs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f && !f.startsWith('tests/') && !OWNERS.has(f));
  const offenders = scripts.flatMap((f) => liveStatusWrites(readFileSync(join(ROOT, f), 'utf8')).map((w) => `${f}: ${w}`));
  assert.deepEqual(offenders, [], 'change status through status/store.mjs (changeStatus, createStatus or withStatusLock)');
});
