import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = new URL('../update/apply.mjs', import.meta.url).pathname;
const put = (root, path, body) => { mkdirSync(dirname(join(root,path)), {recursive:true}); writeFileSync(join(root,path),body); };
const get = (root, path) => readFileSync(join(root,path),'utf8');
const git = (cwd,...args) => execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const run = (...args) => spawnSync(process.execPath,[script,...args],{encoding:'utf8'});

test('pinned selected update preserves collisions and restores additions and retirements', t => {
  const base=mkdtempSync(join(tmpdir(),'orion-update-cli-')); t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'), client=join(base,'client'); mkdirSync(source); mkdirSync(client);
  const manifest={template_version:'2.0.0', deployment:{tools:['claude-code','codex'],common_sources:['AGENTS.md','status/a.mjs','status/b.mjs','update/manifest.json','update/pristine.json'],entries:[{source:'skills/foo/SKILL.md',destinations:{'claude-code':'.claude/skills/foo/SKILL.md',codex:'.agents/skills/foo/SKILL.md'},ownership:'release',fingerprint_key:'skills/foo/SKILL.md'},{source:'agents/README.md',destinations:{'claude-code':'.claude/agents/README.md',codex:'agents/README.md'},ownership:'client-template',fingerprint_key:'agents/README.md'}],retired:[{source:'skills/old/SKILL.md',destinations:{'claude-code':'.claude/skills/old/SKILL.md',codex:'.agents/skills/old/SKILL.md'},fingerprint_key:'skills/old/SKILL.md'}]}};
  put(source,'AGENTS.md','new instructions\n'); put(source,'status/a.mjs','console.log("new a")\n'); put(source,'status/b.mjs','console.log("new b")\n'); put(source,'skills/foo/SKILL.md','new skill\n'); put(source,'agents/README.md','roster template\n'); put(source,'update/manifest.json',JSON.stringify(manifest));
  const hash=s=>requireHash(s); const pristine={files:{'AGENTS.md':[hash('old instructions\n')],'status/a.mjs':[hash('old a\n')],'status/b.mjs':[hash('old b\n')],'skills/foo/SKILL.md':[hash('old skill\n')],'skills/old/SKILL.md':[hash('old retired\n')]}};
  put(source,'update/pristine.json',JSON.stringify(pristine));
  git(source,'init','-q'); git(source,'add','.'); git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release'); const commit=git(source,'rev-parse','HEAD'); put(source,'AGENTS.md','uncommitted instructions\n');
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',selected_tool:'codex',notes:'before'}));
  put(client,'AGENTS.md','old instructions\n'); put(client,'status/a.mjs','client edited script\n'); put(client,'status/b.mjs','old b\n'); put(client,'.agents/skills/foo/SKILL.md','client edit\n'); put(client,'.agents/skills/old/SKILL.md','old retired\n'); put(client,'agents/README.md','personalized roster\n'); put(client,'.claude/skills/foo/SKILL.md','other tool content\n');
  const updated=run('update','--root',client,'--release-repo',source,'--commit',commit); assert.equal(updated.status,0,updated.stderr); const report=JSON.parse(updated.stdout);
  assert.equal(get(client,'AGENTS.md'),'new instructions\n'); assert.equal(get(client,'status/a.mjs'),'console.log("new a")\n'); assert.equal(get(client,'status/b.mjs'),'console.log("new b")\n'); assert.equal(get(client,'.agents/skills/foo/SKILL.md'),'client edit\n'); assert.equal(get(client,'agents/README.md'),'personalized roster\n'); assert.equal(get(client,'.claude/skills/foo/SKILL.md'),'other tool content\n'); assert.equal(existsSync(join(client,'.agents/skills/old/SKILL.md')),false); assert.ok(report.kept.includes('.agents/skills/foo/SKILL.md')); assert.ok(report.replaced_edited_scripts.includes('status/a.mjs')); assert.ok(report.collisions.includes('agents/README.md'));
  const restored=run('restore','--root',client,'--backup',report.backup); assert.equal(restored.status,0,restored.stderr); assert.equal(get(client,'AGENTS.md'),'old instructions\n'); assert.equal(get(client,'status/a.mjs'),'client edited script\n'); assert.equal(get(client,'.agents/skills/old/SKILL.md'),'old retired\n'); assert.equal(existsSync(join(client,'update/manifest.json')),false); assert.equal(get(client,'.agents/skills/foo/SKILL.md'),'client edit\n'); assert.equal(JSON.parse(get(client,'status/status.json')).template_version,'1.0.0');
});
function requireHash(s) { return createHash('sha256').update(s).digest('hex'); }

test('Codex update preserves legacy team job sheets in place',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-update-team-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'),client=join(base,'client');mkdirSync(source);mkdirSync(client);
  const manifest={template_version:'2.0.0',deployment:{tools:['claude-code','codex'],common_sources:[],entries:[]}};
  put(source,'agents/README.md','release roster\n');put(source,'update/manifest.json',JSON.stringify(manifest));put(source,'update/pristine.json',JSON.stringify({files:{}}));
  git(source,'init','-q');git(source,'add','.');git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release');
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',selected_tool:'codex'}));
  put(client,'team/README.md','client roster\n');put(client,'team/writer.md','client job\n');
  const updated=run('update','--root',client,'--release-repo',source,'--commit',git(source,'rev-parse','HEAD'));assert.equal(updated.status,0,updated.stderr);
  const report=JSON.parse(updated.stdout);
  assert.equal(get(client,'team/README.md'),'client roster\n');
  assert.equal(get(client,'team/writer.md'),'client job\n');
  assert.equal(existsSync(join(client,'agents')),false);
  const restored=run('restore','--root',client,'--backup',report.backup);assert.equal(restored.status,0,restored.stderr);
  assert.equal(existsSync(join(client,'agents/README.md')),false);assert.equal(existsSync(join(client,'agents/writer.md')),false);
  assert.equal(get(client,'team/writer.md'),'client job\n');
});

