/**
 * "Update my harness" from a 0.5.3 install, run for real.
 *
 * Three clients are on 0.5.3, a version with no update layer at all: no
 * docs/updating.md, no update/manifest.json, no update-harness skill. The one
 * paste in docs/updating.md ("If your harness is older than 0.5.7") is the only
 * way they reach the present, and until this file existed that paste had never
 * been run against a real 0.5.3 tree.
 *
 *   node --test
 *
 * The source of the update here is THIS WORKING TREE, not GitHub. That keeps the
 * test offline and fast, and it makes it the more useful check: it proves the
 * 0.5.3 path still works against what we are about to release, rather than
 * against what we released last time.
 *
 * What it guards, in order of how much it would hurt to get wrong:
 *   1. The client's own knowledge base is byte-identical afterwards. That is the
 *      promise the whole allowlist exists to keep.
 *   2. Every refresh-list file that existed is in the backup, so the undo works.
 *   3. The files 0.5.3 lacks are created, so the harness lands complete —
 *      including status/shapes.mjs, which the current radio.mjs imports and
 *      whose absence or staleness would be a hard crash.
 *   4. Every shipped .mjs still parses after the trip.
 *   5. The personalisation tripwire fires on a Daily Practice file the client
 *      hand-edited, instead of silently overwriting their words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync,
  existsSync, readdirSync, statSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

/** The tag every one of those three clients is sitting on. */
const BASELINE_TAG = 'v0.5.3';

const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
const REFRESH = manifest.refresh;
const REMOVE = manifest.remove || [];
const REMOVE_KEYS = manifest.remove_status_checklist_keys || [];
const TARGET_VERSION = manifest.template_version;

function haveBaselineTag() {
  const r = spawnSync('git', ['rev-parse', '--verify', `${BASELINE_TAG}^{tag}`], { cwd: repo });
  return r.status === 0;
}

/** A 0.5.3 tree, plus the things a real client has that the tag does not. */
function makeClient({ handEditedFile = null, businessName = 'Niven Consulting' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-053-'));
  const tar = execFileSync('git', ['archive', BASELINE_TAG], { cwd: repo, maxBuffer: 1 << 28 });
  const tarPath = join(dir, 'baseline.tar');
  writeFileSync(tarPath, tar);
  execFileSync('tar', ['-xf', tarPath, '-C', dir]);
  rmSync(tarPath);

  // The tag ships a template; an installed harness has the real file.
  const status = JSON.parse(readFileSync(join(dir, 'status/status.schema-template.json'), 'utf8'));
  status.template_version = '0.5.3';
  status.business_name = businessName;
  writeFileSync(join(dir, 'status/status.json'), JSON.stringify(status, null, 2));

  // Their own words, in a file the allowlist must never touch.
  mkdirSync(join(dir, 'agent/knowledge-base'), { recursive: true });
  writeFileSync(
    join(dir, 'agent/knowledge-base/01-business-context.md'),
    `# Business context\n\n${businessName} sells into mid-market logistics.\n`,
  );

  // Optionally: they hand-edited one of OUR files. Step 4 must notice.
  if (handEditedFile) {
    const p = join(dir, handEditedFile);
    writeFileSync(p, `${readFileSync(p, 'utf8')}\n\n## Our notes\n${businessName} opens with logistics.\n`);
  }
  return dir;
}

const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function fingerprintKnowledgeBase(dir) {
  const kb = join(dir, 'agent/knowledge-base');
  if (!existsSync(kb)) return {};
  return Object.fromEntries(
    readdirSync(kb).filter((f) => /^0.*\.md$/.test(f)).sort()
      .map((f) => [f, digest(join(kb, f))]),
  );
}

/**
 * Steps 3 and 4 of docs/updating.md: back up, then refresh the allowlist only,
 * every file from one source. Returns what a truthful step 8 would report.
 */
function runUpdate(dir, { honourTripwire = true } = {}) {
  const localVersion = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8')).template_version;
  const businessName = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8')).business_name;

  const backupDir = join(dir, '.update-backup', `${localVersion}-fixture`);
  const backedUp = [];
  const created = [];
  const refreshed = [];
  const tripped = [];

  for (const rel of REFRESH) {
    const dest = join(dir, rel);
    const src = join(repo, rel);
    if (!existsSync(src)) continue; // manifest names nothing that is not in the tree
    const existed = existsSync(dest);

    if (existed) {
      const bk = join(backupDir, rel);
      mkdirSync(dirname(bk), { recursive: true });
      copyFileSync(dest, bk);
      backedUp.push(rel);

      // The personalisation tripwire: their name inside one of our files means
      // a human hand-edited it. Stop for that file; never overwrite it quietly.
      if (honourTripwire && readFileSync(dest, 'utf8').includes(businessName)) {
        tripped.push(rel);
        continue;
      }
    }

    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    (existed ? refreshed : created).push(rel);
  }

  // Step 4b: prune, remove-list only — backup first (step 3), then delete.
  const removed = [];
  for (const rel of REMOVE) {
    const dest = join(dir, rel);
    if (!existsSync(dest)) continue;
    const bk = join(backupDir, rel);
    mkdirSync(dirname(bk), { recursive: true });
    copyFileSync(dest, bk);
    backedUp.push(rel);
    rmSync(dest);
    removed.push(rel);
  }

  const status = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8'));
  for (const key of REMOVE_KEYS) delete (status.checklist || {})[key];
  status.template_version = TARGET_VERSION;
  writeFileSync(join(dir, 'status/status.json'), JSON.stringify(status, null, 2));

  return { backupDir, backedUp, created, refreshed, tripped, removed, from: localVersion };
}

test('0.5.3 genuinely lacks the update layer — the paste is the only way through', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  for (const missing of ['docs/updating.md', 'update/manifest.json', '.claude/skills/update-harness/SKILL.md']) {
    assert.equal(existsSync(join(dir, missing)), false, `${missing} should be absent on 0.5.3`);
  }
});

