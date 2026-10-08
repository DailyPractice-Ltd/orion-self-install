/**
 * A home for the folder, and a shift that runs in the cloud, run for real.
 *
 * Since 1.3.0 a harness folder can live in a private repository its owner
 * controls (status/home.mjs), and the radio key no longer has to sit in
 * status/status.json: it can come from the machine's environment, from
 * status/radio.key, or be attached outside the machine on a cloud run. These
 * cases hold three promises in place:
 *
 *   - the key is never saved to the home, whatever else goes wrong
 *   - a save never blocks work and never loses it
 *   - a cloud run, on a fresh copy with no key of its own, still reports its
 *     shift and leaves its line where the owner's machine will find it
 *
 * Everything runs the real scripts from status/ as child processes inside a
 * scratch folder, against real git and a repository on this disk standing in
 * for the home. The radio is a fetch that answers from memory and writes down
 * every call, with the header that carries the key. Nothing leaves this machine.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, rmSync, existsSync,
  appendFileSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  radioKey, radioConfigured, radioOn, keyHeader, isCloudRun, wantsEnvProxy, envProxyEnv,
  homeOn, homeBlock, isHomeBranch, httpsTwin, looksLikeKey, looksLikeCredential,
} from '../status/shapes.mjs';
import { plainEnv } from './helpers/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const statusDir = join(repo, 'status');

/** Keys that are well shaped and open nothing. Built here, never written out whole. */
const FAKE_KEY = 'orion_' + 'test'.repeat(6);
const OTHER_KEY = 'orion_' + 'other'.repeat(5);
const HARNESS_ID = '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62';
const CODE = 'BCDFGHJKLMNP';
const CLOUD = { CLAUDE_CODE_REMOTE: 'true' };

// ── Scratch folders, a stand-in home, and a radio that writes everything down ──

function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'orion-home-'));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5 }));
  // An empty git config: no name, no email, no system rules. What a client's
  // machine may well look like, and the same on every machine these tests run on.
  writeFileSync(join(base, 'gitconfig'), '');
  return base;
}

const gitEnv = (base) => ({ GIT_CONFIG_GLOBAL: join(base, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });

/** git, as a test's own hands: it has a name, unlike the scripts under test. */
function git(base, where, args) {
  const r = spawnSync('git', ['-C', where, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...gitEnv(base) },
  });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/** An empty repository on this disk, standing in for the owner's private one. */
function makeHome(base, name = 'home.git') {
  const dir = join(base, name);
  mkdirSync(dir);
  assert.ok(git(base, dir, ['init', '--bare', '-q', '-b', 'main']).ok);
  return dir;
}

/** What the home holds: a file's text on a branch, or null. */
const inHome = (base, home, file, branch = 'main') => {
  const r = git(base, home, ['show', `${branch}:${file}`]);
  return r.ok ? r.out : null;
};
const homeFiles = (base, home) => git(base, home, ['ls-tree', '-r', '--name-only', 'main']).out.split('\n').filter(Boolean);
const homeBranches = (base, home) => git(base, home, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).out.split('\n').filter(Boolean);

/** The hands on one folder: run a script in it, read what it left, see what the radio was sent. */
function folder(base, dir, { answer = 201 } = {}) {
  const tag = dir.split(/[\\/]/).pop();
  const log = join(base, `radio-${tag}.log`);
  const mock = join(base, `radio-${tag}.mjs`);
  writeFileSync(mock, `
    import { appendFileSync } from 'node:fs';
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(url);
      const headers = init.headers || {};
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({
        method: init.method || 'GET',
        path: u.pathname + u.search,
        auth: headers.Authorization ?? headers.authorization ?? null,
        envProxy: process.env.NODE_USE_ENV_PROXY ?? null,
        body: init.body ? JSON.parse(init.body) : null,
      }) + '\\n');
      const answer = ${JSON.stringify(answer)};
      if (answer === 'unreachable') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      if (u.pathname.endsWith('/pair')) {
        return json(200, { install_token: ${JSON.stringify(OTHER_KEY)}, harness_id: ${JSON.stringify(HARNESS_ID)}, bridge_url: 'https://radio.test/api/bridge' });
      }
      return json(answer, answer >= 400 ? { error: 'refused' } : { signal_id: 's1', replay: false });
    };
  `);
  const read = (rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : null);
  return {
    base,
    dir,
    run(script, args = [], env = {}) {
      const r = spawnSync(process.execPath, [join(dir, script), ...args], {
        encoding: 'utf8',
        cwd: dir,
        input: '',
        env: plainEnv({ NODE_OPTIONS: `--import=${pathToFileURL(mock).href}`, ...gitEnv(base), ...env }),
      });
      return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
    },
    git: (args) => git(base, dir, args),
    read,
    write(rel, content) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), content);
    },
    append: (rel, content) => appendFileSync(join(dir, rel), content),
    status: () => JSON.parse(read('status/status.json')),
    exists: (rel) => existsSync(join(dir, rel)),
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  };
}

