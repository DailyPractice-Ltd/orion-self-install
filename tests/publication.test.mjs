import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const publisher = resolve('.github/scripts/publish-release.mjs');
function fixture(t, version = '2.1.0') {
  const root = mkdtempSync(join(tmpdir(), 'orion-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init'); git('config', 'user.email', 'fixture@example.test'); git('config', 'user.name', 'Fixture');
  mkdirSync(join(root, 'update'));
  writeFileSync(join(root, 'update/manifest.json'), JSON.stringify({ template_version: version }));
  writeFileSync(join(root, 'CHANGELOG.md'), `## ${version} — today\n\nCandidate notes.\n`);
  mkdirSync(join(root, '.github/workflows'), {recursive:true});
  writeFileSync(join(root, '.github/workflows/test.yml'), readFileSync(resolve('.github/workflows/test.yml')));
  mkdirSync(join(root, 'tests/helpers'), {recursive:true});
  for(const path of ['tests/release-contract.test.mjs','tests/install.test.mjs','tests/deployed-journey.test.mjs','tests/update-cli.test.mjs','tests/update-from-053.test.mjs', 'tests/helpers/pristine.mjs']) writeFileSync(join(root,path), readFileSync(resolve(path)));
  git('add', '.'); git('commit', '-m', 'candidate');
  const sha = git('rev-parse', 'HEAD'); git('tag', `v${version}`);
  writeFileSync(join(root, 'CHANGELOG.md'), '## 9.0.0 — later\n\nWrong notes.\n');
  git('add', '.'); git('commit', '-m', 'main advances');
  return { root, git, sha, version };
}
function run(f, overrides = {}) {
  const data = { sha: f.sha, version: f.version, ...overrides };
  writeFileSync(join(f.root, 'github.mjs'), `const d=${JSON.stringify(data)};
  globalThis.fetch=async (url,options={})=>{
    const path=new URL(url).pathname;
    let status=200, body;
    if(path.endsWith('/immutable-releases')) body={enabled:!d.mutable};
    else if(path.includes('/git/ref/tags/')) body={object:{type:'commit',sha:d.remoteSha||d.sha}};
    else if(path.endsWith('/actions/workflows/test.yml/runs')) body={workflow_runs:[{id:5,head_sha:d.ciSha||d.sha,status:'completed',conclusion:d.failed?'failure':'success',event:'push'}]};
    else if(path.endsWith('/actions/runs/5/jobs')) body={total_count:6,jobs:['unit','scheduler'].flatMap(n=>['ubuntu-latest','macos-latest','windows-latest'].map(os=>({name:n+' ('+os+')',head_sha:d.sha,conclusion:d.missing?'skipped':'success'})))};
    else if(path.includes('/releases/tags/')) {status=d.existing?200:404;body={id:44};}
    else if(path.endsWith('/issues/comments/7')) body={user:{login:d.wrongAuthor?'someone':'henri'},body:JSON.stringify({tag:'v'+d.version,commit:d.sha,disposable_harness:true,local:true,result:'passed'})};
    else if(path.endsWith('/releases')&&options.method==='POST') {body={id:44,...JSON.parse(options.body)}; console.log(JSON.stringify({created:body}));}
    else throw new Error('Unexpected GitHub request '+path);
    return new Response(JSON.stringify(body),{status});
  };`);
  return spawnSync(process.execPath, ['--import', join(f.root, 'github.mjs'), publisher, '--tag', `v${f.version}`, '--commit', overrides.commit || f.sha, ...(overrides.trial ? ['--trial-comment', '7'] : [])], { cwd: f.root, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'fixture/orion', GH_TOKEN: 'fixture', HENRI_GITHUB_LOGIN: 'henri' } });
}
test('maintainer publishes the verified candidate even after main advances', t => {
  const r = run(fixture(t));
  assert.equal(r.status, 0, r.stderr);
  const created = JSON.parse(r.stdout.trim().split('\n')[0]).created;
  assert.equal(created.body, 'Candidate notes.');
  assert.equal(created.tag_name, 'v2.1.0');
  assert.equal(created.draft, false);
  assert.equal(created.prerelease, false);
});

test('major candidate requires Henri recorded local disposable-harness trial', t => {
  const f = fixture(t, '3.0.0');
  assert.match(run(f).stderr, /trial/i);
  assert.match(run(f, { trial: true, wrongAuthor: true }).stderr, /Henri/i);
  const accepted = run(f, { trial: true });
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('publication refuses mutable releases and a remotely moved tag', t => {
  const f = fixture(t);
  assert.match(run(f, { mutable: true }).stderr, /immutable/i);
  assert.match(run(f, { remoteSha: 'f'.repeat(40) }).stderr, /remote tag/i);
});

test('green CI with a weakened candidate workflow cannot publish', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.github/workflows/test.yml'), 'name: Test\njobs: {}\n');
  f.git('add', '.github'); f.git('commit', '-m', 'weaken checks');
  f.sha = f.git('rev-parse', 'HEAD'); f.git('tag', '-f', 'v2.1.0');
  writeFileSync(join(f.root, 'CHANGELOG.md'), '## 2.1.0 — today\n\nCandidate notes.\n');
  f.git('add', 'CHANGELOG.md'); f.git('commit', '-m', 'restore notes');
  f.sha = f.git('rev-parse', 'HEAD'); f.git('tag', '-f', 'v2.1.0');
  assert.match(run(f).stderr, /workflow/i);
});

test('rejected candidates do not create or replace a publication', t => {
  const f = fixture(t);
  for (const [override, message] of [
    [{ciSha:'f'.repeat(40)}, /exact candidate/],
    [{failed:true}, /exact candidate/],
    [{missing:true}, /CI job/],
    [{existing:true}, /already exists/],
    [{commit:'abc123'}, /full 40/],
    [{commit:'f'.repeat(40)}, /Tag does not resolve/],
  ]) {
    const r = run(f, override);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, message);
    assert.doesNotMatch(r.stdout, /created/);
  }
});

test('migration declarations on a minor candidate require an exact trial', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'update/manifest.json'), JSON.stringify({template_version:'2.1.0',release_contract:{paths:[{steps:[{script:'update/migrate.mjs'}]}]}}));
  writeFileSync(join(f.root, 'CHANGELOG.md'), '## 2.1.0 — today\n\nMigration.\n');
  f.git('add','.'); f.git('commit','-m','migration'); f.sha=f.git('rev-parse','HEAD'); f.git('tag','-f','v2.1.0');
  const r = run(f);
  assert.notEqual(r.status, 0); assert.match(r.stderr,/trial/); assert.doesNotMatch(r.stdout,/created/);
  assert.equal(run(f,{trial:true}).status,0);
});

test('candidate manifest and changelog must agree with its tag', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'update/manifest.json'), JSON.stringify({template_version:'2.2.0'}));
  f.git('add','.'); f.git('commit','-m','wrong version'); f.sha=f.git('rev-parse','HEAD'); f.git('tag','-f','v2.1.0');
  assert.match(run(f).stderr,/Manifest version/);
  writeFileSync(join(f.root, 'update/manifest.json'), JSON.stringify({template_version:'2.1.0'}));
  f.git('add','.'); f.git('commit','-m','missing section'); f.sha=f.git('rev-parse','HEAD'); f.git('tag','-f','v2.1.0');
  assert.match(run(f).stderr,/changelog section/);
});
