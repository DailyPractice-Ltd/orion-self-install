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
 *   5. The update never stops to ask: the request is the consent (1.1.1, after
 *      a live update sat waiting on exactly that question and never landed).
 *   6. A Daily Practice file the client has changed is KEPT, byte for byte, and
 *      named in the report (1.1.2). The install writes the agent's identity into
 *      agent/agent-definition.md, so "replace it like any other" would have sent
 *      every real harness's identity to the backup. The radio's own scripts are
 *      the one exception: they are replaced as a set.
 *   7. "Changed" is decided against update/pristine.json, the fingerprint of every
 *      copy of every file we have shipped (1.1.4), not against the copy at the
 *      client's version tag: 0.6.0 to 0.6.6 were never tagged, and a CRLF checkout
 *      of our own file must still read as ours.
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
import { computePristine, fingerprint, hasFullHistory, serialise, PRISTINE_PATH } from './helpers/pristine.mjs';

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

/**
 * The last commit on which the template called itself 0.6.6: the parent of the
 * commit that bumped it to 0.7.0. 0.6.0 to 0.6.6 were never tagged, and a real
 * client is on 0.6.6.
 */
const UNTAGGED_066 = 'c5470c0c3f5273d52ca345b4474c3741cb82c669^';

function haveRef(ref) {
  return spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: repo }).status === 0;
}

/** A released tree, plus the things a real client has that the release does not. */
function makeClient({ handEditedFile = null, businessName = 'Niven Consulting', ref = BASELINE_TAG, version = '0.5.3' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-053-'));
  const tar = execFileSync('git', ['archive', ref], { cwd: repo, maxBuffer: 1 << 28 });
  const tarPath = join(dir, 'baseline.tar');
  writeFileSync(tarPath, tar);
  execFileSync('tar', ['-xf', tarPath, '-C', dir]);
  rmSync(tarPath);

  // The tag ships a template; an installed harness has the real file.
  const status = JSON.parse(readFileSync(join(dir, 'status/status.schema-template.json'), 'utf8'));
  status.template_version = version;
  status.business_name = businessName;
  writeFileSync(join(dir, 'status/status.json'), JSON.stringify(status, null, 2));

  // Their own words, in a file the allowlist must never touch.
  mkdirSync(join(dir, 'agent/knowledge-base'), { recursive: true });
  writeFileSync(
    join(dir, 'agent/knowledge-base/01-business-context.md'),
    `# Business context\n\n${businessName} sells into mid-market logistics.\n`,
  );

  // Optionally: they changed one of OUR files. Step 4 keeps it as it is (the
  // radio's scripts excepted); step 8 names it.
  if (handEditedFile) {
    const p = join(dir, handEditedFile);
    writeFileSync(p, `${readFileSync(p, 'utf8')}\n\n## Our notes\n${businessName} opens with logistics.\n`);
  }
  return dir;
}

const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Every copy of every file we have shipped: what docs/updating.md step 4 checks against. */
const PRISTINE = JSON.parse(readFileSync(join(repo, PRISTINE_PATH), 'utf8')).files;
const isOurs = (rel, buf) => (PRISTINE[rel] || []).includes(fingerprint(buf));

/**
 * Always replaced, changed or not: the radio's scripts run as a set, and the
 * shipped-copies list is pure data that cannot hold its own fingerprint.
 */
const isRadioScript = (rel) => /^status\/[^/]+\.mjs$/.test(rel) || rel === PRISTINE_PATH;

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
function runUpdate(dir) {
  const localVersion = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8')).template_version;
  const businessName = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8')).business_name;

  const backupDir = join(dir, '.update-backup', `${localVersion}-fixture`);
  const backedUp = [];
  const created = [];
  const refreshed = [];
  const kept = [];       // changed by the client: left exactly as they are, named in step 8
  const localEdits = []; // replaced or removed although changed: named with the backup path

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

      // Step 4: a fingerprint on the shipped list means they never touched it.
      // Anything else is theirs now.
      const changed = !isOurs(rel, readFileSync(dest));
      if (changed && !isRadioScript(rel)) {
        kept.push(rel);
        continue;
      }
      if (changed && rel !== PRISTINE_PATH) localEdits.push(rel);
    }

    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    (existed ? refreshed : created).push(rel);
  }

  // Step 3 also holds one copy of status.json, so 4b's key deletions have an undo.
  mkdirSync(join(backupDir, 'status'), { recursive: true });
  copyFileSync(join(dir, 'status/status.json'), join(backupDir, 'status/status.json'));

  // Step 4b: prune, remove-list only — backup first, then delete without asking,
  // then clear any directory the prune emptied.
  const removed = [];
  for (const rel of REMOVE) {
    const dest = join(dir, rel);
    if (!existsSync(dest)) continue;
    const bk = join(backupDir, rel);
    mkdirSync(dirname(bk), { recursive: true });
    copyFileSync(dest, bk);
    backedUp.push(rel);
    if (readFileSync(dest, 'utf8').includes(businessName)) localEdits.push(rel);
    rmSync(dest);
    removed.push(rel);
    const parent = dirname(dest);
    if (existsSync(parent) && readdirSync(parent).length === 0) rmSync(parent, { recursive: true });
  }

  const status = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8'));
  for (const key of REMOVE_KEYS) delete (status.checklist || {})[key];
  status.template_version = TARGET_VERSION;
  writeFileSync(join(dir, 'status/status.json'), JSON.stringify(status, null, 2));

  return { backupDir, backedUp, created, refreshed, kept, localEdits, removed, from: localVersion };
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
  assert.equal(existsSync(join(dir, 'n8n')), false, 'the emptied n8n/ directory should be gone too');
  assert.ok(existsSync(join(backupDir, 'status/status.json')), 'status.json must be in the backup — the key deletions need an undo');

  const after = JSON.parse(readFileSync(join(dir, 'status/status.json'), 'utf8'));
  for (const key of REMOVE_KEYS) {
    assert.equal(key in after.checklist, false, `${key} should be dropped from checklist`);
  }
  // The keys the release did not name survive untouched.
  assert.ok('connector_crm_live' in after.checklist, 'unrelated checklist keys must survive');
});