/** A scratch harness folder with the real scripts in it, paired, not yet given a home. */
function makeFolder(t, { base = scratch(t), name = 'harness', sharing = {}, status = {}, keyFile = null, files = {}, answer } = {}) {
  const dir = join(base, name);
  mkdirSync(join(dir, 'status'), { recursive: true });
  for (const f of readdirSync(statusDir).filter((n) => n.endsWith('.mjs'))) {
    copyFileSync(join(statusDir, f), join(dir, 'status', f));
  }
  writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
    template_version: '1.3.0',
    agent_name: 'Neo',
    ops_stage: 'seven_day_checkin',
    harness_status: 'validated',
    memory: { enabled: true, backend: 'folder', remote: null, path: 'memory' },
    ...status,
    sharing: {
      status_signal_enabled: true,
      bridge_url: 'https://radio.test/api/bridge',
      harness_id: HARNESS_ID,
      install_token: FAKE_KEY,
      ...sharing,
    },
  }, null, 2) + '\n');
  const made = folder(base, dir, { answer });
  if (keyFile !== null) made.write('status/radio.key', keyFile);
  for (const [rel, content] of Object.entries(files)) made.write(rel, content);
  return made;
}

/** A folder that already has its home: prepared, pointed at it, and saved once. */
function homed(t, options = {}) {
  const local = makeFolder(t, options);
  const home = makeHome(local.base);
  const prepared = local.run('status/home.mjs', ['prepare', '--remote', home, '--yes']);
  assert.match(prepared.out, /Ready\. The first save/, prepared.out + prepared.err);
  const saved = local.run('status/home.mjs', ['sync']);
  assert.match(saved.out, /Saved to the folder's home\./, saved.out + saved.err);
  return { local, home };
}

/** What a cloud run starts from: a fresh copy fetched from the home, with no branch checked out. */
function freshCopy(from, home, name, options) {
  const dir = join(from.base, name);
  assert.ok(git(from.base, from.base, ['clone', '-q', home, dir]).ok);
  assert.ok(git(from.base, dir, ['checkout', '-q', '--detach']).ok);
  return folder(from.base, dir, options);
}

const shiftArgs = (agent, line, count = '2') => ['--agent', agent, '--shift', '--tag', 'ops', '--count', count, '--line', line];

// ── Where the key is ────────────────────────────────────────────────────────

test('the key is taken from the environment first, then the key file, then status.json', () => {
  const status = { sharing: { install_token: FAKE_KEY } };
  assert.deepEqual(radioKey(status, { env: { ORION_INSTALL_TOKEN: OTHER_KEY }, keyFile: `${OTHER_KEY}\n` }), { token: OTHER_KEY, source: 'environment' });
  assert.deepEqual(radioKey(status, { env: {}, keyFile: `${OTHER_KEY}\n` }), { token: OTHER_KEY, source: 'key-file' });
  assert.deepEqual(radioKey(status, { env: {}, keyFile: '' }), { token: FAKE_KEY, source: 'status-file' });
});

test('a value that is not shaped like a key counts as absent, wherever it sits', () => {
  const status = { sharing: { install_token: FAKE_KEY } };
  assert.equal(radioKey(status, { env: { ORION_INSTALL_TOKEN: 'y' }, keyFile: 'not a key' }).source, 'status-file');
  assert.deepEqual(radioKey({ sharing: { install_token: 'y' } }, { env: {}, keyFile: '' }), { token: null, source: null });
  assert.deepEqual(radioKey(null, { env: {} }), { token: null, source: null });
});

test('a cloud run with no key of its own counts on the key being attached outside the machine', () => {
  const none = { sharing: { install_token: null } };
  assert.deepEqual(radioKey(none, { env: { CLAUDE_CODE_REMOTE: 'true' } }), { token: null, source: 'attached' });
  assert.deepEqual(radioKey(none, { env: { ORION_CLOUD: '1' } }), { token: null, source: 'attached' });
  // A key on the machine still wins: attached is only ever the last resort.
  assert.equal(radioKey(none, { env: { CLAUDE_CODE_REMOTE: 'true' }, keyFile: FAKE_KEY }).source, 'key-file');
  assert.deepEqual(keyHeader({ token: null, source: 'attached' }), {});
  assert.deepEqual(keyHeader({ token: FAKE_KEY, source: 'key-file' }), { Authorization: `Bearer ${FAKE_KEY}` });
});

test('the radio counts as configured with its key in any of those places, and as off with none', () => {
  const paired = { sharing: { status_signal_enabled: true, bridge_url: 'https://radio.test/api/bridge', harness_id: HARNESS_ID, install_token: null } };
  assert.equal(radioConfigured(paired, { env: {}, keyFile: '' }), false);
  assert.equal(radioOn(paired, { env: {}, keyFile: FAKE_KEY }), true);
  assert.equal(radioOn(paired, { env: { ORION_INSTALL_TOKEN: FAKE_KEY } }), true);
  assert.equal(radioOn(paired, { env: { CLAUDE_CODE_REMOTE: 'true' } }), true);
  // The client's own switch still decides, key or no key.
  const off = { sharing: { ...paired.sharing, status_signal_enabled: false } };
  assert.equal(radioOn(off, { env: { CLAUDE_CODE_REMOTE: 'true' }, keyFile: FAKE_KEY }), false);
  // No address or no harness id is never rescued by a key.
  assert.equal(radioConfigured({ sharing: { install_token: FAKE_KEY } }, { env: {} }), false);
});

test('only a cloud run is a cloud run', () => {
  assert.equal(isCloudRun({}), false);
  assert.equal(isCloudRun({ CLAUDE_CODE_REMOTE: 'false' }), false);
  assert.equal(isCloudRun({ CLAUDE_CODE_REMOTE: 'true' }), true);
  assert.equal(isCloudRun({ ORION_CLOUD: '1' }), true);
});

test('a script starts again with proxy support only on a cloud run that names a proxy, on a Node that knows how', () => {
  const cloud = { CLAUDE_CODE_REMOTE: 'true', HTTPS_PROXY: 'http://127.0.0.1:9' };
  assert.equal(wantsEnvProxy(cloud, '22.22.0'), true);
  assert.equal(wantsEnvProxy({ CLAUDE_CODE_REMOTE: 'true', https_proxy: 'http://127.0.0.1:9' }, '24.1.0'), true);
  assert.equal(wantsEnvProxy({ ...cloud, NODE_USE_ENV_PROXY: '1' }, '22.22.0'), false, 'already on: never twice');
  assert.equal(wantsEnvProxy({ CLAUDE_CODE_REMOTE: 'true' }, '22.22.0'), false, 'no proxy named');
  assert.equal(wantsEnvProxy({ HTTPS_PROXY: 'http://127.0.0.1:9' }, '22.22.0'), false, 'a person\'s own machine is left alone');
  assert.equal(wantsEnvProxy(cloud, '22.20.9'), false);
  assert.equal(wantsEnvProxy(cloud, '23.11.0'), false);
  const env = envProxyEnv({ NODE_OPTIONS: '--max-old-space-size=8192', KEPT: 'yes' });
  assert.equal(env.NODE_USE_ENV_PROXY, '1');
  assert.equal(env.KEPT, 'yes');
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=8192 --disable-warning=UNDICI-EHPA');
  assert.equal(envProxyEnv({}).NODE_OPTIONS, '--disable-warning=UNDICI-EHPA');
});

test('the home is off until it is switched on, and a branch name is held to a plain shape', () => {
  assert.equal(homeOn({}), false);
  assert.equal(homeOn(null), false);
  assert.deepEqual(homeBlock({}), { enabled: false, branch: 'main' });
  assert.equal(homeOn({ home: { enabled: true } }), true);
  assert.equal(homeOn({ home: { enabled: 'yes', branch: 'main' } }), false);
  for (const good of ['main', 'trunk', 'harness/live', 'v1.2']) assert.equal(isHomeBranch(good), true, good);
  for (const bad of ['', '-main', 'a b', 'a..b', 'main/', 'main.lock', 'x;rm', 'a//b', '.hidden', 7, null]) {
    assert.equal(isHomeBranch(bad), false, String(bad));
    assert.equal(homeOn({ home: { enabled: true, branch: bad } }), false, String(bad));
  }
});

test('an ssh address has an https twin, and nothing else does', () => {
  assert.equal(httpsTwin('git@github.com:acme/notebook.git'), 'https://github.com/acme/notebook.git');
  assert.equal(httpsTwin('git@github.com:acme/notebook'), 'https://github.com/acme/notebook.git');
  assert.equal(httpsTwin('https://github.com/acme/notebook.git'), null);
  assert.equal(httpsTwin('/shared/drive/notebook'), null);
  assert.equal(httpsTwin(null), null);
});

test('a key shape is caught, and a sentence about a password is not', () => {
  for (const line of [
    `token ${FAKE_KEY}`,
    '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----',
    'key: ' + 'sk-' + 'abcdefghijklmnopqrstuv',
    'gh' + 'p_' + 'a'.repeat(36),
    'github_' + 'pat_' + 'A1b2'.repeat(10),
    'xox' + 'b-123456789012-abcdefghij',
    'AI' + 'za' + 'B'.repeat(35),
    'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
    'sk_' + 'live_' + 'a1'.repeat(12),
    'pat-' + 'na1-' + '0f'.repeat(4) + '-' + '1a2b'.repeat(6),
  ]) assert.equal(looksLikeKey(line), true, line.slice(0, 12));
  for (const line of [
    'password: ask Jane, never written down here',
    'The api_key = whatever HubSpot shows on that page',
    'risk-assessment-framework-for-the-board',
    'orion_ is how every key starts',
    'see task-completed-signals in the radio guide',
  ]) assert.equal(looksLikeKey(line), false, line);
  // The looser rule still exists, for notes and log lines a person writes.
  assert.equal(looksLikeCredential('password: hunter2 reset'), true);
});

test('tripwire: no file this repository ships holds a line shaped like a key', (t) => {
  const listed = spawnSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' });
  if (listed.status !== 0) return t.skip('not a git checkout');
  const hits = [];
  for (const rel of listed.stdout.split('\0').filter(Boolean)) {
    let text;
    try { text = readFileSync(join(repo, rel), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    text.split('\n').forEach((line, i) => { if (looksLikeKey(line)) hits.push(`${rel}:${i + 1}`); });
  }
  // A client who gives their folder a home saves these files to it. A fixture
  // that looks like a key would be held back on their very first save.
  assert.deepEqual(hits, []);
});

// ── The radio, with the key somewhere other than status.json ────────────────

test('a key in status/radio.key is the key the radio sends', (t) => {
  const h = makeFolder(t, { sharing: { install_token: null }, keyFile: `${OTHER_KEY}\n` });
  const r = h.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '3']);
  assert.match(r.out, /Signal sent \(task_completed\)\./);
  const calls = h.calls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].auth, `Bearer ${OTHER_KEY}`);
  assert.equal(calls[0].envProxy, null, 'a person\'s own machine reaches the radio as it always has');
});

