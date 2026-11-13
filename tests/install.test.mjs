import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const release = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const tool of ['claude-code', 'codex']) {
  test(`install CLI creates an isolated ${tool} harness`, (t) => {
    const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const target = join(base, 'client');
    const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target, '--local-only'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const read = (path) => readFileSync(join(target, path), 'utf8');
    assert.equal(JSON.parse(read('status/status.json')).selected_tool, tool);
    assert.ok(existsSync(join(target, 'AGENTS.md')));
    assert.ok(existsSync(join(target, tool === 'codex' ? '.agents/skills/hire-agent/SKILL.md' : '.claude/skills/hire-agent/SKILL.md')));
    assert.ok(existsSync(join(target, tool === 'codex' ? 'agents/README.md' : '.claude/agents/README.md')));
    for (const path of ['skills', 'tests', 'specs', 'CLAUDE.md', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
      assert.equal(existsSync(join(target, path)), false, `${path} leaked into client`);
    }
    const wizard = spawnSync(process.execPath, [join(target, 'start.mjs'), '--checkins', 'no'], { encoding: 'utf8', input: '', cwd: target });
    assert.equal(wizard.status, 0, wizard.stderr);
    assert.equal(JSON.parse(read('status/status.json')).machine_profile.chosen_surface, tool);
    const second = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target, '--local-only'], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.equal(JSON.parse(read('status/status.json')).selected_tool, tool);
  });
}

test('install CLI rejects collisions before creating status', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const target = join(base, 'client');
  mkdirSync(target);
  writeFileSync(join(target, 'AGENTS.md'), 'my own instructions\n');
  const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', 'codex', '--target', target, '--local-only'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), 'my own instructions\n');
  assert.equal(existsSync(join(target, 'status/status.json')), false);
});

test('release wizard and home command do not turn the checkout into a client', () => {
  const statusPath = join(release, 'status/status.json');
  const hash = () => existsSync(statusPath)
    ? createHash('sha256').update(readFileSync(statusPath)).digest('hex')
    : null;
  const before = hash();
  for (const script of ['start.mjs', 'status/home.mjs']) {
    const args = script === 'start.mjs' ? [] : ['prepare', '--yes'];
    const run = spawnSync(process.execPath, [join(release, script), ...args], { encoding: 'utf8', input: '' });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /release folder/i);
  }
  assert.equal(hash(), before, 'release checkout status was not changed');
});

test('legacy migration carries personal work into a separate deployed repository', t => {
  const base=mkdtempSync(join(tmpdir(),'orion-migrate-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const legacy=join(base,'legacy'),target=join(base,'client');mkdirSync(legacy);
  const put=(path,body)=>{const full=join(legacy,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,body);};
  put('status/status.json',JSON.stringify({template_version:'1.1.0',notes:'my notes',business_name:'Example Co'}));
  put('status/work-log.md','sold to client\n');put('status/radio.key','private-key\n');
  put('status/shifts/writer.json',JSON.stringify({wake_up:join(legacy,'status/shifts/writer.sh')}));
  put('agent/knowledge-base/01-business-context.md','my business\n');
  put('memory/INDEX.md','my memory\n');
  put('.claude/skills/custom/SKILL.md','my skill\n');
  put('.claude/skills/speckit-plan/SKILL.md','release only\n');
  put('.claude/agents/README.md','my roster\n');put('.claude/agents/writer.md','my job\n');
  put('client-notes.md','my top-level notes\n');put('docs/my-playbook.md','my playbook\n');
  put('skills/maintainer/SKILL.md','release source\n');put('tests/private.test.mjs','release test\n');
  put('n8n/old-workflow.json','retired release file\n');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','claude-code','--target',target,'--migrate-from',legacy,'--local-only'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const read=path=>readFileSync(join(target,path),'utf8');
  assert.equal(JSON.parse(read('status/status.json')).selected_tool,'claude-code');
  assert.equal(read('status/work-log.md'),'sold to client\n');
  assert.equal(read('status/radio.key'),'private-key\n');
  assert.equal(existsSync(join(target,'status/shifts')),false);
  assert.equal(JSON.parse(read('status/status.json')).home.enabled,false);
  assert.equal(read('agent/knowledge-base/01-business-context.md'),'my business\n');
  assert.equal(read('memory/INDEX.md'),'my memory\n');
  assert.equal(read('.claude/skills/custom/SKILL.md'),'my skill\n');
  assert.equal(read('.claude/agents/README.md'),'my roster\n');
  assert.equal(read('.claude/agents/writer.md'),'my job\n');
  assert.equal(read('client-notes.md'),'my top-level notes\n');
  assert.equal(read('docs/my-playbook.md'),'my playbook\n');
  for(const path of ['skills','tests','n8n']) assert.equal(existsSync(join(target,path)),false);
  assert.equal(existsSync(join(target,'.claude/skills/speckit-plan')),false);
  assert.equal(readFileSync(join(legacy,'status/status.json'),'utf8').includes('selected_tool'),false);
});

test('Codex migration maps legacy team jobs without copying release agent sources', t => {
  const base=mkdtempSync(join(tmpdir(),'orion-codex-migrate-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const legacy=join(base,'legacy'),target=join(base,'client');mkdirSync(legacy);
  const put=(path,body)=>{const full=join(legacy,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,body);};
  put('status/status.json',JSON.stringify({template_version:'2.0.0',selected_tool:'codex'}));
  put('team/README.md','my roster\n');put('team/writer.md','my job\n');
  put('agents/README.md','release roster source\n');put('agents/maintainer.md','release-only agent\n');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','codex','--target',target,'--migrate-from',legacy,'--local-only'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(join(target,'agents/README.md'),'utf8'),'my roster\n');
  assert.equal(readFileSync(join(target,'agents/writer.md'),'utf8'),'my job\n');
  assert.equal(existsSync(join(target,'agents/maintainer.md')),false);
  assert.equal(existsSync(join(target,'team')),false);
});

test('install requires an explicit repository provisioning choice',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-install-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const target=join(base,'client');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','codex','--target',target],{encoding:'utf8'});
  assert.equal(result.status,2);
  assert.match(result.stderr,/Choose exactly one/);
  assert.equal(existsSync(target),false);
});

test('remote setup rejects a repository that is not verified private',t=>{
  const base=mkdtempSync(join(tmpdir(),'orion-remote-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const bin=join(base,'bin');mkdirSync(bin);
  writeFileSync(join(bin,'gh'),'#!/bin/sh\nprintf "false\\n"\n');
  chmodSync(join(bin,'gh'),0o755);
  const target=join(base,'client');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','codex','--target',target,'--remote','https://github.com/owner/private.git'],{encoding:'utf8',env:{...process.env,PATH:`${bin}:${process.env.PATH}`}});
  assert.equal(result.status,2);assert.match(result.stderr,/must exist and be private/);
  assert.equal(existsSync(target),false);
});
