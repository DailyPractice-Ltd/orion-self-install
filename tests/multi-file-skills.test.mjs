/**
 * A skill is a folder, and the whole folder travels over the radio — text
 * files only. These tests pin the rules (what packs, what stays behind, what a
 * harness refuses to write) and then run the real radio.mjs for a send and a
 * receive against a bridge that answers from memory.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, symlinkSync,
  readdirSync, lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  skillPathProblem, skillBundleProblem, packSkillFolder,
  SKILL_FILES_MAX, SKILL_FILE_MAX,
} from '../status/shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const statusDir = join(here, '..', 'status');
const fs = { readdirSync, lstatSync, readFileSync };

// A rich skill: the entry file, a reference, a template, and two things that
// must never travel — a script and a hidden file.
function writeRichSkill(dir) {
  mkdirSync(join(dir, 'references'), { recursive: true });
  mkdirSync(join(dir, 'templates'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: meeting-confirmation\n---\n\nConfirm meetings the right way.\n');
  writeFileSync(join(dir, 'references', 'boundary.md'), '# Execution boundary\n');
  writeFileSync(join(dir, 'templates', 'confirm.json'), '{"subject":"Confirming {{date}}"}');
  writeFileSync(join(dir, 'check.mjs'), 'console.log("validator")');
  writeFileSync(join(dir, '.DS_Store'), 'junk');
}

test('skillPathProblem: text files inside the folder only', () => {
  assert.equal(skillPathProblem('SKILL.md'), null);
  assert.equal(skillPathProblem('references/boundary.md'), null);
  assert.equal(skillPathProblem('templates/confirm.json'), null);
  for (const bad of ['check.mjs', 'run.py', 'go.sh', 'a.png', '../x.md', '/etc/x.md', 'C:\\x.md', 'a/../b.md', '.hidden.md', 'a//b.md', '', 'noext']) {
    assert.ok(skillPathProblem(bad), `should refuse ${JSON.stringify(bad)}`);
  }
});

test('skillBundleProblem: caps, duplicates, and the entry file', () => {
  assert.equal(skillBundleProblem([{ path: 'SKILL.md', content: '# s' }]), null);
  assert.match(skillBundleProblem([{ path: 'references/x.md', content: 'x' }]), /no SKILL\.md/);
  assert.match(skillBundleProblem([{ path: 'SKILL.md', content: '#' }, { path: 'SKILL.md', content: '#' }]), /twice/);
  assert.match(skillBundleProblem([{ path: 'SKILL.md', content: '#' }, { path: 'a/B.md', content: '1' }, { path: 'a/b.md', content: '2' }]), /twice/, 'case-only duplicates collide on a Mac');
  assert.match(skillBundleProblem([{ path: 'SKILL.md', content: 'x'.repeat(SKILL_FILE_MAX + 1) }]), /over/);
  const tooMany = Array.from({ length: SKILL_FILES_MAX + 1 }, (_, i) => ({ path: `f${i}.md`, content: 'x' }));
  assert.match(skillBundleProblem(tooMany), /more than/);
  assert.match(skillBundleProblem([{ path: 'SKILL.md', content: '#' }, { path: 'check.mjs', content: 'x' }]), /not a text file/);
  assert.match(skillBundleProblem([{ path: 'SKILL.md', content: '#' }, { path: 'templates/t.json', content: 'a\0b' }]), /not text/, 'a NUL byte is not text');
  assert.ok(skillBundleProblem([]));
});

test('packSkillFolder: collects the text files, skips scripts, hidden files and symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-'));
  try {
    writeRichSkill(dir);
    symlinkSync('/etc/hosts', join(dir, 'hosts.md'));
    const { files, skipped } = packSkillFolder(dir, fs);
    assert.deepEqual(files.map((f) => f.path), ['SKILL.md', 'references/boundary.md', 'templates/confirm.json']);
    assert.ok(skipped.includes('check.mjs'));
    assert.ok(skipped.includes('.DS_Store'));
    assert.ok(skipped.includes('hosts.md'), 'a symlink is never followed');
    assert.equal(skillBundleProblem(files), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Run the real radio.mjs in a scratch harness with fetch answering from memory.
 * Returns what it printed, every bridge call, and the skill trees it left on
 * disk (captured before the scratch harness is removed).
 */
