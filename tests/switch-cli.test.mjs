import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = new URL('../update/apply.mjs', import.meta.url).pathname;
const put = (root, path, body) => { mkdirSync(dirname(join(root,path)), { recursive:true }); writeFileSync(join(root,path),body); };
const get = (root, path) => readFileSync(join(root,path),'utf8');
const hash = body => createHash('sha256').update(body).digest('hex');
const run = (env,...args) => spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{...process.env,...env}});

function fixture(t, from='claude-code') {
  const base=mkdtempSync(join(tmpdir(),'orion-switch-')); t.after(()=>rmSync(base,{recursive:true,force:true}));
  const release=join(base,'release'), client=join(base,'client'); mkdirSync(release);mkdirSync(client);
  const manifest={template_version:'2.0.0',deployment:{tools:['claude-code','codex'],common_sources:[],entries:[
    {source:'skills/foo/SKILL.md',destinations:{'claude-code':'.claude/skills/foo/SKILL.md',codex:'.agents/skills/foo/SKILL.md'},ownership:'release',fingerprint_key:'skills/foo/SKILL.md'},
    {source:'skills/bar/SKILL.md',destinations:{'claude-code':'.claude/skills/bar/SKILL.md',codex:'.agents/skills/bar/SKILL.md'},ownership:'release',fingerprint_key:'skills/bar/SKILL.md'},
    {source:'agents/README.md',destinations:{'claude-code':'.claude/agents/README.md',codex:'team/README.md'},ownership:'client-template',fingerprint_key:'agents/README.md'}]}};
  put(release,'skills/foo/SKILL.md','new foo\n');put(release,'skills/bar/SKILL.md','new bar\n');put(release,'agents/README.md','template\n');
  put(release,'update/manifest.json',JSON.stringify(manifest));put(release,'update/pristine.json',JSON.stringify({files:{'skills/foo/SKILL.md':[hash('old foo\n')],'skills/bar/SKILL.md':[hash('old bar\n')]}}));
  execFileSync('git',['init','-q'],{cwd:release});execFileSync('git',['add','.'],{cwd:release});execFileSync('git',['-c','user.email=test@example.com','-c','user.name=Test','commit','-qm','release'],{cwd:release});
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:release,encoding:'utf8'}).trim();
  const skill=from==='codex'?'.agents/skills':'.claude/skills', job=from==='codex'?'team':'.claude/agents';
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',selected_tool:from,notes:'keep'}));
  put(client,`${skill}/foo/SKILL.md`,'old foo\n');put(client,`${skill}/bar/SKILL.md`,'my edited bar\n');put(client,`${skill}/custom/SKILL.md`,'my skill\n');
  put(client,`${skill}/speckit-plan/SKILL.md`,'maintainer only\n');
  put(client,`${job}/README.md`,'my roster rows\n');put(client,`${job}/writer.md`,'my job\n');
  put(client,'status/shift-log.md','old log\n');put(client,'status/shifts/writer.sh','old prompt\n');put(client,'status/shifts/writer.log','old run log\n');put(client,'status/shifts/writer.json',JSON.stringify({agent:'writer',surface:from,os:'other',wake_up:join(client,'status/shifts/writer.sh')}));
  return {release,client,commit,skill,job,to:from==='codex'?'claude-code':'codex',targetSkill:from==='codex'?'.claude/skills':'.agents/skills',targetJob:from==='codex'?'.claude/agents':'team'};
}

for (const from of ['claude-code','codex']) test(`switch ${from} preserves client work and invalidates saved schedules`,t=>{
  const h=fixture(t,from);const result=run({},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to',h.to);
  assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);
  assert.equal(JSON.parse(get(h.client,'status/status.json')).selected_tool,h.to);
  assert.equal(get(h.client,`${h.targetSkill}/foo/SKILL.md`),'new foo\n');assert.equal(existsSync(join(h.client,`${h.skill}/foo/SKILL.md`)),false);
  assert.equal(get(h.client,`${h.targetSkill}/bar/SKILL.md`),'my edited bar\n');assert.equal(existsSync(join(h.client,`${h.skill}/bar/SKILL.md`)),false);
  assert.equal(get(h.client,`${h.targetSkill}/custom/SKILL.md`),'my skill\n');assert.equal(get(h.client,`${h.targetJob}/README.md`),'my roster rows\n');assert.equal(get(h.client,`${h.targetJob}/writer.md`),'my job\n');
  assert.equal(existsSync(join(h.client,`${h.targetSkill}/speckit-plan/SKILL.md`)),false);
  for(const old of [`${h.skill}/custom/SKILL.md`,`${h.skill}/speckit-plan/SKILL.md`,`${h.job}/README.md`,`${h.job}/writer.md`]) assert.equal(existsSync(join(h.client,old)),false,old);
  assert.equal(existsSync(join(h.client,h.skill.split('/').slice(0,-1).join('/'))),false);
  assert.equal(get(h.client,`${report.backup}/files/${h.skill}/speckit-plan/SKILL.md`),'maintainer only\n');
  assert.equal(get(h.client,'status/shift-log.md'),'old log\n');assert.equal(existsSync(join(h.client,'status/shifts/writer.json')),false);assert.ok(report.invalidated_schedules.includes('writer'));
  assert.equal(existsSync(join(h.client,'status/shifts/writer.sh')),false);assert.equal(get(h.client,'status/shifts/writer.log'),'old run log\n');
});