test('a key handed in by the environment wins over the one in status.json', (t) => {
  const h = makeFolder(t);
  h.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '1'], { ORION_INSTALL_TOKEN: OTHER_KEY });
  assert.equal(h.calls()[0].auth, `Bearer ${OTHER_KEY}`);
});

test('with no key anywhere, on a machine that is not a cloud run, the radio stays off', (t) => {
  const h = makeFolder(t, { sharing: { install_token: null } });
  const r = h.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '1']);
  assert.match(r.out, /Radio is off \(or not configured\)/);
  assert.equal(h.calls().length, 0);
});

test('a cloud run sends its call once, with no key, and through the machine\'s proxy', (t) => {
  const h = makeFolder(t, { sharing: { install_token: null } });
  const r = h.run('status/radio.mjs', ['signal', '--type', 'routine_completed', '--routine', 'dream', '--tag', 'ops', '--count', '2', '--result-line', 'yes'],
    { ...CLOUD, HTTPS_PROXY: 'http://127.0.0.1:9' });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Signal sent \(routine_completed\)\./);
  assert.match(r.out, /\[radio-result\] sent/);
  const calls = h.calls();
  assert.equal(calls.length, 1, 'started again exactly once, and only the second start makes the call');
  assert.equal(calls[0].auth, null, 'the key is added after the call has left the machine, never here');
  assert.equal(calls[0].envProxy, '1');
  assert.deepEqual(calls[0].body.payload, {
    ops_stage: 'seven_day_checkin', harness_status: 'validated', template_version: '1.3.0',
    count: 2, routine: 'dream', tag: 'ops',
  });
});