function runRadio(args, { reply, skill } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-radio-'));
  try {
    mkdirSync(join(dir, 'status'));
    for (const f of ['radio.mjs', 'shapes.mjs']) copyFileSync(join(statusDir, f), join(dir, 'status', f));
    writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
      template_version: '1.2.1',
      sharing: {
        status_signal_enabled: true,
        bridge_url: 'https://radio.test/api/bridge',
        harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
        install_token: 'orion_testtesttesttesttesttest',
      },
    }));
    if (skill) writeRichSkill(join(dir, '.claude', 'skills', skill));
    const log = join(dir, 'fetch.log');
    const mock = join(dir, 'fetch.mjs');
    writeFileSync(mock, `
      import { appendFileSync } from 'node:fs';
      const reply = ${JSON.stringify(reply ?? { status: 201, body: { contribution_id: 'c1', replay: false } })};
      globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url);
        appendFileSync(${JSON.stringify(log)}, JSON.stringify({
          method: init.method || 'GET', path: u.pathname, body: init.body ? JSON.parse(init.body) : null,
        }) + '\\n');
        if (u.pathname === '/api/bridge/assets') return new Response('{"asset_id":"a1","replay":false}', { status: 201, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
      };
    `);
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, join(dir, 'status', 'radio.mjs'), ...args], { encoding: 'utf8' });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const trees = {};
    const skillsRoot = join(dir, '.claude', 'skills');
    if (existsSync(skillsRoot)) {
      for (const slug of readdirSync(skillsRoot)) {
        const root = join(skillsRoot, slug);
        const files = {};
        const walk = (rel) => {
          for (const n of readdirSync(join(root, rel)).sort()) {
            const p = rel ? `${rel}/${n}` : n;
            if (lstatSync(join(root, p)).isDirectory()) walk(p);
            else files[p] = readFileSync(join(root, p), 'utf8');
          }
        };
        walk('');
        trees[slug] = files;
      }
    }
    return { code: r.status, out: r.stdout, err: r.stderr, calls, trees };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('contribute: preview lists the files and sends nothing', () => {
  const { code, out, err, calls } = runRadio(['contribute', '--slug', 'meeting-confirmation'], { skill: 'meeting-confirmation' });
  assert.equal(code, 0, err);
  assert.match(out, /3 files/);
  assert.match(out, /references\/boundary\.md/);
  assert.match(out, /templates\/confirm\.json/);
  assert.match(out, /Staying behind[\s\S]*check\.mjs/);
  assert.deepEqual(calls, [], 'nothing leaves before the yes');
});

test('contribute --yes: the whole folder goes, text only, SKILL.md mirrored in content', () => {
  const { code, out, err, calls } = runRadio(['contribute', '--slug', 'meeting-confirmation', '--yes'], { skill: 'meeting-confirmation' });
  assert.equal(code, 0, err);
  const post = calls.find((c) => c.method === 'POST' && c.path === '/api/bridge/contributions');
  assert.ok(post, 'the offer is posted');
  assert.deepEqual(post.body.files.map((f) => f.path), ['SKILL.md', 'references/boundary.md', 'templates/confirm.json']);
  assert.ok(!post.body.files.some((f) => f.path.endsWith('.mjs')), 'no script ever travels');
  assert.equal(post.body.content, post.body.files[0].content, 'content is the SKILL.md, for an older server');
  assert.equal(post.body.kind, 'skill');
  assert.match(out, /Offered "meeting-confirmation"[^\n]*3 files/);
});

const BUNDLE_REPLY = {
  status: 200,
  body: {
    slug: 'meeting-confirmation', kind: 'skill', name: 'Meeting Confirmation', one_liner: 'Confirm well.',
    family: null, tools_required: [], version: '1.0.0', content_path: null, content_sha: null,
    content: '# Meeting Confirmation\n',
    files: [
      { path: 'SKILL.md', content: '# Meeting Confirmation\n' },
      { path: 'references/boundary.md', content: '# Boundary\n' },
      { path: 'templates/confirm.json', content: '{}' },
    ],
  },
};