test('a personalised remove-list file is still pruned — backed up, named in the report, never asked about', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  // The real 0.5.x cohort: the old install prompt had clients fill their business
  // name into the workflow JSONs, so EVERY one of their updates hits this branch.
  // Under the old rule that meant every one of their updates stopped on a question.
  const dir = makeClient({ handEditedFile: 'n8n/wf-01-prospect-research-outreach.json' });
  const theirs = readFileSync(join(dir, 'n8n/wf-01-prospect-research-outreach.json'), 'utf8');
  const { backupDir, localEdits, removed } = runUpdate(dir);

  assert.ok(localEdits.includes('n8n/wf-01-prospect-research-outreach.json'), 'the report must name the personalised file');
  assert.ok(removed.includes('n8n/wf-01-prospect-research-outreach.json'), 'a personalised remove-list file must still be pruned');
  assert.equal(existsSync(join(dir, 'n8n/wf-01-prospect-research-outreach.json')), false, 'the file should be gone');
  assert.equal(
    readFileSync(join(backupDir, 'n8n/wf-01-prospect-research-outreach.json'), 'utf8'), theirs,
    'the backup must hold their exact copy',
  );
  assert.equal(existsSync(join(dir, 'n8n')), false, 'the emptied directory should be gone too');
});

test('a Daily Practice file the client changed is kept byte for byte, and named — never replaced, never asked about', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient({ handEditedFile: 'AGENTS.md' });
  const theirs = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  const { backupDir, kept, refreshed } = runUpdate(dir);
  assert.ok(kept.includes('AGENTS.md'), 'the report must name the kept file');
  assert.ok(!refreshed.includes('AGENTS.md'), 'a changed file must not be replaced');
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), theirs, 'their file was altered');
  assert.equal(readFileSync(join(backupDir, 'AGENTS.md'), 'utf8'), theirs, 'the backup must hold their exact copy too');
  // Everything they did not touch still lands.
  assert.ok(refreshed.length > 0, 'untouched files must still be refreshed');
  assert.equal(digest(join(dir, 'CLAUDE.md')), digest(join(repo, 'CLAUDE.md')), 'an untouched file should be the new template copy');
});

test('the identity the install wrote into agent/agent-definition.md survives an update', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  // Every real harness is in this state: setting up the agent fills this file in.
  const dir = makeClient({ handEditedFile: 'agent/agent-definition.md' });
  const theirs = readFileSync(join(dir, 'agent/agent-definition.md'), 'utf8');
  const { kept } = runUpdate(dir);
  assert.ok(kept.includes('agent/agent-definition.md'), 'the report must name it as kept');
  assert.equal(readFileSync(join(dir, 'agent/agent-definition.md'), 'utf8'), theirs, 'the agent\'s identity was overwritten');
});