test('a cloud run whose environment holds no key says where the key belongs', (t) => {
  const h = makeFolder(t, { sharing: { install_token: null }, answer: 401 });
  const r = h.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '1', '--result-line', 'yes'], CLOUD);
  assert.equal(r.code, 0);
  assert.match(r.out, /This is a cloud run, so the key is meant to\nbe added by the cloud environment, as a secret for radio\.test\./);
  assert.match(r.out, /\[radio-result\] refused 401/);
  assert.doesNotMatch(r.out, /pairing code/, 'a fresh pairing code is the wrong fix on a cloud run');
});

test('a cloud run that cannot reach the radio says the environment may not be allowed to', (t) => {
  const h = makeFolder(t, { sharing: { install_token: null }, answer: 'unreachable' });
  const r = h.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '1', '--result-line', 'yes'], CLOUD);
  assert.equal(r.code, 0);
  assert.match(r.out, /The radio address didn't answer \(ENOTFOUND\)/);
  assert.match(r.out, /the cloud environment may not reach radio\.test\./);
  assert.match(r.out, /\[radio-result\] unreachable/);
  // The same silence on a person's own machine gets no cloud advice.
  const own = makeFolder(t, { name: 'own', answer: 'unreachable' });
  assert.doesNotMatch(own.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '1']).out, /cloud/);
});

test('an install checkpoint is sent with the key from status/radio.key too', (t) => {
  const h = makeFolder(t, { sharing: { install_token: null }, keyFile: FAKE_KEY, status: { checklist: {}, stage_history: [] } });
  const r = h.run('status/emit-status.mjs', ['--harness_status', 'validated']);
  assert.match(r.out, /Status signal sent \(via the radio\)\./);
  assert.equal(h.calls()[0].auth, `Bearer ${FAKE_KEY}`);
});

test('finished work with no home says nothing about one, and never runs git', (t) => {
  const h = makeFolder(t);
  const r = h.run('status/done.mjs', ['--tag', 'admin', '--line', 'filed the receipts']);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /home/);
  assert.equal(h.exists('.git'), false);
  const direct = h.run('status/home.mjs', ['sync']);
  assert.equal(direct.out, 'This folder has no home switched on. Nothing was saved and nothing was fetched.\n');
  assert.equal(h.exists('.git'), false);
});

// ── prepare and check ───────────────────────────────────────────────────────

test('prepare without --yes says what it would do and changes nothing', (t) => {
  const h = makeFolder(t);
  const before = h.read('status/status.json');
  const r = h.run('status/home.mjs', ['prepare']);
  assert.match(r.out, /This would, on this machine only:/);
  assert.match(r.out, /Move the radio key out of status\/status\.json/);
  assert.match(r.out, /Nothing is created anywhere and nothing is sent\./);
  assert.equal(h.read('status/status.json'), before);
  assert.equal(h.exists('.git'), false);
  assert.equal(h.exists('status/radio.key'), false);
  assert.equal(h.exists('.gitignore'), false);
});

