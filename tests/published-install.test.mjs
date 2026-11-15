import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
async function fixture(t, tool = 'codex') {
  const base = mkdtempSync(join(tmpdir(), 'published-install-')),
    repo = join(base, 'repo'),
    target = join(base, 'client');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const put = (p, s) => {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    writeFileSync(join(repo, p), s);
  };
  for (const p of [
    'install.mjs',
    'update/destination-resolver.mjs',
    'status/status.schema-template.json',
  ]) {
    mkdirSync(dirname(join(repo, p)), { recursive: true });
    copyFileSync(join(root, p), join(repo, p));
  }
  put('AGENTS.md', 'Published fixture\n');
  put('tool.md', 'Selected tool layout\n');
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  const commits = {};
  for (const version of ['2.9.0', '2.10.0']) {
    put(
      'update/manifest.json',
      JSON.stringify({
        template_version: version,
        deployment: {
          tools: ['codex', 'claude-code'],
          entries: [
            {
              source: 'tool.md',
              destinations: {
                codex: 'agents/README.md',
                'claude-code': '.claude/agents/README.md',
              },
              ownership: 'release',
              fingerprint_key: 'tool.md',
            },
          ],
          common_sources: ['AGENTS.md'],
        },
      }),
    );
    put('AGENTS.md', `Published ${version}\n`);
    git('add', '.');
    git('commit', '-qm', version);
    git('tag', '-a', `v${version}`, '-m', version);
    commits[version] = git('rev-parse', 'HEAD');
  }
  const release = (id, tag, more = {}) => ({
    id,
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: '2026-01-01',
    body: 'Notes',
    ...more,
  });
  const state = {
    releases: [
      release(1, 'v2.9.0', { published_at: '2026-12-01' }),
      release(2, 'v2.10.0'),
      release(3, 'v9.0.0', { draft: true }),
      release(4, 'v8.0.0', { prerelease: true }),
      release(5, 'v7.0.0', { body: '<!-- orion:withdrawn -->' }),
      release(6, 'v02.0.0'),
    ],
    working: true,
    pairRequests: 0,
    libraryRequests: 0,
    redirectsFollowed: 0,
  };
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    let body;
    if (req.url.includes('/releases?')) {
      if (state.outage) {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      body = state.releases.slice(
        (Number(new URL(req.url, 'http://fixture').searchParams.get('page')) -
          1) *
          100,
        Number(new URL(req.url, 'http://fixture').searchParams.get('page')) *
          100,
      );
    } else if (req.url.includes('/releases/')) {
      body = structuredClone(
        state.releases.find((r) => String(r.id) === req.url.split('/').at(-1)),
      );
      if (state.withdraw) body.body = '<!-- orion:withdrawn -->';
      if (state.retag) git('tag', '-f', 'v2.10.0', commits['2.9.0']);
    } else if ((req.url === '/pair' && state.redirectPair) ||
      (req.url === '/library' && state.redirectProbe)) {
      res.writeHead(307, { Location: '/redirected' });
      res.end();
      return;
    } else if (req.url === '/redirected') {
      state.redirectsFollowed++;
      body = {};
    } else if (req.url === '/pair') {
      state.pairRequests++;
      body = {
        harness_id: state.malformedPair ? 'invalid-id' : '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
        install_token: 'orion_' + (state.requireFresh ? 'fresh' : 'fixture').repeat(5),
        ...(state.foreignBridge ? { bridge_url: 'https://other.test' } : {}),
      };
    } else if (req.url === '/library' || req.url === '/releases') {
      if (req.url === '/library') state.libraryRequests++;
      if (!state.working || (state.requireFresh &&
          req.headers.authorization !== 'Bearer orion_' + 'fresh'.repeat(5))) {
        res.statusCode = 401;
      }
      if (req.url === '/releases' && state.noticeUnavailable) res.statusCode = 503;
      body = req.url === '/library' ? { assets: [] } : { version: 1, release_notices: true };
    } else {
      res.statusCode = 404;
      body = {};
    }
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const bridge = 'https://fixture-bridge.test';
  const preload = join(base, 'bridge-fetch.mjs');
  writeFileSync(preload, `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, options) => {
      const url = new URL(input);
      if (url.origin === '${bridge}') return originalFetch('${url}' + url.pathname, options);
      if (url.origin === 'https://other.test') throw new Error('Foreign bridge reached');
      return originalFetch(input, options);
    };
  `);
  const run = (...extra) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [
        '--import', preload,
        join(root, 'install-published.mjs'),
        '--repository',
        'fixture/orion',
        '--api-base',
        url,
        '--source-url',
        repo,
        '--bridge-url',
        bridge,
        '--target',
        target,
        '--tool',
        tool,
        ...extra,
      ]);
      let output = '';
      p.stdout.on('data', (d) => (output += d));
      p.stderr.on('data', (d) => (output += d));
      p.on('close', (code) => resolve({ code, output }));
    });
  return { target, state, run, commits, repo, git };
}
test('new client installs highest stable published version and records peeled identity after working pairing', async (t) => {
  const f = await fixture(t),
    r = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(r.code, 0, r.output);
  assert.equal(
    readFileSync(join(f.target, 'AGENTS.md'), 'utf8'),
    'Published 2.10.0\n',
  );
  const status = JSON.parse(readFileSync(join(f.target, 'status/status.json')));
  assert.deepEqual(
    { ...status.applied_release, applied_at: 'TIME' },
    {
      tag: 'v2.10.0',
      commit: f.commits['2.10.0'],
      release_id: 2,
      manifest_version: '2.10.0',
      applied_at: 'TIME',
    },
  );
  assert.ok(Date.parse(status.applied_release.applied_at));
  assert.equal(status.sharing.status_signal_enabled, true);
});
test('pairing pauses without success, and the same pinned request resumes when radio works', async (t) => {
  const f = await fixture(t),
    pending = join(
      dirname(f.target),
      '.client-published-install/harness/status/status.json',
    );
  let r = await f.run();
  assert.equal(r.code, 3, r.output);
  assert.equal(existsSync(f.target), false);
  assert.equal(JSON.parse(readFileSync(pending)).applied_release, undefined);
  f.state.working = false;
  r = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(r.code, 3, r.output);
  assert.equal(JSON.parse(readFileSync(pending)).applied_release, undefined);
  f.state.working = true;
  r = await f.run();
  assert.equal(r.code, 0, r.output);
  assert.equal(
    JSON.parse(readFileSync(join(f.target, 'status/status.json')))
      .applied_release.release_id,
    2,
  );
});
test('revoked pairing can be replaced with a new code when resuming', async (t) => {
  const f = await fixture(t);
  f.state.working = false;
  assert.equal((await f.run('--code', 'BCDF-GHJK-LMNP')).code, 3);
  f.state.requireFresh = true;
  f.state.working = true;
  const r = await f.run('--code', 'QRST-VWXZ-BCDF');
  assert.equal(r.code, 0, r.output);
});
for (const failure of [
  'outage',
  'withdraw',
  'retag',
  'missing-source',
  'manifest-mismatch',
])
  test(`${failure} stops before first install write`, async (t) => {
    const f = await fixture(t);
    if (failure === 'missing-source') f.git('tag', '-d', 'v2.10.0');
    else if (failure === 'manifest-mismatch')
      f.git('tag', '-f', 'v2.10.0', f.commits['2.9.0']);
    else f.state[failure] = true;
    const r = await f.run('--code', 'BCDF-GHJK-LMNP');
    assert.equal(r.code, 2, r.output);
    assert.equal(existsSync(f.target), false);
    assert.equal(
      existsSync(join(dirname(f.target), '.client-published-install')),
      false,
    );
  });
