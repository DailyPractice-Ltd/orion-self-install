#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WITHDRAWAL_MARKER } from '../../update/published-release.mjs';

const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const shaPattern = /^[a-f0-9]{40}$/;

async function withdraw() {
  const { values } = parseArgs({
    options: { tag: { type: 'string' }, commit: { type: 'string' }, 'release-id': { type: 'string' } },
  });
  const { tag, commit, 'release-id': id } = values;
  if (!tagPattern.test(tag || '')) throw new Error('A stable vX.Y.Z release tag is required.');
  if (!shaPattern.test(commit || '')) throw new Error('Nominate the full 40-character released commit.');
  const releaseId = Number(id);
  if (!/^[1-9]\d*$/.test(id || '') || !Number.isSafeInteger(releaseId)) {
    throw new Error('Nominate the GitHub Release ID.');
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY is required.');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub token is required.');

  async function api(path, body) {
    const method = body ? 'PATCH' : 'GET';
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (${response.status}).`);
    return response.json();
  }

  async function tagStillIdentifiesCommit() {
    const ref = await api(`/git/ref/tags/${tag}`);
    if (ref.ref !== `refs/tags/${tag}`) return false;
    let object = ref.object;
    const seen = new Set();
    while (object?.type === 'tag' && shaPattern.test(object.sha) &&
      !seen.has(object.sha) && seen.size < 16) {
      seen.add(object.sha);
      object = (await api(`/git/tags/${object.sha}`)).object;
    }
    return object?.type === 'commit' && object.sha === commit;
  }

  const samePublication = (release) => release?.id === releaseId && release.tag_name === tag &&
    release.draft === false && release.prerelease === false && Boolean(release.published_at);
  const release = await api(`/releases/tags/${tag}`);
  if (!samePublication(release)) throw new Error('Release does not match the nominated stable publication.');
  if (!(await tagStillIdentifiesCommit())) throw new Error('Remote tag does not match the nominated commit.');

  const original = release.body ?? '';
  if (typeof original !== 'string') throw new Error('Invalid published release notes.');
  const body = original.includes(WITHDRAWAL_MARKER)
    ? original
    : `${WITHDRAWAL_MARKER}\n\n**Withdrawn. Do not install this release.**\n\n${original}`;
  const path = `/releases/${releaseId}`;
  if (body !== original) await api(path, { body });

  const stored = await api(path);
  if (!samePublication(stored) || stored.body !== body || !(await tagStillIdentifiesCommit())) {
    throw new Error('Withdrawal verification failed. Inspect the published GitHub Release.');
  }

  console.log(JSON.stringify({ tag, commit, release_id: releaseId, withdrawn: true }));
}

try {
  await withdraw();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