test('the update leaves the client\'s knowledge base byte-identical', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  const before = fingerprintKnowledgeBase(dir);
  runUpdate(dir);
  assert.deepEqual(fingerprintKnowledgeBase(dir), before);
  // And their own fields survive the version bump.
  const status = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8'));
  assert.equal(status.business_name, 'Niven Consulting');
  assert.equal(status.template_version, TARGET_VERSION);
});

test('every refresh-list file that existed is in the backup, so restore can undo it', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  const { backupDir, backedUp, refreshed } = runUpdate(dir);
  assert.ok(backedUp.length > 0, 'nothing was backed up');
  for (const rel of refreshed) {
    assert.ok(existsSync(join(backupDir, rel)), `${rel} was replaced with no backup`);
  }
});

test('a 0.5.3 harness lands complete — including what the current radio imports', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  runUpdate(dir);
  // shapes.mjs is the one that would be a hard crash: radio.mjs imports it.
  for (const rel of ['status/radio.mjs', 'status/shapes.mjs', 'docs/updating.md', 'update/manifest.json']) {
    assert.ok(existsSync(join(dir, rel)), `${rel} missing after update`);
  }
  assert.equal(
    digest(join(dir, 'status/shapes.mjs')), digest(join(repo, 'status/shapes.mjs')),
    'shapes.mjs must match the radio.mjs shipped beside it',
  );
});

test('every shipped script still parses after the trip', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  runUpdate(dir);
  const scripts = REFRESH.filter((p) => p.endsWith('.mjs'));
  assert.ok(scripts.length > 0, 'the manifest ships no scripts?');
  for (const rel of scripts) {
    const r = spawnSync(process.execPath, ['--check', join(dir, rel)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `node --check failed for ${rel}: ${r.stderr}`);
  }
});

test('the prune retires the n8n lane: files gone, backed up, checklist keys dropped', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  // A 0.5.3 tree genuinely has the lane this release removes.
  assert.ok(existsSync(join(dir, 'n8n/README.md')), '0.5.3 baseline should ship n8n/');
  const before = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8'));
  assert.ok('n8n_wf01_imported' in before.checklist, 'baseline checklist should carry the key');

  const { backupDir, removed } = runUpdate(dir);

  assert.ok(REMOVE.length >= 3, 'this release names the three n8n files to remove');
  for (const rel of REMOVE) {
    assert.equal(existsSync(join(dir, rel)), false, `${rel} should be pruned`);
    assert.ok(existsSync(join(backupDir, rel)), `${rel} pruned without a backup`);
  }
  assert.deepEqual(removed.sort(), [...REMOVE].sort());

  const after = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8'));
  for (const key of REMOVE_KEYS) {
    assert.equal(key in after.checklist, false, `${key} should be dropped from checklist`);
  }
  // The keys the release did not name survive untouched.
  assert.ok('connector_crm_live' in after.checklist, 'unrelated checklist keys must survive');
});

test('the tripwire stops on a Daily Practice file the client hand-edited', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient({ handEditedFile: 'AGENTS.md' });
  const theirs = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  const { tripped } = runUpdate(dir);
  assert.ok(tripped.includes('AGENTS.md'), 'the hand-edited file was not flagged');
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), theirs, 'their words were overwritten');
});