test('withdrawal while paused refuses resume without recording success', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run()).code, 3);
  f.state.withdraw = true;
  const r = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(r.code, 2, r.output);
  assert.equal(existsSync(f.target), false);
  assert.equal(
    JSON.parse(
      readFileSync(
        join(
          dirname(f.target),
          '.client-published-install/harness/status/status.json',
        ),
      ),
    ).applied_release,
    undefined,
  );
});
test('a paused harness cannot substitute edited release bytes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run()).code, 3);
  writeFileSync(
    join(dirname(f.target), '.client-published-install/harness/AGENTS.md'),
    'tampered',
  );
  const r = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(r.code, 2, r.output);
  assert.equal(existsSync(f.target), false);
});
test('interrupted prepared promotion revalidates and resumes instead of trusting its success record', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run()).code, 3);
  const pending = join(dirname(f.target), '.client-published-install'),
    journal = JSON.parse(readFileSync(join(pending, 'request.json'))),
    statusPath = join(pending, 'harness/status/status.json'),
    status = JSON.parse(readFileSync(statusPath));
  journal.phase = 'ready-to-promote';
  status.applied_release = {
    ...journal.pin,
    applied_at: '2020-01-01T00:00:00.000Z',
  };
  writeFileSync(join(pending, 'request.json'), JSON.stringify(journal));
  writeFileSync(statusPath, JSON.stringify(status));
  const r = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(r.code, 0, r.output);
  assert.notEqual(
    JSON.parse(readFileSync(join(f.target, 'status/status.json')))
      .applied_release.applied_at,
    '2020-01-01T00:00:00.000Z',
  );
});
test('Claude Code published installation retains its chosen layout across paginated discovery', async (t) => {
  const f = await fixture(t, 'claude-code');
  f.state.releases.unshift(
    ...Array.from({ length: 100 }, (_, i) => ({
      id: 100 + i,
      tag_name: 'invalid',
      draft: false,
      prerelease: false,
      published_at: '2026-01-01',
    })),
  );
  const r = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(r.code, 0, r.output);
  assert.equal(existsSync(join(f.target, '.claude/agents/README.md')), true);
  assert.equal(existsSync(join(f.target, 'agents/README.md')), false);
  assert.equal(
    JSON.parse(readFileSync(join(f.target, 'status/status.json')))
      .selected_tool,
    'claude-code',
  );
});