test('prepare moves the key out, sets the rules, switches the home on, and never prints the key', (t) => {
  const h = makeFolder(t, { files: { '.gitignore': 'status/status.json\n.DS_Store\nmemory/*\n!memory/README.md\nmy-own-notes/\n' } });
  const r = h.run('status/home.mjs', ['prepare', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes(FAKE_KEY) && !r.err.includes(FAKE_KEY), 'the key is never printed');

  assert.equal(h.status().sharing.install_token, null);
  assert.equal(h.read('status/radio.key'), `${FAKE_KEY}\n`);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(h.dir, 'status', 'radio.key')).mode & 0o777, 0o600, 'only its owner can read the key file');
  }
  assert.deepEqual(h.status().home, { enabled: true, branch: 'main' });
  assert.ok(h.exists('.git'));

  const ignore = h.read('.gitignore').split('\n');
  assert.ok(ignore.includes('status/radio.key'));
  assert.ok(!ignore.includes('status/status.json'), 'status.json travels, now that it holds no key');
  assert.ok(ignore.includes('my-own-notes/'), 'the owner\'s own lines are kept');
  assert.ok(ignore.includes('.DS_Store'));
  // A notebook in a plain folder has nowhere else to be saved: it travels.
  assert.ok(!ignore.includes('memory/*') && !ignore.includes('!memory/README.md'));
  for (const rule of ['status/shifts/', '.update-backup/', 'node_modules/', '.env', '.claude/settings.local.json', '.claude/worktrees/']) {
    assert.ok(ignore.includes(rule), rule);
  }
  const attributes = h.read('.gitattributes');
  assert.match(attributes, /^status\/shift-log\.md merge=union$/m);
  assert.match(attributes, /^status\/work-log\.md merge=union$/m);

  // The radio still works: it finds the key where prepare put it.
  h.run('status/radio.mjs', ['signal', '--type', 'task_completed', '--tag', 'crm', '--count', '1']);
  assert.equal(h.calls()[0].auth, `Bearer ${FAKE_KEY}`);

  // Twice is the same as once.
  const again = h.run('status/home.mjs', ['prepare', '--yes']);
  assert.match(again.out, /Nothing to prepare: this folder is already set up for a home\./);
  assert.equal(h.read('.gitignore').split('\n').filter((l) => l === 'status/radio.key').length, 1);
});

test('a notebook with a repository of its own stays out of the home whole', (t) => {
  const h = makeFolder(t, {
    status: { memory: { enabled: true, backend: 'git', remote: 'git@github.com:acme/notebook.git', path: 'memory' } },
    files: { '.gitignore': 'status/status.json\nmemory/*\n!memory/README.md\n', 'memory/README.md': 'the notebook\n' },
  });
  h.run('status/home.mjs', ['prepare', '--yes']);
  const ignore = h.read('.gitignore').split('\n');
  assert.ok(ignore.includes('memory/'));
  assert.ok(!ignore.includes('!memory/README.md'), 'its README belongs to the notebook\'s own repository');
  assert.ok(h.git(['check-ignore', '-q', 'memory/README.md']).ok);
});

test('prepare refuses an address git could not save to, and notes a good one', (t) => {
  const h = makeFolder(t);
  const bad = h.run('status/home.mjs', ['prepare', '--remote', 'my repo', '--yes']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /Nothing was changed\./);
  assert.equal(h.exists('.git'), false);
  assert.equal(h.status().sharing.install_token, FAKE_KEY);

  const home = makeHome(h.base);
  const good = h.run('status/home.mjs', ['prepare', '--remote', home, '--yes']);
  assert.match(good.out, /Ready\. The first save: node status\/home\.mjs sync/);
  assert.equal(h.git(['remote', 'get-url', 'origin']).out, home);
});

test('check names what stands in the way, changes nothing, and says ready when nothing does', (t) => {
  const h = makeFolder(t, { files: { 'notes/setup.md': `first line\nthe key is ${OTHER_KEY}\n` } });
  const before = h.run('status/home.mjs', ['check']);
  assert.match(before.out, /This folder is not a git repository yet\. prepare makes it one\./);
  assert.equal(h.exists('.git'), false);

  h.run('status/home.mjs', ['prepare', '--yes']);
  const noAddress = h.run('status/home.mjs', ['check']);
  assert.match(noAddress.out, /Not ready for a home yet\./);
  assert.match(noAddress.out, /This folder has no address for its home yet\./);
  assert.match(noAddress.out, /notes\/setup\.md, line 2: shaped like a key\./);
  assert.ok(!noAddress.out.includes(OTHER_KEY), 'a line shaped like a key is pointed at, never repeated');

  h.write('notes/setup.md', 'first line\nthe key is in the password manager\n');
  h.run('status/home.mjs', ['prepare', '--remote', makeHome(h.base), '--yes']);
  assert.match(h.run('status/home.mjs', ['check']).out, /^Ready\. The home is on \(branch main\)/);
});

// ── sync: what reaches the home, and what never does ────────────────────────