test('failed update rolls back writes from the predeclared transaction',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-update-failure-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'),client=join(base,'client');mkdirSync(source);mkdirSync(client);
  const manifest={template_version:'2.0.0',deployment:{tools:['claude-code','codex'],common_sources:['AGENTS.md','README.md'],entries:[]}};
  put(source,'AGENTS.md','new agents\n');put(source,'README.md','new readme\n');put(source,'update/manifest.json',JSON.stringify(manifest));
  put(source,'update/pristine.json',JSON.stringify({files:{'AGENTS.md':[requireHash('old agents\n')],'README.md':[requireHash('old readme\n')]}}));
  git(source,'init','-q');git(source,'add','.');git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release');
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',selected_tool:'codex'}));
  put(client,'AGENTS.md','old agents\n');put(client,'README.md','old readme\n');
  const result=spawnSync(process.execPath,[script,'update','--root',client,'--release-repo',source,'--commit',git(source,'rev-parse','HEAD')],{encoding:'utf8',env:{...process.env,ORION_UPDATE_FAIL_AFTER:'1'}});
  assert.equal(result.status,2);assert.match(result.stderr,/Injected update interruption/);
  assert.equal(get(client,'AGENTS.md'),'old agents\n');assert.equal(get(client,'README.md'),'old readme\n');
  assert.equal(JSON.parse(get(client,'status/status.json')).template_version,'1.0.0');
  const recovery=run('recover','--root',client);assert.equal(recovery.status,0,recovery.stderr);
});

test('prompt stages local merges without writes, applies with radio off and restores', t => {
  const root = mkdtempSync(join(tmpdir(), 'orion-staged-update-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const client = join(root, 'client');
  const stage = join(root, 'stage');
  const skill = '.agents/skills/example/SKILL.md';
  const prior = 'first\n\nsecond\n\nthird\n';
  const local = prior.replace('first', 'client edit');
  const incoming = prior.replace('third', 'release edit');
  const merged = local.replace('third', 'release edit');
  const editedStatus = { template_version: '2.0.0', selected_tool: 'codex', sharing: { status_signal_enabled: false } };
  const manifest = {
    template_version: '2.1.0',
    deployment: {
      tools: ['codex', 'claude-code'],
      common_sources: ['status/example.mjs'],
      entries: [{
        source: 'skills/example/SKILL.md',
        destinations: { codex: skill, 'claude-code': '.claude/skills/example/SKILL.md' },
        ownership: 'release',
        fingerprint_key: 'skills/example/SKILL.md',
      }],
    },
  };
  put(source, 'update/manifest.json', JSON.stringify(manifest));
  put(source, 'update/pristine.json', JSON.stringify({ files: { 'skills/example/SKILL.md': [requireHash(prior)] } }));
  put(source, 'skills/example/SKILL.md', incoming);
  put(source, 'status/example.mjs', 'export const latest = true;\n');
  git(source, 'init', '-q');
  git(source, 'add', '.');
  git(source, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'release');
  const commit = git(source, 'rev-parse', 'HEAD');
  put(client, 'status/status.json', JSON.stringify(editedStatus));
  put(client, skill, local);
  put(client, '.claude/skills/example/SKILL.md', 'other tool\n');

  const args = ['--root', client, '--release-repo', source, '--commit', commit];
  const inspect = run('inspect', ...args);
  assert.equal(inspect.status, 0, inspect.stderr);
  const inventory = JSON.parse(inspect.stdout);
  assert.equal(inventory.files.find(({ path }) => path === skill).action, 'merge');
  assert.equal(get(client, skill), local);
  assert.equal(existsSync(join(client, '.update-backup')), false);

  const plan = {
    commit,
    status_hash: inventory.status_hash,
    files: inventory.files.map(({ path, before }) => ({ path, before })),
  };
  put(stage, 'plan.json', JSON.stringify(plan));
  put(stage, 'local', local);
  put(stage, 'prior', prior);
  put(stage, 'incoming', incoming);
  const merge = spawnSync('git', ['merge-file', '-p', 'local', 'prior', 'incoming'], { cwd: stage, encoding: 'utf8' });
  assert.equal(merge.status, 0, merge.stderr);
  put(stage, `files/${skill}`, merge.stdout);
  put(stage, 'files/status/example.mjs', 'export const latest = true;\n');
  put(client, skill, 'edited while reviewing\n');
  const stale = run('apply-staged', ...args, '--stage', stage);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /Destination changed since staging/);
  assert.equal(existsSync(join(client, 'status/example.mjs')), false);
  put(client, skill, local);

  const applied = run('apply-staged', ...args, '--stage', stage);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(get(client, skill), merged);
  assert.equal(get(client, '.claude/skills/example/SKILL.md'), 'other tool\n');
  assert.deepEqual(JSON.parse(get(client, 'status/status.json')).sharing, editedStatus.sharing);
  assert.equal(JSON.parse(get(client, 'status/status.json')).template_commit, commit);

  const { backup } = JSON.parse(applied.stdout);
  const restored = run('restore', '--root', client, '--backup', backup);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(get(client, skill), local);
  assert.equal(existsSync(join(client, 'status/example.mjs')), false);
  assert.equal(JSON.parse(get(client, 'status/status.json')).template_commit, undefined);
});