test('legacy migration requires explicit source and collision preflight leaves client unchanged',t=>{
  const h=fixture(t);const status=JSON.parse(get(h.client,'status/status.json'));delete status.selected_tool;put(h.client,'status/status.json',JSON.stringify(status));
  assert.notEqual(run({},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to','codex').status,0);
  put(h.client,'.agents/skills/foo/SKILL.md','collision\n');
  const blocked=run({},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to','codex','--legacy-tool','claude-code');assert.notEqual(blocked.status,0);assert.equal(get(h.client,'.claude/skills/foo/SKILL.md'),'old foo\n');assert.equal(JSON.parse(get(h.client,'status/status.json')).selected_tool,undefined);
  rmSync(join(h.client,'.agents'),{recursive:true});
  const migrated=run({},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to','codex','--legacy-tool','claude-code');assert.equal(migrated.status,0,migrated.stderr);
});

test('failed install rolls back all writes and selection',t=>{
  const h=fixture(t);const result=run({ORION_SWITCH_FAIL_AFTER:'2'},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to','codex');assert.notEqual(result.status,0);
  assert.equal(JSON.parse(get(h.client,'status/status.json')).selected_tool,'claude-code');assert.equal(get(h.client,'.claude/skills/foo/SKILL.md'),'old foo\n');assert.equal(existsSync(join(h.client,'.agents/skills/foo/SKILL.md')),false);assert.ok(existsSync(join(h.client,'status/shifts/writer.json')));
});

test('completed switch can be restored with its roster, schedules and status',t=>{
  const h=fixture(t);const switched=run({},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to','codex');assert.equal(switched.status,0,switched.stderr);
  const backup=JSON.parse(switched.stdout).backup;
  const restored=run({},'restore','--root',h.client,'--backup',backup);assert.equal(restored.status,0,restored.stderr);
  assert.equal(JSON.parse(get(h.client,'status/status.json')).selected_tool,'claude-code');
  assert.equal(get(h.client,'.claude/skills/foo/SKILL.md'),'old foo\n');
  assert.equal(get(h.client,'.claude/agents/README.md'),'my roster rows\n');
  assert.equal(get(h.client,'.claude/skills/bar/SKILL.md'),'my edited bar\n');
  assert.equal(get(h.client,'.claude/skills/custom/SKILL.md'),'my skill\n');
  assert.ok(existsSync(join(h.client,'status/shifts/writer.json')));
  assert.equal(existsSync(join(h.client,'.agents/skills/foo/SKILL.md')),false);
});

test('an interrupted switch journal is recovered before another switch',t=>{
  const h=fixture(t);const switched=run({},'switch','--root',h.client,'--release-repo',h.release,'--commit',h.commit,'--to','codex');assert.equal(switched.status,0,switched.stderr);
  const backup=JSON.parse(switched.stdout).backup;
  const journalPath=join(h.client,backup,'journal.json');const journal=JSON.parse(readFileSync(journalPath,'utf8'));
  journal.state='pending';writeFileSync(journalPath,JSON.stringify(journal));
  const recovered=run({},'recover','--root',h.client);assert.equal(recovered.status,0,recovered.stderr);
  assert.equal(JSON.parse(get(h.client,'status/status.json')).selected_tool,'claude-code');
  assert.equal(get(h.client,'.claude/skills/foo/SKILL.md'),'old foo\n');
  assert.equal(existsSync(join(h.client,'.agents/skills/foo/SKILL.md')),false);
});