test('the first save carries status.json and the scripts, and never the key', (t) => {
  const { local, home } = homed(t, { files: { 'agent/knowledge-base/01-business-context.md': 'We sell tea.\n', 'memory/shared/inbox.md': '# Inbox\n' } });
  const files = homeFiles(local.base, home);
  for (const expected of ['status/status.json', 'status/done.mjs', 'status/home.mjs', '.gitignore', '.gitattributes',
    'agent/knowledge-base/01-business-context.md', 'memory/shared/inbox.md']) {
    assert.ok(files.includes(expected), expected);
  }
  assert.ok(!files.includes('status/radio.key'));
  assert.equal(JSON.parse(inHome(local.base, home, 'status/status.json')).sharing.install_token, null);
  assert.equal(JSON.parse(inHome(local.base, home, 'status/status.json')).sharing.harness_id, HARNESS_ID, 'a fresh copy still knows which harness it is');
  // Nowhere in the home, in any file, in any save.
  const found = git(local.base, home, ['log', '--all', '--format=%h', '-S', FAKE_KEY]);
  assert.equal(found.out, '');
  // And the folder is still paired on this machine.
  assert.equal(local.read('status/radio.key'), `${FAKE_KEY}\n`);
  assert.match(local.run('status/home.mjs', ['sync']).out, /The folder and its home already match\./);
});

