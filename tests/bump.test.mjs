import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { hasFullHistory } from './helpers/pristine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A candidate release: a full-history clone of HEAD (the pristine helper reads
 * git history), with this checkout's maintainer scripts laid over it so the
 * scripts under test are the ones in the working tree.
 */
function candidate(t) {
  const release = mkdtempSync(join(tmpdir(), 'orion-bump-'));
  t.after(() => rmSync(release, { recursive: true, force: true }));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  execFileSync('git', ['clone', '-q', '--no-checkout', repo, release], { stdio: 'ignore' });
  execFileSync('git', ['checkout', '-q', head], { cwd: release, stdio: 'ignore' });
  const overlay = [...readdirSync(join(repo, 'update')).filter(name => name.endsWith('.mjs')).map(name => `update/${name}`),
    'tests/helpers/pristine.mjs'];
  for (const path of overlay) copyFileSync(join(repo, path), join(release, path));
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

test('bump releases the Unreleased section at a new version the release contract accepts', { skip: !hasFullHistory() && 'needs full git history' }, (t) => {
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
  const stale = spawnSync(process.execPath, [join(release, 'tests/helpers/pristine.mjs')], { cwd: release, encoding: 'utf8' });
  assert.equal(stale.status, 0, `pristine fingerprints are fresh after the bump: ${stale.stdout}`);
});

test('bump refuses before writing anything', { skip: !hasFullHistory() && 'needs full git history' }, (t) => {
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
