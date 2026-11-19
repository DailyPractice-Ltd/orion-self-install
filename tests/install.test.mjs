import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const release = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const tool of ['claude-code', 'codex']) {
  test(`install CLI creates an isolated ${tool} harness`, (t) => {
    const base = mkdtempSync(join(tmpdir(), 'orion-install-'));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    const target = join(base, 'client');
    const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const read = (path) => readFileSync(join(target, path), 'utf8');
    assert.equal(JSON.parse(read('status/status.json')).ai_assistant, tool);
    assert.ok(existsSync(join(target, 'AGENTS.md')));
    const skillRoot = tool === 'codex' ? '.agents/skills' : '.claude/skills';
    for (const name of ['prospecting', 'call-planner', 'friday-report', 'memory-consolidation', 'prospect-research-outreach', 'post-call-debrief']) {
      assert.ok(existsSync(join(target, skillRoot, name, 'SKILL.md')));
    }
    assert.equal(existsSync(join(target, 'library')), false);
    assert.equal(existsSync(join(target, tool === 'codex' ? 'agents' : '.claude/agents')), false);
    assert.equal(existsSync(join(target, '.specify')), false);
    assert.equal(existsSync(join(target, 'update/scaffold')), false);
    assert.ok(existsSync(join(target, '.git')));
    assert.equal(JSON.parse(read('status/status.json')).home.enabled, false);
    for (const path of ['skills', 'tests', 'specs', 'CLAUDE.md', tool === 'codex' ? '.claude' : '.agents', ...(tool === 'codex' ? [] : ['agents'])]) {
      assert.equal(existsSync(join(target, path)), false, `${path} leaked into client`);
    }
    const wizard = spawnSync(process.execPath, [join(target, 'start.mjs'), '--checkins', 'no'], { encoding: 'utf8', input: '', cwd: target });
    assert.equal(wizard.status, 2, wizard.stderr);
    assert.doesNotMatch(wizard.stdout, /Step 3 of 3|Read AGENTS.md and/);
    assert.equal(JSON.parse(read('status/status.json')).machine_profile.chosen_surface, tool);
    assert.equal(JSON.parse(read('status/status.json')).schema_version, '2.0.0');
    // Exercise the actual deployed wizard: all guard/report dependencies must ship.
    const mock = join(base, 'pairing-fetch.mjs');
    writeFileSync(mock, `globalThis.fetch = async url => {
      const harness_id = '12345678-1234-1234-1234-123456789abc';
      if (String(url).endsWith('/pair')) return Response.json({harness_id, install_token: 'orion_' + 'test'.repeat(6), bridge_url: 'https://radio.test/api/bridge'});
      if (String(url).endsWith('/verify')) return Response.json({status: 'accepted', harness_id});
      if (String(url).endsWith('/signals')) return Response.json({signal_id: 'setup-1', recorded_at: '2026-11-18T12:00:00.000Z', replay: false}, {status: 201});
      throw new Error('Unexpected route');
    };`);
    const paired = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, join(target, 'start.mjs'), '--code', 'BCDF-GHJK-LMNP'], { encoding: 'utf8', input: '', cwd: target });
    assert.equal(paired.status, 0, paired.stdout + paired.stderr);
    assert.match(paired.stdout, /Step 3 of 3/);
    const saved = JSON.parse(read('status/status.json'));
    assert.equal(saved.sharing.pairing.state, 'verified');
    assert.equal(saved.setup_checkpoint.delivered, true);
    assert.equal(saved.machine_profile.chosen_surface, tool);

    const second = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', tool, '--target', target, '--local-only'], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.equal(JSON.parse(read('status/status.json')).ai_assistant, tool);
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
  put('.claude/agents/README.md','my roster\n');put('.claude/agents/writer.md','my job\n');
  put('client-notes.md','my top-level notes\n');put('docs/my-playbook.md','my playbook\n');
  put('skills/maintainer/SKILL.md','release source\n');put('tests/private.test.mjs','release test\n');
  put('n8n/old-workflow.json','retired release file\n');
  // A broken link proves migration skips human records before traversing them.
  mkdirSync(join(legacy, 'specs'));
  try {
    symlinkSync(join(base, 'missing-human-record'), join(legacy, 'specs', 'unreadable.md'));
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    put('specs/unreadable.md', 'human-only fixture\n');
  }
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','claude-code','--target',target,'--migrate-from',legacy,'--local-only'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const read=path=>readFileSync(join(target,path),'utf8');
  assert.equal(JSON.parse(read('status/status.json')).ai_assistant,'claude-code');
  assert.equal(read('status/work-log.md'),'sold to client\n');
  assert.equal(read('status/radio.key'),'private-key\n');
  assert.equal(existsSync(join(target,'status/shifts')),false);
  assert.equal(JSON.parse(read('status/status.json')).home.enabled,false);
  assert.equal(read('agent/knowledge-base/01-business-context.md'),'my business\n');
  assert.equal(read('memory/INDEX.md'),'my memory\n');
  assert.equal(read('.claude/skills/custom/SKILL.md'),'my skill\n');
  assert.equal(read('legacy/claude-agents/README.md'),'my roster\n');
  assert.equal(read('legacy/claude-agents/writer.md'),'my job\n');
  assert.equal(read('client-notes.md'),'my top-level notes\n');
  assert.equal(read('docs/my-playbook.md'),'my playbook\n');
  for(const path of ['skills','tests','n8n','specs']) assert.equal(existsSync(join(target,path)),false);
  assert.equal(existsSync(join(target,'.specify')),false);
  assert.equal(existsSync(join(target,'.claude/skills/speckit-plan/SKILL.md')),false);
  assert.equal(JSON.parse(read('status/status.json')).schema_version,'2.0.0');

  assert.equal(readFileSync(join(legacy,'status/status.json'),'utf8').includes('ai_assistant'),false);
});

test('Codex migration preserves legacy team jobs in place', t => {
  const base=mkdtempSync(join(tmpdir(),'orion-codex-migrate-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const legacy=join(base,'legacy'),target=join(base,'client');mkdirSync(legacy);
  const put=(path,body)=>{const full=join(legacy,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,body);};
  put('status/status.json',JSON.stringify({template_version:'2.0.0',ai_assistant:'codex'}));
  put('team/README.md','my roster\n');put('team/writer.md','my job\n');
  const result=spawnSync(process.execPath,[join(release,'install.mjs'),'--tool','codex','--target',target,'--migrate-from',legacy,'--local-only'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const migrated = JSON.parse(readFileSync(join(target, 'status/status.json'), 'utf8'));
  assert.equal(migrated.ai_assistant, 'codex');
  assert.equal(readFileSync(join(target,'team/README.md'),'utf8'),'my roster\n');
  assert.equal(readFileSync(join(target,'team/writer.md'),'utf8'),'my job\n');
  assert.equal(existsSync(join(target,'agents')),false);
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
