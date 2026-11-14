/** Published-release discovery and verification; never falls back to branches or caches. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const WITHDRAWAL_MARKER = '<!-- orion:withdrawn -->';
function stablePublication(r) {
  return (
    Number.isSafeInteger(r?.id) &&
    r.id > 0 &&
    tagPattern.test(r.tag_name) &&
    r.draft === false &&
    r.prerelease === false &&
    !!r.published_at
  );
}
export function eligibleRelease(r) {
  return (
    stablePublication(r) &&
    !r.withdrawn &&
    !String(r.body || '').includes(WITHDRAWAL_MARKER)
  );
}
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    const x = BigInt(a.replace(/^v/, '').split('.')[i]),
      y = BigInt(b.replace(/^v/, '').split('.')[i]);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
function git(...args) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.status !== 0)
    throw new Error('Published release source unavailable or invalid.');
  return r.stdout.trim();
}
export function createReleaseClient({
  repository = 'DailyPractice-Ltd/orion-self-install',
  apiBase = 'https://api.github.com',
  sourceUrl,
} = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error('Expected repository OWNER/NAME.');
  return {
    repository,
    apiBase: apiBase.replace(/\/$/, ''),
    sourceUrl: sourceUrl || `https://github.com/${repository}.git`,
    async get(path) {
      const r = await fetch(
        `${apiBase.replace(/\/$/, '')}/repos/${repository}${path}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            ...(process.env.GH_TOKEN
              ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
              : {}),
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!r.ok)
        throw new Error(`Published release lookup failed (${r.status}).`);
      return r.json();
    },
  };
}
export async function discoverRelease(client) {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await client.get(`/releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Invalid release listing.');
    releases.push(...batch.filter(eligibleRelease));
    if (batch.length < 100) break;
  }
  releases.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  if (!releases.length)
    throw new Error('No eligible published stable release.');
  if (releases[1]?.tag_name === releases[0].tag_name)
    throw new Error('Ambiguous publication identity.');
  return releases[0];
}
function remoteCommit(client, tag) {
  const refs = git(
    'ls-remote',
    '--tags',
    client.sourceUrl,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\s+/));
  const commit = (refs.find((r) => r[1] === `refs/tags/${tag}^{}`) ||
    refs.find((r) => r[1] === `refs/tags/${tag}`))?.[0];
  if (!/^[a-f0-9]{40}$/.test(commit || ''))
    throw new Error('Published tag unavailable or not a full commit.');
  return commit;
}
function checkoutTag(client, tag, checkout, commit) {
  git('init', '-q', checkout);
  git(
    '-C',
    checkout,
    'fetch',
    '--quiet',
    '--depth=1',
    client.sourceUrl,
    `refs/tags/${tag}`,
  );
  if (git('-C', checkout, 'rev-parse', 'FETCH_HEAD^{commit}') !== commit)
    throw new Error('Published tag changed during download.');
  git('-C', checkout, 'checkout', '--quiet', '--detach', commit);
  const manifest = JSON.parse(
    readFileSync(join(checkout, 'update/manifest.json'), 'utf8'),
  );
  if (manifest.template_version !== tag.slice(1))
    throw new Error('Published tag and manifest version disagree.');
  return manifest;
}

export async function pinRelease(client, release, checkout) {
  if (!eligibleRelease(release)) throw new Error('Release is not eligible.');
  const tag = release.tag_name;
  const commit = remoteCommit(client, tag);
  const manifest = checkoutTag(client, tag, checkout, commit);
  return {
    tag,
    commit,
    release_id: release.id,
    manifest_version: manifest.template_version,
  };
}

/** Locate exact historical shipped bytes without making an old release eligible for update. */
export async function checkoutHistoricalRelease(
  client,
  pin,
  checkout,
  fromVersion,
) {
  if (
    pin?.tag !== `v${fromVersion}` ||
    !tagPattern.test(pin.tag) ||
    !/^[a-f0-9]{40}$/.test(pin.commit)
  )
    throw new Error('Missing exact historical release evidence.');
  const manifest = checkoutTag(client, pin.tag, checkout, pin.commit);
  if (pin.release_id !== undefined) {
    await verifyPinnedRelease(client, pin, checkout, { rollbackOnly: true });
  } else if (remoteCommit(client, pin.tag) !== pin.commit) {
    throw new Error('Historical tag changed during verification.');
  }
  return manifest;
}
export async function verifyPinnedRelease(
  client,
  pin,
  checkout,
  { rollbackOnly = false } = {},
) {
  const r = await client.get(`/releases/${pin.release_id}`);
  if (
    !(rollbackOnly ? stablePublication(r) : eligibleRelease(r)) ||
    r.id !== pin.release_id ||
    r.tag_name !== pin.tag ||
    remoteCommit(client, pin.tag) !== pin.commit
  )
    throw new Error('Published release withdrawn or identity changed.');
  if (
    git('-C', checkout, 'rev-parse', 'HEAD') !== pin.commit ||
    git('-C', checkout, 'status', '--porcelain')
  )
    throw new Error('Pinned source changed.');
  const m = JSON.parse(
    readFileSync(join(checkout, 'update/manifest.json'), 'utf8'),
  );
  if (
    m.template_version !== pin.manifest_version ||
    pin.manifest_version !== pin.tag.slice(1)
  )
    throw new Error('Pinned manifest identity changed.');
  return r;
}