test('library --install: preview names every file and writes nothing', () => {
  const { code, out, err, trees, calls } = runRadio(['library', '--install', 'meeting-confirmation'], { reply: BUNDLE_REPLY });
  assert.equal(code, 0, err);
  assert.match(out, /as 3 files:/);
  assert.match(out, /references\/boundary\.md/);
  assert.equal(trees['meeting-confirmation'], undefined, 'nothing written before the yes');
  assert.ok(!calls.some((c) => c.path === '/api/bridge/assets'));
});

test('library --install --yes: the exact tree lands on disk and the shelf is told', () => {
  const { code, out, err, trees, calls } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply: BUNDLE_REPLY });
  assert.equal(code, 0, err);
  assert.match(out, /Written: 3 files to \.claude\/skills\/meeting-confirmation\//);
  assert.deepEqual(trees['meeting-confirmation'], {
    'SKILL.md': '# Meeting Confirmation\n',
    'references/boundary.md': '# Boundary\n',
    'templates/confirm.json': '{}',
  });
  const shelf = calls.find((c) => c.path === '/api/bridge/assets');
  assert.ok(shelf, 'the shelf is told');
  assert.equal(shelf.body.slug, 'meeting-confirmation');
});

test('library --install: a skill folder that already exists is never touched', () => {
  const { code, out, err, trees, calls } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply: BUNDLE_REPLY, skill: 'meeting-confirmation' });
  assert.equal(code, 0, err);
  assert.match(out, /already have a skill/);
  // The pre-existing folder (with its own content) is intact, byte for byte.
  assert.match(trees['meeting-confirmation']['SKILL.md'], /Confirm meetings the right way/);
  assert.ok(!calls.some((c) => c.path === '/api/bridge/assets'), 'no shelf report on a refusal');
});

test('library --install: an old-shape reply (content only) still installs the single SKILL.md', () => {
  const legacy = { status: 200, body: { ...BUNDLE_REPLY.body, files: undefined } };
  const { code, out, err, trees } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply: legacy });
  assert.equal(code, 0, err);
  assert.match(out, /Written: 1 file to \.claude\/skills\/meeting-confirmation\//);
  assert.deepEqual(Object.keys(trees['meeting-confirmation']), ['SKILL.md']);
});

test('library --install: a bundle with an unsafe path is refused and nothing is written', () => {
  const evil = { status: 200, body: { ...BUNDLE_REPLY.body, files: [
    { path: 'SKILL.md', content: '# x' },
    { path: '../../.ssh/authorized_keys', content: 'ssh-rsa AAAA' },
  ] } };
  const { code, out, err, trees, calls } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply: evil });
  assert.equal(code, 0, err);
  assert.match(out, /will not write/);
  assert.equal(trees['meeting-confirmation'], undefined);
  assert.ok(!calls.some((c) => c.path === '/api/bridge/assets'));
});

test('library --install: a write that fails half-way leaves nothing behind', () => {
  // 'a.md' is written as a file, then 'a.md/b.md' needs 'a.md' to be a folder:
  // the second write fails, and the whole install must roll back.
  const clash = { status: 200, body: { ...BUNDLE_REPLY.body, files: [
    { path: 'SKILL.md', content: '# x' },
    { path: 'a.md', content: 'file' },
    { path: 'a.md/b.md', content: 'needs a folder' },
  ] } };
  const { code, out, err, trees, calls } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply: clash });
  assert.equal(code, 0, err);
  assert.match(out, /Could not write/);
  assert.doesNotMatch(out, /Written/);
  assert.equal(trees['meeting-confirmation'], undefined, 'no half folder left behind');
  assert.ok(!Object.keys(trees).some((k) => k.includes('installing')), 'no staging folder left behind');
  assert.ok(!calls.some((c) => c.path === '/api/bridge/assets'), 'the shelf is not told');
});

test('library --install: a bundle carrying a script is refused', () => {
  const scripted = { status: 200, body: { ...BUNDLE_REPLY.body, files: [
    { path: 'SKILL.md', content: '# x' },
    { path: 'check.mjs', content: 'process.exit()' },
  ] } };
  const { code, out, err, trees } = runRadio(['library', '--install', 'meeting-confirmation', '--yes'], { reply: scripted });
  assert.equal(code, 0, err);
  assert.match(out, /will not write/);
  assert.equal(trees['meeting-confirmation'], undefined);
});
