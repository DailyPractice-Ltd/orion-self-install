import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { plainEnv } from './helpers/env.mjs';

const script = new URL('../update/apply.mjs', import.meta.url).pathname;
const put = (root, path, body) => { mkdirSync(dirname(join(root,path)), {recursive:true}); writeFileSync(join(root,path),body); };
const get = (root, path) => readFileSync(join(root,path),'utf8');
const git = (cwd,...args) => execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const run = (...args) => spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:plainEnv()});

test('pinned selected update preserves collisions and restores additions and retirements', t => {
  const base=mkdtempSync(join(tmpdir(),'orion-update-cli-')); t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'), client=join(base,'client'); mkdirSync(source); mkdirSync(client);
  const manifest={template_version:'2.0.0', remove_status_checklist_keys:['n8n_wf01_imported'], deployment:{tools:['claude-code','codex'],common_sources:['AGENTS.md','status/a.mjs','status/b.mjs','update/manifest.json','update/pristine.json'],entries:[{source:'skills/foo/SKILL.md',destinations:{'claude-code':'.claude/skills/foo/SKILL.md',codex:'.agents/skills/foo/SKILL.md'},ownership:'release',fingerprint_key:'skills/foo/SKILL.md'},{source:'agents/README.md',destinations:{'claude-code':'.claude/agents/README.md',codex:'agents/README.md'},ownership:'client-template',fingerprint_key:'agents/README.md'}],retired:[{source:'skills/old/SKILL.md',destinations:{'claude-code':'.claude/skills/old/SKILL.md',codex:'.agents/skills/old/SKILL.md'},fingerprint_key:'skills/old/SKILL.md'}]}};
  put(source,'AGENTS.md','new instructions\n'); put(source,'status/a.mjs','console.log("new a")\n'); put(source,'status/b.mjs','console.log("new b")\n'); put(source,'skills/foo/SKILL.md','new skill\n'); put(source,'agents/README.md','roster template\n'); put(source,'update/manifest.json',JSON.stringify(manifest));
  const hash=s=>requireHash(s); const pristine={files:{'AGENTS.md':[hash('old instructions\n')],'status/a.mjs':[hash('old a\n')],'status/b.mjs':[hash('old b\n')],'skills/foo/SKILL.md':[hash('old skill\n')],'skills/old/SKILL.md':[hash('old retired\n')]}};
  put(source,'update/pristine.json',JSON.stringify(pristine));
  git(source,'init','-q'); git(source,'add','.'); git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release'); const commit=git(source,'rev-parse','HEAD'); put(source,'AGENTS.md','uncommitted instructions\n');
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',ai_assistant:'codex',notes:'before',sharing:{pairing:{version:2,state:'verified',verified_at:'2026-11-18T12:00:00.000Z',last_check:'unreachable',last_connected_at:'2026-11-18T12:00:00.000Z'}},checklist:{n8n_wf01_imported:true,connector_crm_live:true}}));
  put(client,'AGENTS.md','old instructions\r\n'); put(client,'status/a.mjs','client edited script\n'); put(client,'status/b.mjs','old b\n'); put(client,'.agents/skills/foo/SKILL.md','client edit\n'); put(client,'.agents/skills/old/SKILL.md','old retired\n'); put(client,'agents/README.md','personalized roster\n'); put(client,'.claude/skills/foo/SKILL.md','other tool content\n');
  const updated=run('update','--root',client,'--release-repo',source,'--commit',commit); assert.equal(updated.status,0,updated.stderr); const report=JSON.parse(updated.stdout);
  assert.equal(report.ai_assistant, 'codex');
  const updatedStatus = JSON.parse(get(client, 'status/status.json'));
  assert.equal(updatedStatus.ai_assistant, 'codex');
  assert.deepEqual(updatedStatus.sharing.pairing,{version:2,state:'verified',verified_at:'2026-11-18T12:00:00.000Z',last_check:'unreachable',last_connected_at:'2026-11-18T12:00:00.000Z'});
  assert.deepEqual(updatedStatus.checklist, { connector_crm_live: true });
  put(client, 'status/status.json', JSON.stringify({ ...updatedStatus, agent_name: 'Orion' }));
  assert.equal(get(client,'AGENTS.md'),'new instructions\n'); assert.equal(get(client,'status/a.mjs'),'console.log("new a")\n'); assert.equal(get(client,'status/b.mjs'),'console.log("new b")\n'); assert.equal(get(client,'.agents/skills/foo/SKILL.md'),'client edit\n'); assert.equal(get(client,'agents/README.md'),'personalized roster\n'); assert.equal(get(client,'.claude/skills/foo/SKILL.md'),'other tool content\n'); assert.equal(existsSync(join(client,'.agents/skills/old/SKILL.md')),false); assert.ok(report.kept.includes('.agents/skills/foo/SKILL.md')); assert.ok(report.replaced_edited_scripts.includes('status/a.mjs')); assert.ok(report.collisions.includes('agents/README.md'));
  const restored=run('restore','--root',client,'--backup',report.backup); assert.equal(restored.status,0,restored.stderr); assert.equal(get(client,'AGENTS.md'),'old instructions\r\n'); assert.equal(get(client,'status/a.mjs'),'client edited script\n'); assert.equal(get(client,'.agents/skills/old/SKILL.md'),'old retired\n'); assert.equal(existsSync(join(client,'update/manifest.json')),false); assert.equal(get(client,'.agents/skills/foo/SKILL.md'),'client edit\n'); assert.equal(JSON.parse(get(client,'status/status.json')).template_version,'1.0.0');
  const restoredStatus = JSON.parse(get(client, 'status/status.json'));
  assert.equal(restoredStatus.ai_assistant, 'codex');
  assert.equal(restoredStatus.agent_name, 'Orion');
  assert.deepEqual(restoredStatus.sharing,updatedStatus.sharing);
  assert.deepEqual(restoredStatus.checklist, { connector_crm_live: true, n8n_wf01_imported: true });
});
function requireHash(s) { return createHash('sha256').update(s).digest('hex'); }