test('a valid one-time pairing resumes only after release notices become available', async t => {
  const f = await fixture(t);
  f.state.noticeUnavailable = true;
  const paused = await f.run('--code', 'BCDF-GHJK-LMNP');
  assert.equal(paused.code, 3, paused.output);
  assert.equal(existsSync(f.target), false);
  f.state.noticeUnavailable = false;
  const resumed = await f.run();
  assert.equal(resumed.code, 0, resumed.output);
  assert.equal(f.state.pairRequests, 1);
});

for (const problem of ['malformedPair', 'foreignBridge']) {
  test(`published install pauses before authenticating a ${problem} response`, async t => {
    const f = await fixture(t);
    f.state[problem] = true;
    const result = await f.run('--code', 'BCDF-GHJK-LMNP');
    assert.equal(result.code, 3, result.output);
    assert.equal(f.state.libraryRequests, 0);
    assert.equal(existsSync(f.target), false);
    const pending = join(dirname(f.target), '.client-published-install/harness/status/status.json');
    assert.equal(JSON.parse(readFileSync(pending)).sharing.install_token, null);
  });
}

for (const problem of ['redirectPair', 'redirectProbe']) {
  test(`published install stops at a ${problem} response`, async t => {
    const f = await fixture(t);
    f.state[problem] = true;
    const paused = await f.run('--code', 'BCDF-GHJK-LMNP');
    assert.equal(paused.code, 3, paused.output);
    assert.equal(f.state.redirectsFollowed, 0);
    assert.equal(existsSync(f.target), false);
  });
}