test('a cloud run reports its shift and leaves its line in the home, and the owner\'s machine picks it up', (t) => {
  const { local, home } = homed(t);

  // The cloud: a fresh copy, no key file, no branch checked out, thrown away after.
  const cloud = freshCopy(local, home, 'cloud');
  assert.equal(cloud.exists('status/radio.key'), false);
  const shift = cloud.run('status/done.mjs', shiftArgs('dream', 'tidied the notebook'), { ...CLOUD, HTTPS_PROXY: 'http://127.0.0.1:9' });
  assert.equal(shift.code, 0, shift.err);
  assert.match(shift.out, /Shift finished: agent dream, tag ops, count 2\./);
  assert.match(shift.out, /Signal sent \(routine_completed\)\./);
  assert.match(shift.out, /Saved to the folder's home\./);

  const calls = cloud.calls();
  assert.equal(calls.length, 1, 'one shift, one signal');
  assert.equal(calls[0].auth, null);
  assert.equal(calls[0].body.signal_type, 'routine_completed');
  assert.equal(calls[0].body.harness_id, HARNESS_ID);
  assert.equal(calls[0].body.payload.tag, 'ops');
  assert.equal(calls[0].body.payload.routine, 'dream');

  assert.match(inHome(local.base, home, 'status/shift-log.md'), /\| dream \| count: 2 \| auto: tidied the notebook$/);
  assert.equal(git(local.base, home, ['log', '-1', '--format=%s', 'main']).out, 'shift: dream, ops, count 2 (a cloud run)');

  // Meanwhile the owner's machine finished a shift of its own, without knowing.
  const own = local.run('status/done.mjs', shiftArgs('inbox', 'triaged the morning mail', '5'));
  assert.match(own.out, /Saved to the folder's home\. Brought in 1 newer save from there\./);
  const lines = local.read('status/shift-log.md').trim().split('\n');
  assert.equal(lines.length, 2, 'both lines, neither one lost');
  assert.ok(lines.some((l) => l.includes('| dream |')) && lines.some((l) => l.includes('| inbox |')));
  assert.equal(inHome(local.base, home, 'status/shift-log.md').split('\n').length, 2);
  assert.equal(local.calls()[0].auth, `Bearer ${FAKE_KEY}`, 'the owner\'s machine still sends its own key');
});

test('a file with a new line shaped like a key is held back and named, and the rest is saved', (t) => {
  const { local, home } = homed(t);
  local.write('docs/handover.md', `Stripe is set up.\nUse ${'sk_' + 'live_' + 'a1'.repeat(12)} for the dashboard.\n`);
  local.write('docs/plan.md', 'Call the top ten accounts.\n');
  const r = local.run('status/home.mjs', ['sync']);
  assert.match(r.out, /Held back, not saved: docs\/handover\.md \(line 2 is shaped like a key\)\. Take the key out and it is saved next time\./);
  assert.match(r.out, /Saved to the folder's home\./);
  assert.ok(!r.out.includes('sk_' + 'live_'), 'the line itself is never repeated');
  const files = homeFiles(local.base, home);
  assert.ok(files.includes('docs/plan.md'));
  assert.ok(!files.includes('docs/handover.md'));
  assert.ok(local.exists('docs/handover.md'), 'held back is not deleted');

  // With the key taken out, it is saved the next time.
  local.write('docs/handover.md', 'Stripe is set up.\nThe key is in the password manager.\n');
  local.run('status/home.mjs', ['sync']);
  assert.ok(homeFiles(local.base, home).includes('docs/handover.md'));
});

test('the key file is taken out of a save even when its ignore rule has been deleted', (t) => {
  const { local, home } = homed(t);
  local.write('.gitignore', local.read('.gitignore').replace('status/radio.key\n', ''));
  const r = local.run('status/home.mjs', ['sync']);
  assert.match(r.out, /Held back, not saved: status\/radio\.key \(it is the radio key, and the key is never saved\)\./);
  assert.ok(!homeFiles(local.base, home).includes('status/radio.key'));
  assert.equal(git(local.base, home, ['log', '--all', '--format=%h', '-S', FAKE_KEY]).out, '');
  assert.equal(local.read('status/radio.key'), `${FAKE_KEY}\n`, 'and it is still on this machine');
});

test('a key that found its way back into status.json is moved out before anything is saved', (t) => {
  const { local, home } = homed(t);
  const status = local.status();
  status.sharing.install_token = OTHER_KEY; // what an older wizard would write on a fresh pairing
  local.write('status/status.json', JSON.stringify(status, null, 2) + '\n');
  const r = local.run('status/home.mjs', ['sync']);
  assert.match(r.out, /The radio key was inside status\/status\.json\. It is now in status\/radio\.key, which is never saved\./);
  assert.equal(local.read('status/radio.key'), `${OTHER_KEY}\n`);
  assert.equal(JSON.parse(inHome(local.base, home, 'status/status.json')).sharing.install_token, null);
  assert.equal(git(local.base, home, ['log', '--all', '--format=%h', '-S', OTHER_KEY]).out, '');
});

test('a repository sitting inside the folder is left out, with or without a commit in it', (t) => {
  const { local, home } = homed(t);
  mkdirSync(join(local.dir, 'vendor', 'empty'), { recursive: true });
  assert.ok(git(local.base, join(local.dir, 'vendor', 'empty'), ['init', '-q', '-b', 'main']).ok);
  mkdirSync(join(local.dir, 'vendor', 'full'), { recursive: true });
  const full = join(local.dir, 'vendor', 'full');
  assert.ok(git(local.base, full, ['init', '-q', '-b', 'main']).ok);
  writeFileSync(join(full, 'a.txt'), 'a\n');
  git(local.base, full, ['add', '-A']);
  assert.ok(git(local.base, full, ['commit', '-q', '-m', 'a']).ok);
  local.write('docs/plan.md', 'Call the top ten accounts.\n');

  const r = local.run('status/home.mjs', ['sync']);
  assert.match(r.out, /Held back, not saved: vendor\/empty\/ \(it is a repository of its own\)\./);
  assert.match(r.out, /Held back, not saved: vendor\/full\/ \(it is a repository of its own\)\./);
  assert.match(r.out, /Saved to the folder's home\./);
  const files = homeFiles(local.base, home);
  assert.ok(files.includes('docs/plan.md'));
  assert.ok(!files.some((f) => f.startsWith('vendor/')));
});

test('a clash leaves the owner\'s machine exactly as it was, and parks a cloud run\'s work on a branch', (t) => {
  const { local, home } = homed(t, { files: { 'status/queue.json': '{ "next": 1 }\n' } });
  const early = freshCopy(local, home, 'early'); // a cloud run that started before the change below
  const other = freshCopy(local, home, 'other');
  other.write('status/queue.json', '{ "next": 2 }\n');
  assert.match(other.run('status/home.mjs', ['sync'], CLOUD).out, /Saved to the folder's home\./);

  // The owner's machine changed the same line.
  local.write('status/queue.json', '{ "next": 3 }\n');
  const own = local.run('status/home.mjs', ['sync']);
  assert.match(own.out, /Not saved to the folder's home: the home has changes that clash with this folder's \(status\/queue\.json\)\./);
  assert.match(own.out, /Nothing is lost: this machine keeps its own copy/);
  assert.equal(own.code, 0);
  assert.equal(local.read('status/queue.json'), '{ "next": 3 }\n');
  assert.equal(local.git(['status', '--porcelain']).out, '', 'no half-finished git step is left behind');
  assert.equal(inHome(local.base, home, 'status/queue.json'), '{ "next": 2 }');
  assert.deepEqual(homeBranches(local.base, home), ['main'], 'nothing is parked from a machine that keeps its own copy');

  // The cloud run that started early is about to be thrown away: its work is parked.
  early.write('status/queue.json', '{ "next": 4 }\n');
  const parked = early.run('status/home.mjs', ['sync', '--message', 'shift: gate, crm, count 1'], CLOUD);
  assert.equal(parked.code, 0);
  const branch = /parked there on the branch (unsaved\/\d{8}-\d{6}), so it is not lost\./.exec(parked.out);
  assert.ok(branch, parked.out);
  assert.ok(homeBranches(local.base, home).includes(branch[1]));
  assert.equal(inHome(local.base, home, 'status/queue.json', branch[1]), '{ "next": 4 }');
  assert.equal(inHome(local.base, home, 'status/queue.json'), '{ "next": 2 }', 'main is untouched by the clash');
});

test('a home that cannot be reached costs nothing: one plain line, exit 0, the work stays', (t) => {
  const h = makeFolder(t);
  const nowhere = join(h.base, 'not-a-repository');
  mkdirSync(nowhere);
  h.run('status/home.mjs', ['prepare', '--remote', nowhere, '--yes']);
  const r = h.run('status/done.mjs', ['--tag', 'admin', '--line', 'filed the receipts']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Written to status\/work-log\.md\./);
  assert.match(r.out, /Signal sent \(task_completed\)\./);
  assert.match(r.out, /Not saved to the folder's home: the home could not be reached \(.+\)\. Nothing is lost: this machine keeps its own copy, and the next save tries again\./);
  assert.match(h.read('status/work-log.md'), /filed the receipts/);
});

test('a save works on a machine that has never told git a name', (t) => {
  // The scratch git config is empty (see scratch), so every commit above was
  // already made without one. This case says so out loud, and checks the name used.
  const { local, home } = homed(t, { status: { agent_name: 'Astra <the> assistant' } });
  const author = git(local.base, home, ['log', '-1', '--format=%an <%ae>', 'main']).out;
  assert.equal(author, 'Astra the assistant <harness@orion.invalid>');
});

// ── The wizard, on a folder that has a home ─────────────────────────────────

test('pairing a folder that has a home puts the key in status/radio.key, never in status.json', (t) => {
  const h = makeFolder(t, {
    sharing: { install_token: null, harness_id: null, bridge_url: null, radio_choice: 'accepted' },
    status: { home: { enabled: true, branch: 'main' }, checklist: {}, packages: {}, stage_history: [], machine_profile: null },
  });
  copyFileSync(join(repo, 'start.mjs'), join(h.dir, 'start.mjs'));
  copyFileSync(join(statusDir, 'status.schema-template.json'), join(h.dir, 'status', 'status.schema-template.json'));
  const r = h.run('start.mjs', ['--code', CODE]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Paired\. Your key is saved on this machine only, in status\/radio\.key/);
  assert.ok(!r.out.includes(OTHER_KEY), 'the wizard never prints the key');
  assert.equal(h.status().sharing.install_token, null);
  assert.equal(h.status().sharing.harness_id, HARNESS_ID);
  assert.equal(h.read('status/radio.key'), `${OTHER_KEY}\n`);
  // The first check-in, sent in the same breath, already carries the new key.
  const signal = h.calls().find((c) => c.path === '/api/bridge/signals');
  assert.equal(signal.auth, `Bearer ${OTHER_KEY}`);

  // Run again: it finds the key where it put it, and does not ask to pair twice.
  const again = h.run('start.mjs', []);
  assert.doesNotMatch(again.out, /Pairing code/);
});

test('the wizard still writes the key to status.json on a folder with no home', (t) => {
  const h = makeFolder(t, {
    sharing: { install_token: null, harness_id: null, bridge_url: null, radio_choice: 'accepted' },
    status: { checklist: {}, packages: {}, stage_history: [], machine_profile: null },
  });
  copyFileSync(join(repo, 'start.mjs'), join(h.dir, 'start.mjs'));
  copyFileSync(join(statusDir, 'status.schema-template.json'), join(h.dir, 'status', 'status.schema-template.json'));
  const r = h.run('start.mjs', ['--code', CODE]);
  assert.match(r.out, /your key is saved in your own bookmark file/);
  assert.equal(h.status().sharing.install_token, OTHER_KEY);
  assert.equal(h.exists('status/radio.key'), false);
  assert.deepEqual(h.status().home, { enabled: false, branch: 'main' }, 'an older bookmark gains the home block, switched off');
});

// ── The notebook on a cloud run ─────────────────────────────────────────────

test('a cloud run fetches the notebook by itself and takes the repository\'s copy as it is', (t) => {
  // An absolute path stands in for the notebook's address, and only a POSIX
  // path has the shape the memory block accepts.
  if (process.platform === 'win32') return t.skip('needs a POSIX path as the notebook address');
  const base = scratch(t);
  const notebook = makeHome(base, 'notebook.git');
  const seed = join(base, 'seed');
  assert.ok(git(base, base, ['clone', '-q', notebook, seed]).ok);
  writeFileSync(join(seed, 'README.md'), 'the notebook, as its own repository has it\n');
  writeFileSync(join(seed, 'INDEX.md'), '# Memory index\n');
  git(base, seed, ['add', '-A']);
  assert.ok(git(base, seed, ['commit', '-q', '-m', 'notebook']).ok);
  assert.ok(git(base, seed, ['push', '-q', 'origin', 'HEAD:refs/heads/main']).ok);

  const h = makeFolder(t, {
    base,
    status: { memory: { enabled: true, backend: 'git', remote: notebook, path: 'memory' } },
    files: { 'memory/README.md': 'an old copy that came along with the harness\n' },
  });
  // On a person's own machine, joining a team notebook is never done silently.
  assert.match(h.run('status/memory.mjs', ['sync']).out, /not a clone — run init/);
  assert.equal(h.exists('memory/.git'), false);

  const r = h.run('status/memory.mjs', ['sync'], CLOUD);
  assert.match(r.out, /Memory synced\./);
  assert.ok(h.exists('memory/.git'));
  assert.equal(h.read('memory/README.md'), 'the notebook, as its own repository has it\n');
  assert.equal(h.read('memory/INDEX.md'), '# Memory index\n');
  // Nothing from the harness's stale copy was pushed back over the notebook.
  assert.equal(git(base, notebook, ['log', '--format=%s', 'main']).out, 'notebook');
});
