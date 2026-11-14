#!/usr/bin/env node
// Maintainer boundary: operate on a nominated Git object, never the working tree.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = message => { throw new Error(message); };
try {
  const { values } = parseArgs({ options: { tag: { type: 'string' }, commit: { type: 'string' }, 'trial-comment': { type: 'string' } } });
  const { tag, commit } = values;
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '')) fail('A stable vX.Y.Z tag is required');
  if (!/^[a-f0-9]{40}$/.test(commit || '')) fail('Nominate a full 40-character commit');
  if (git('rev-parse', `refs/tags/${tag}^{commit}`) !== commit) fail('Tag does not resolve to nominated commit');
  const manifest = JSON.parse(git('show', `${commit}:update/manifest.json`));
  if (manifest.template_version !== tag.slice(1)) fail('Manifest version does not match tag');
  const changelog = git('show', `${commit}:CHANGELOG.md`);
  const section = changelog.split(/^## /m).slice(1).filter(s => s.split(/\s/)[0] === tag.slice(1));
  const notes = section.length === 1 ? section[0].slice(section[0].indexOf('\n') + 1).trim() : '';
  if (!notes) fail('Candidate must have exactly one nonempty matching changelog section');
  // The trusted publisher's CI definition must be the one that ran on the
  // candidate. Job names alone are insufficient proof of the required checks.
  const workflow = git('show', `${commit}:.github/workflows/test.yml`);
  if (workflow !== readFileSync(new URL('../workflows/test.yml', import.meta.url), 'utf8').trim()) fail('Candidate Test workflow differs from the approved publication workflow');
  for (const path of ['tests/release-contract.test.mjs', 'tests/install.test.mjs', 'tests/deployed-journey.test.mjs', 'tests/update-cli.test.mjs', 'tests/update-from-053.test.mjs', 'tests/helpers/pristine.mjs']) {
    if (!git('show', `${commit}:${path}`).trim()) fail(`Candidate lacks required check: ${path}`);
  }
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) fail('GITHUB_REPOSITORY is required');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) fail('GitHub token is required');
  async function api(path, { method = 'GET', body, absent = false } = {}) {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (absent && response.status === 404) return null;
    if (!response.ok) fail(`GitHub ${method} ${path} failed (${response.status})`);
    return response.json();
  }
  if (await api(`/releases/tags/${tag}`, { absent: true })) fail('Release already exists; publish a new version instead');
  const runs = await api(`/actions/workflows/test.yml/runs?head_sha=${commit}&per_page=100`);
  const run = runs.workflow_runs.find(r => r.head_sha === commit && r.status === 'completed' && r.conclusion === 'success' && ['push', 'workflow_dispatch'].includes(r.event));
  if (!run) fail('No successful Test workflow for exact candidate commit');
  const jobs = await api(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
  for (const kind of ['unit', 'scheduler']) for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    if (!jobs.jobs.some(j => j.name === `${kind} (${os})` && j.head_sha === commit && j.conclusion === 'success')) fail(`Missing successful exact-candidate CI job: ${kind} (${os})`);
  }
  // Migration declarations may be nested in compatibility paths; any script
  // declaration requires the trial, as does a script in a migrations directory.
  const hasScripts = value => value && typeof value === 'object' && Object.entries(value).some(([key, item]) => /^(script|scripts|migration_script|migration_scripts)$/.test(key) && Boolean(item) || hasScripts(item));
  const migrationFiles = git('ls-tree', '-r', '--name-only', commit).split('\n').some(path => /(^|\/)migrations?\/.*\.(mjs|js|cjs|sh|py)$/.test(path));
  if (/^v[1-9]\d*\.0\.0$/.test(tag) || hasScripts(manifest) || migrationFiles) {
    const commentId = values['trial-comment'];
    if (!/^\d+$/.test(commentId || '')) fail('Henri local trial comment is required');
    const comment = await api(`/issues/comments/${commentId}`);
    if (!process.env.HENRI_GITHUB_LOGIN || comment.user?.login !== process.env.HENRI_GITHUB_LOGIN) fail('Trial must be recorded by Henri');
    let trial;
    try { trial = JSON.parse(comment.body); } catch { fail('Trial comment must contain the documented JSON record'); }
    if (trial.tag !== tag || trial.commit !== commit || trial.disposable_harness !== true || trial.local !== true || trial.result !== 'passed') fail('Trial must record a passed local disposable deployed-harness trial for this exact candidate');
  }
  const immutable = await api('/immutable-releases', { absent: true });
  if (immutable?.enabled !== true) fail('Enable GitHub immutable releases before publication');
  let remote = (await api(`/git/ref/tags/${tag}`)).object;
  for (let depth = 0; remote.type === 'tag' && depth < 10; depth++) remote = (await api(`/git/tags/${remote.sha}`)).object;
  if (remote.type !== 'commit' || remote.sha !== commit) fail('The remote tag no longer identifies the candidate');
  const release = await api('/releases', { method: 'POST', body: { tag_name: tag, target_commitish: commit, name: `Orion self-install ${tag.slice(1)}`, body: notes, draft: false, prerelease: false, make_latest: 'false' } });
  console.log(JSON.stringify({ tag, commit, release_id: release.id, manifest_version: manifest.template_version }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