test('a changed radio script is the one exception: replaced with the set, backed up, named', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient({ handEditedFile: 'status/radio.mjs' });
  const theirs = readFileSync(join(dir, 'status/radio.mjs'), 'utf8');
  const { backupDir, kept, localEdits } = runUpdate(dir);
  assert.ok(!kept.includes('status/radio.mjs'), 'a radio script is never held back');
  assert.ok(localEdits.includes('status/radio.mjs'), 'the report must name the replaced script');
  assert.equal(digest(join(dir, 'status/radio.mjs')), digest(join(repo, 'status/radio.mjs')), 'the radio must match the release');
  assert.equal(readFileSync(join(backupDir, 'status/radio.mjs'), 'utf8'), theirs, 'the backup must hold their exact copy');
});

test('update/pristine.json is up to date with everything this release ships', (t) => {
  if (!hasFullHistory()) return t.skip('shallow clone: the shipped history is not here to check against');
  assert.equal(
    readFileSync(join(repo, PRISTINE_PATH), 'utf8'), serialise(computePristine()),
    'update/pristine.json is stale: run node tests/helpers/pristine.mjs --write as the last edit of the release',
  );
});

test('a harness on a version that was never tagged (0.6.6) is recognised file by file', (t) => {
  if (!haveRef(UNTAGGED_066)) return t.skip('0.6.6 commit not fetched');
  const dir = makeClient({ ref: UNTAGGED_066, version: '0.6.6', handEditedFile: 'agent/agent-definition.md' });
  const theirs = readFileSync(join(dir, 'agent/agent-definition.md'), 'utf8');
  const { kept, refreshed, created } = runUpdate(dir);
  // The one file they changed is kept; nothing else is mistaken for theirs.
  assert.deepEqual(kept, ['agent/agent-definition.md'], 'only the changed file may be kept');
  assert.equal(readFileSync(join(dir, 'agent/agent-definition.md'), 'utf8'), theirs);
  assert.ok(refreshed.length >= 40, `an untagged version must still refresh (got ${refreshed.length})`);
  assert.ok(created.length > 0, 'files new since 0.6.6 should be created');
  assert.equal(digest(join(dir, 'status/radio.mjs')), digest(join(repo, 'status/radio.mjs')));
});

test('our own files checked out with CRLF line endings still read as ours', (t) => {
  if (!haveBaselineTag()) return t.skip(`${BASELINE_TAG} not fetched`);
  const dir = makeClient();
  for (const rel of REFRESH) {
    const p = join(dir, rel);
    if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  const { kept, refreshed } = runUpdate(dir);
  assert.deepEqual(kept, [], 'a CRLF copy of our file must not be mistaken for the client\'s');
  assert.ok(refreshed.length > 0);
});

test('the manifest opens with the note that sends an older harness to the current procedure', () => {
  const keys = Object.keys(manifest);
  assert.equal(keys[0], '_read_first', 'the note must be the first thing an assistant reads in the manifest');
  for (const phrase of ['never stop to ask', 'never replace a file the client has changed', 'docs/updating.md', 'update/pristine.json']) {
    assert.ok(manifest._read_first.includes(phrase), `_read_first must mention "${phrase}"`);
  }
  assert.ok(REFRESH.includes(PRISTINE_PATH), 'update/pristine.json must itself be refreshed');
  // Every refresh path has an entry, and every shipped file's own fingerprint is on it.
  for (const rel of REFRESH) {
    if (rel === PRISTINE_PATH) {
      assert.equal(rel in PRISTINE, false, 'the list must not carry an entry for itself');
      continue;
    }
    assert.ok(Array.isArray(PRISTINE[rel]), `${rel} has no entry in update/pristine.json`);
    assert.ok(isOurs(rel, readFileSync(join(repo, rel))), `${rel} as shipped is not on its own list`);
  }
});

test('the procedure itself contains no stop-and-ask step', () => {
  const doc = readFileSync(join(repo, 'docs/updating.md'), 'utf8');
  for (const phrase of ['let them choose', 'tripwire', 'show the client the difference']) {
    assert.equal(doc.includes(phrase), false, `docs/updating.md still says "${phrase}"`);
  }
  assert.ok(doc.includes('The request is the consent'), 'docs/updating.md must state that the request is the consent');
  assert.ok(doc.includes('A file the client has changed is kept'), 'docs/updating.md must state that a changed file is kept');
  assert.ok(doc.includes('update/pristine.json'), 'docs/updating.md must name the shipped-copies list');
  assert.equal(doc.includes('replace it\n  like any other'), false, 'docs/updating.md must not tell the installer to replace a changed file');
  const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('The request is the consent'), 'AGENTS.md must carry the same rule');
});
