import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A candidate release with no git history at all: this checkout's tracked files,
 * as they are in the working tree. Nothing the bump or the release contract
 * checks may depend on what history is reachable.
 */
function candidate(t) {
  const release = mkdtempSync(join(tmpdir(), 'orion-bump-'));
  t.after(() => rmSync(release, { recursive: true, force: true }));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0')
    .filter(path => path && !path.split('/').includes('specs') && existsSync(join(repo, path)));
  for (const path of tracked) {
    mkdirSync(dirname(join(release, path)), { recursive: true });
    copyFileSync(join(repo, path), join(release, path));
  }
  return release;
}

const changelog = (release, text) => writeFileSync(join(release, 'CHANGELOG.md'), `# Changelog\n\n${text}`);
const bump = (release, ...args) => spawnSync(process.execPath, [join(release, 'update/bump.mjs'), ...args], { encoding: 'utf8' });
const contract = (release, ...args) => spawnSync(process.execPath, [join(release, 'update/release-contract.mjs'), ...args], { encoding: 'utf8' });
const templateVersion = (release) => JSON.parse(readFileSync(join(release, 'update/manifest.json'), 'utf8')).template_version;

/** Every file in the candidate outside .git, by path. */
function snapshot(release) {
  return Object.fromEntries(readdirSync(release, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(release, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter(path => !path.startsWith('.git/'))
    .sort()
    .map(path => [path, readFileSync(join(release, path)).toString('base64')]));
}

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

/** The next patch release after the candidate's template_version. */
function nextPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

test('bump releases the Unreleased section at a new version the release contract accepts', (t) => {
  const release = candidate(t);
  const current = templateVersion(release);
  const next = nextPatch(current);
  changelog(release, `## Unreleased — tidy the release\n\n- a note\n\n## ${current} — 2026-11-12\n\n- older\n`);

  const run = bump(release, next);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /tag v\d+\.\d+\.\d+/);

  for (const tool of ['codex', 'claude-code']) {
    const check = contract(release, '--tool', tool, '--version', next);
    assert.equal(check.status, 0, check.stderr);
  }
  const headings = readFileSync(join(release, 'CHANGELOG.md'), 'utf8').split('\n').filter(line => line.startsWith('## '));
  assert.deepEqual(headings, [`## ${next} — ${today()} — tidy the release`, `## ${current} — 2026-11-12`]);
});

test('bump refuses before writing anything', (t) => {
  const release = candidate(t);
  const current = templateVersion(release);
  const next = nextPatch(current);
  const released = `## ${current} — 2026-11-12\n\n- older\n`;
  const cases = [
    { why: 'no version', args: [], changes: `## Unreleased — a\n\n${released}`, says: /X\.Y\.Z/ },
    { why: 'bad format', args: ['2.1'], changes: `## Unreleased — a\n\n${released}`, says: /"2\.1" is not an X\.Y\.Z version/ },
    { why: 'prefixed', args: [`v${next}`], changes: `## Unreleased — a\n\n${released}`, says: /not an X\.Y\.Z version/ },
    { why: 'same version', args: [current], changes: `## Unreleased — a\n\n${released}`, says: new RegExp(`not greater than the current template_version ${current.replaceAll('.', '\\.')}`) },
    { why: 'older version', args: ['1.99.99'], changes: `## Unreleased — a\n\n${released}`, says: /not greater/ },
    { why: 'no Unreleased section', args: [next], changes: released, says: /must open with a "## Unreleased — <title>" section/ },
    { why: 'Unreleased not first', args: [next], changes: `## 9.9.9 — x\n\n## Unreleased — a\n\n${released}`, says: /must open with a "## Unreleased — <title>" section/ },
    { why: 'Unreleased without a title', args: [next], changes: `## Unreleased\n\n${released}`, says: /must open with a "## Unreleased — <title>" section/ },
    { why: 'two Unreleased sections', args: [next], changes: `## Unreleased — a\n\n## Unreleased — b\n\n${released}`, says: /2 "## Unreleased" sections\. Merge them into one/ },
  ];
  for (const { why, args, changes, says } of cases) {
    changelog(release, changes);
    const before = snapshot(release);
    const run = bump(release, ...args);
    assert.notEqual(run.status, 0, `${why}: should refuse`);
    assert.match(run.stderr, says, why);
    assert.match(run.stderr, /nothing was changed/i, why);
    assert.deepEqual(snapshot(release), before, `${why}: every file byte-identical`);
  }
});

test('bump puts every file back when a late step fails', { skip: process.getuid?.() === 0 && 'root ignores read-only files' }, (t) => {
  const release = candidate(t);
  const current = templateVersion(release);
  changelog(release, `## Unreleased — a\n\n- a note\n\n## ${current} — 2026-11-12\n\n- older\n`);
  // The last write, the Claude Code plugin manifest, fails after the others landed.
  const last = join(release, 'plugins/orion/.claude-plugin/plugin.json');
  chmodSync(last, 0o444);
  t.after(() => { try { chmodSync(last, 0o644); } catch {} });
  const before = snapshot(release);
  const run = bump(release, nextPatch(current));
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /plugin\.json/);
  assert.match(run.stderr, /nothing was changed/i);
  assert.deepEqual(snapshot(release), before, 'every file byte-identical');
});