test('same-version Codex update reports up to date and preserves job sheets',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-update-team-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'),client=join(base,'client');mkdirSync(source);mkdirSync(client);
  const manifest={template_version:'2.0.0',deployment:{tools:['claude-code','codex'],common_sources:[],entries:[]}};
  put(source,'agents/README.md','release roster\n');put(source,'update/manifest.json',JSON.stringify(manifest));put(source,'update/pristine.json',JSON.stringify({files:{}}));
  git(source,'init','-q');git(source,'add','.');git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release');
  const status=JSON.stringify({template_version:'2.0.0',ai_assistant:'codex'});
  put(client,'status/status.json',status);
  put(client,'team/README.md','client roster\n');put(client,'team/writer.md','client job\n');
  const updated=run('update','--root',client,'--release-repo',source,'--commit',git(source,'rev-parse','HEAD'));assert.equal(updated.status,0,updated.stderr);
  assert.equal(JSON.parse(updated.stdout).up_to_date,true);
  assert.equal(get(client,'status/status.json'),status);
  assert.equal(existsSync(join(client,'.update-backup')),false);
  assert.equal(get(client,'team/README.md'),'client roster\n');
  assert.equal(get(client,'team/writer.md'),'client job\n');
  assert.equal(existsSync(join(client,'agents')),false);
});

test('failed update rolls back writes from the predeclared transaction',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-update-failure-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'),client=join(base,'client');mkdirSync(source);mkdirSync(client);
  const manifest={template_version:'2.0.0',deployment:{tools:['claude-code','codex'],common_sources:['AGENTS.md','README.md'],entries:[]}};
  put(source,'AGENTS.md','new agents\n');put(source,'README.md','new readme\n');put(source,'update/manifest.json',JSON.stringify(manifest));
  put(source,'update/pristine.json',JSON.stringify({files:{'AGENTS.md':[requireHash('old agents\n')],'README.md':[requireHash('old readme\n')]}}));
  git(source,'init','-q');git(source,'add','.');git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release');
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',ai_assistant:'codex'}));
  put(client,'AGENTS.md','old agents\n');put(client,'README.md','old readme\n');
  const result=spawnSync(process.execPath,[script,'update','--root',client,'--release-repo',source,'--commit',git(source,'rev-parse','HEAD')],{encoding:'utf8',env:plainEnv({ORION_UPDATE_FAIL_AFTER:'1'})});
  assert.equal(result.status,2);assert.match(result.stderr,/Injected update interruption/);
  assert.equal(get(client,'AGENTS.md'),'old agents\n');assert.equal(get(client,'README.md'),'old readme\n');
  assert.equal(JSON.parse(get(client,'status/status.json')).template_version,'1.0.0');
  const recovery=run('recover','--root',client);assert.equal(recovery.status,0,recovery.stderr);
});

for (const marker of ['agent/agent-definition.md','agent/adapters/claude.md']) test(`update refuses a 1.x harness (${marker}) and points at the reinstall guide`,t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-update-1x-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'),client=join(base,'client');mkdirSync(source);mkdirSync(client);
  const manifest={template_version:'2.0.0',deployment:{tools:['claude-code','codex'],common_sources:['AGENTS.md'],entries:[]}};
  put(source,'AGENTS.md','new agents\n');put(source,'update/manifest.json',JSON.stringify(manifest));
  put(source,'update/pristine.json',JSON.stringify({files:{'AGENTS.md':[requireHash('old agents\n')]}}));
  git(source,'init','-q');git(source,'add','.');git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release');
  const status=JSON.stringify({template_version:'1.9.0',ai_assistant:'claude-code'});
  put(client,'status/status.json',status);put(client,'AGENTS.md','old agents\n');put(client,marker,'old\n');
  const result=run('update','--root',client,'--release-repo',source,'--commit',git(source,'rev-parse','HEAD'));
  assert.equal(result.status,2,result.stdout+result.stderr);
  assert.match(result.stderr,/docs\/reinstall-from-1\.x\.md/);
  assert.equal(get(client,'AGENTS.md'),'old agents\n');assert.equal(get(client,'status/status.json'),status);
});
