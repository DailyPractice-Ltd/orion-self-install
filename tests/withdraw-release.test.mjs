import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plainEnv } from './helpers/env.mjs';

const script = fileURLToPath(new URL('../.github/scripts/withdraw-release.mjs', import.meta.url));
const commit = 'a'.repeat(40);
const tag = 'v2.3.0';
const id = 456;
const marker = '<!-- orion:withdrawn -->';

function run(t, { release = {}, remoteCommit = commit, releaseId = id, verifyFails = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orion-withdraw-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = join(root, 'fetch.mjs');
  const log = join(root, 'requests.log');
  writeFileSync(log, '');
  writeFileSync(fixture, `
    import { appendFileSync } from 'node:fs';
    let release = ${JSON.stringify({
      id, tag_name: tag, draft: false, prerelease: false, published_at: '2026-11-11T12:00:00Z',
      body: 'Original release notes.\n', ...release,
    })};
    globalThis.fetch = async (url, init = {}) => {
      const target = new URL(url);
      if (target.origin !== 'https://api.github.com') throw Error('Unexpected host');
      const path = target.pathname.replace('/repos/test/orion', '');
      const method = init.method ?? 'GET';
      const payload = init.body ? JSON.parse(init.body) : null;
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({ path, method, payload }) + '\\n');
      if (path === '/releases/tags/${tag}') return Response.json(release);
      if (path === '/releases/${id}' && method === 'PATCH') {
        release = { ...release, ...payload };
        return Response.json(release);
      }
      if (path === '/releases/${id}') return Response.json({
        ...release, ...(${verifyFails} ? { body: 'Marker missing' } : {}),
      });
      if (path === '/git/ref/tags/${tag}') return Response.json({
        ref: 'refs/tags/${tag}', object: { type: 'tag', sha: '${'b'.repeat(40)}' },
      });
      if (path === '/git/tags/${'b'.repeat(40)}') return Response.json({
        object: { type: 'commit', sha: '${remoteCommit}' },
      });
      return Response.json({}, { status: 404 });
    };
  `);
  const result = spawnSync(process.execPath, ['--import', fixture, script,
    '--tag', tag, '--commit', commit, '--release-id', String(releaseId)], {
    encoding: 'utf8', env: { ...plainEnv(), GITHUB_REPOSITORY: 'test/orion', GH_TOKEN: 'fixture' },
  });
  const requests = readFileSync(log, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  return { ...result, writes: requests.filter((request) => request.method !== 'GET') };
}

test('withdrawal annotates the exact published release and preserves its original notes', (t) => {
  const result = run(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { tag, commit, release_id: id, withdrawn: true });
  assert.deepEqual(result.writes, [{
    method: 'PATCH', path: '/releases/456',
    payload: { body: `${marker}\n\n**Withdrawn. Do not install this release.**\n\nOriginal release notes.\n` },
  }]);
});

test('an already marked release is verified without an additional edit', (t) => {
  const result = run(t, { release: { body: marker } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.writes, []);
});

test('withdrawal refuses mismatched or unpublished identities before any edit', (t) => {
  for (const options of [
    { releaseId: 457 }, { remoteCommit: 'c'.repeat(40) }, { release: { draft: true } },
  ]) {
    const result = run(t, options);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /release|commit/i);
    assert.deepEqual(result.writes, []);
  }
});

test('a marker that cannot be read back fails verification', (t) => {
  const result = run(t, { verifyFails: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /verification/i);
  assert.equal(result.writes.length, 1);
});
