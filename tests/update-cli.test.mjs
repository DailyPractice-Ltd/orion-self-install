import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
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
  // Without a receipt, an edited runtime script is unknown to Orion and stops the update before any change.
  const blocked=run('update','--root',client,'--release-repo',source,'--commit',commit); assert.equal(blocked.status,2,blocked.stdout+blocked.stderr);
  assert.deepEqual(JSON.parse(blocked.stdout).conflicts,[{path:'status/a.mjs',reason:'unknown'}]);
  assert.equal(get(client,'AGENTS.md'),'old instructions\r\n'); assert.equal(existsSync(join(client,'status/installed-files.json')),false); assert.equal(existsSync(join(client,'.update-backup')),false);
  put(client,'status/a.mjs','old a\n');
  const updated=run('update','--root',client,'--release-repo',source,'--commit',commit); assert.equal(updated.status,0,updated.stderr); const report=JSON.parse(updated.stdout);
  assert.equal(report.ai_assistant, 'codex');
  const updatedStatus = JSON.parse(get(client, 'status/status.json'));
  assert.equal(updatedStatus.ai_assistant, 'codex');
  assert.deepEqual(updatedStatus.sharing.pairing,{version:2,state:'verified',verified_at:'2026-11-18T12:00:00.000Z',last_check:'unreachable',last_connected_at:'2026-11-18T12:00:00.000Z'});
  assert.deepEqual(updatedStatus.checklist, { connector_crm_live: true });
  put(client, 'status/status.json', JSON.stringify({ ...updatedStatus, agent_name: 'Orion' }));
  assert.equal(get(client,'AGENTS.md'),'new instructions\n'); assert.equal(get(client,'status/a.mjs'),'console.log("new a")\n'); assert.equal(get(client,'status/b.mjs'),'console.log("new b")\n'); assert.equal(get(client,'.agents/skills/foo/SKILL.md'),'client edit\n'); assert.equal(get(client,'agents/README.md'),'personalized roster\n'); assert.equal(get(client,'.claude/skills/foo/SKILL.md'),'other tool content\n'); assert.equal(existsSync(join(client,'.agents/skills/old/SKILL.md')),false); assert.ok(report.unknown.includes('.agents/skills/foo/SKILL.md')); assert.ok(report.collisions.includes('agents/README.md'));
  const restored=run('restore','--root',client,'--backup',report.backup); assert.equal(restored.status,0,restored.stderr); assert.equal(get(client,'AGENTS.md'),'old instructions\r\n'); assert.equal(get(client,'status/a.mjs'),'old a\n'); assert.equal(get(client,'.agents/skills/old/SKILL.md'),'old retired\n'); assert.equal(existsSync(join(client,'update/manifest.json')),false); assert.equal(get(client,'.agents/skills/foo/SKILL.md'),'client edit\n'); assert.equal(JSON.parse(get(client,'status/status.json')).template_version,'1.0.0');
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
  assert.equal(existsSync(join(client,'status/installed-files.json')),false,'a receipt-free harness stays receipt-free');
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
  assert.match(result.stderr,/agent\/reinstall-from-1\.x\.md/);
  assert.equal(get(client,'AGENTS.md'),'old agents\n');assert.equal(get(client,'status/status.json'),status);
});

// ── Harnesses with an installed-file receipt ───────────────────────────────
const RECEIPT = 'status/installed-files.json';
const receiptOf = root => JSON.parse(get(root, RECEIPT));
const lf = text => requireHash(text.replace(/\r\n/g, '\n'));

/**
 * A git release whose commits are successive versions, and a Codex client installed at
 * 1.0.0 with the receipt install wrote: `installed` maps each installed destination to its
 * text, `keys` gives a destination's source identity when it differs from its path.
 */
function receiptWorld(t, { installed, keys = {}, retired = [], pristine = {}, aliases }) {
  const base=mkdtempSync(join(tmpdir(),'orion-receipt-update-')); t.after(()=>rmSync(base,{recursive:true,force:true}));
  const source=join(base,'release'), client=join(base,'client'); mkdirSync(source); mkdirSync(client);
  git(source,'init','-q');
  const publish = (version, files) => {
    for (const path of git(source,'ls-files').split('\n').filter(Boolean)) rmSync(join(source,path));
    const manifest = { template_version:version, deployment:{ tools:['claude-code','codex'], common_sources:[...Object.keys(files),'update/manifest.json','update/pristine.json'], entries:[], retired, ...(aliases && { fingerprints:{ legacy_aliases:aliases } }) } };
    for (const [path, body] of Object.entries(files)) put(source, path, body);
    put(source,'update/manifest.json',JSON.stringify(manifest)); put(source,'update/pristine.json',JSON.stringify({files:pristine}));
    git(source,'add','-A'); git(source,'-c','user.email=test@example.com','-c','user.name=Test','commit','-qm',version);
    return git(source,'rev-parse','HEAD');
  };
  const files = {};
  for (const [path, body] of Object.entries(installed)) { put(client, path, body); files[path] = { key:keys[path] || path, hash:lf(body), origin:'release' }; }
  put(client,'status/status.json',JSON.stringify({template_version:'1.0.0',ai_assistant:'codex',notes:'before'}));
  put(client,RECEIPT,JSON.stringify({ schema:'orion-installed-files', version:1, algorithm:'sha256-utf8-lf', ai_assistant:'codex', template_version:'1.0.0', recorded_by:'install', recorded_at:'2026-11-01T00:00:00.000Z', files },null,2));
  const update = (commit, env = {}) => spawnSync(process.execPath,[script,'update','--root',client,'--release-repo',source,'--commit',commit],{encoding:'utf8',env:plainEnv(env)});
  const command = (name, args, env = {}) => spawnSync(process.execPath,[script,name,'--root',client,...args],{encoding:'utf8',env:plainEnv(env)});
  const restore = backup => command('restore',['--backup',backup]);
  const recover = () => command('recover',[]);
  return { source, client, publish, update, restore, recover };
}

test('a receipt harness updates untouched files and keeps edited and unknown ones, across two updates', t => {
  const w = receiptWorld(t, {
    installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n', 'guide.md':'guide v1\n', 'status/a.mjs':'console.log("a v1")\n', '.agents/skills/old/SKILL.md':'old v1\n' },
    keys: { '.agents/skills/old/SKILL.md':'skills/old/SKILL.md' },
    retired: [{ source:'skills/old/SKILL.md', destinations:{'claude-code':'.claude/skills/old/SKILL.md',codex:'.agents/skills/old/SKILL.md'}, fingerprint_key:'skills/old/SKILL.md' }],
    // An older shipped README: matching it must not make a receipt-detected edit look untouched.
    pristine: { 'README.md':[requireHash('readme v0\n'), requireHash('readme v1\n')], 'guide.md':[requireHash('guide v1\n')] },
  });
  put(w.client,'AGENTS.md','agents v1\r\n');            // untouched; only the line endings differ
  put(w.client,'README.md','readme v0\n');              // edited to another shipped version
  put(w.client,'guide.md','client guide\n');            // edited
  put(w.client,'notes.md','client notes\n');            // unknown: not installed by Orion
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n', 'guide.md':'guide v2\n', 'status/a.mjs':'console.log("a v2")\n', 'notes.md':'notes v2\n', 'added.md':'added v2\n' });
  const first = w.update(v2); assert.equal(first.status,0,first.stderr); const report = JSON.parse(first.stdout);
  assert.equal(get(w.client,'AGENTS.md'),'agents v2\n');
  assert.equal(get(w.client,'status/a.mjs'),'console.log("a v2")\n');
  assert.equal(get(w.client,'added.md'),'added v2\n');
  assert.equal(get(w.client,'README.md'),'readme v0\n');
  assert.equal(get(w.client,'guide.md'),'client guide\n');
  assert.equal(get(w.client,'notes.md'),'client notes\n');
  assert.equal(existsSync(join(w.client,'.agents/skills/old/SKILL.md')),false);
  assert.deepEqual([...report.kept].sort(),['README.md','guide.md']);
  assert.deepEqual(report.unknown,['notes.md']);
  let receipt = receiptOf(w.client);
  assert.equal(receipt.template_version,'2.0.0');
  assert.equal(receipt.files['AGENTS.md'].hash,requireHash('agents v2\n'));
  assert.equal(receipt.files['added.md'].hash,requireHash('added v2\n'));
  assert.equal(receipt.files['README.md'].hash,requireHash('readme v1\n'),'an edited file keeps its installed baseline');
  assert.equal(receipt.files['guide.md'].hash,requireHash('guide v1\n'));
  assert.equal(receipt.files['notes.md'],undefined,'unknown bytes are never adopted');
  assert.equal(receipt.files['.agents/skills/old/SKILL.md'],undefined,'a retired file is no longer claimed');

  const v3 = w.publish('3.0.0', { 'AGENTS.md':'agents v3\n', 'README.md':'readme v3\n', 'guide.md':'guide v3\n', 'status/a.mjs':'console.log("a v2")\n', 'notes.md':'notes v2\n', 'added.md':'added v2\n' });
  const second = w.update(v3); assert.equal(second.status,0,second.stderr);
  assert.equal(get(w.client,'AGENTS.md'),'agents v3\n');
  assert.equal(get(w.client,'README.md'),'readme v0\n');
  assert.equal(get(w.client,'guide.md'),'client guide\n');
  assert.deepEqual([...JSON.parse(second.stdout).kept].sort(),['README.md','guide.md']);
  receipt = receiptOf(w.client);
  assert.equal(receipt.files['README.md'].hash,requireHash('readme v1\n'));
  assert.equal(receipt.files['AGENTS.md'].hash,requireHash('agents v3\n'));
});

test('a receipt harness stops before any release file changes when an edited runtime file would be replaced', t => {
  const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'status/a.mjs':'console.log("a v1")\n', 'status/b.mjs':'console.log("b v1")\n', 'start.mjs':'console.log("start v1")\n' } });
  put(w.client,'status/a.mjs','console.log("client a")\n');        // edited, and the release changes it
  put(w.client,'start.mjs','console.log("client start")\n');      // edited, but the release leaves it as installed
  put(w.client,'status/c.mjs','console.log("client c")\n');        // a script Orion never installed, where the release adds one
  const before = { agents:get(w.client,'AGENTS.md'), receipt:get(w.client,RECEIPT), status:get(w.client,'status/status.json') };
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'status/a.mjs':'console.log("a v2")\n', 'status/b.mjs':'console.log("b v2")\n', 'status/c.mjs':'console.log("c v2")\n', 'start.mjs':'console.log("start v1")\n', 'added.md':'added v2\n' });
  const result = w.update(v2);
  assert.equal(result.status,2,result.stdout+result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.state,'conflict');
  assert.equal(report.files_applied,false);
  assert.deepEqual(report.conflicts,[{path:'status/a.mjs',reason:'modified'},{path:'status/c.mjs',reason:'unknown'}]);
  assert.match(report.remaining_action,/put back the files Orion installed or delete them/);
  assert.equal(get(w.client,'AGENTS.md'),before.agents,'no ordinary change was applied either');
  assert.equal(get(w.client,'status/b.mjs'),'console.log("b v1")\n');
  assert.equal(existsSync(join(w.client,'added.md')),false);
  assert.equal(get(w.client,'status/a.mjs'),'console.log("client a")\n');
  assert.equal(get(w.client,RECEIPT),before.receipt);
  assert.equal(get(w.client,'status/status.json'),before.status);
  assert.equal(existsSync(join(w.client,'.update-backup')),false);

  // Once the client moves the edits out, the same update applies, and the untouched edit stays.
  rmSync(join(w.client,'status/a.mjs')); rmSync(join(w.client,'status/c.mjs'));
  const retry = w.update(v2); assert.equal(retry.status,0,retry.stdout+retry.stderr);
  assert.equal(get(w.client,'status/a.mjs'),'console.log("a v2")\n');
  assert.equal(get(w.client,'start.mjs'),'console.log("client start")\n');
  assert.deepEqual(JSON.parse(retry.stdout).kept,['start.mjs']);
  assert.equal(receiptOf(w.client).files['status/c.mjs'].hash,requireHash('console.log("c v2")\n'));
});

const damagedReceipts = {
  malformed: () => '{"schema":',
  unsupported: text => JSON.stringify({ ...JSON.parse(text), version: 2 }),
  'wrong-schema': text => JSON.stringify({ ...JSON.parse(text), schema: 'something-else' }),
};
for (const [name, damage] of Object.entries(damagedReceipts)) test(`a ${name} receipt stops the update before any change`, t => {
  const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n' }, pristine: { 'AGENTS.md':[requireHash('agents v1\n')] } }); // the registry would recognise it
  put(w.client, RECEIPT, damage(get(w.client, RECEIPT)));
  const before = get(w.client, RECEIPT);
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n' });
  const result = w.update(v2);
  assert.equal(result.status,2,result.stdout+result.stderr);
  assert.match(result.stderr,/installed-file receipt[\s\S]*nothing was changed/);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n','no fallback to the registry');
  assert.equal(get(w.client,RECEIPT),before);
  assert.equal(JSON.parse(get(w.client,'status/status.json')).template_version,'1.0.0');
  assert.equal(existsSync(join(w.client,'.update-backup')),false);
});

test('an unreadable receipt stops the update before any change', t => {
  const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n' }, pristine: { 'AGENTS.md':[requireHash('agents v1\n')] } });
  rmSync(join(w.client, RECEIPT)); mkdirSync(join(w.client, RECEIPT));
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n' });
  const result = w.update(v2);
  assert.equal(result.status,2,result.stdout+result.stderr);
  assert.match(result.stderr,/Cannot read the installed-file receipt/);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
});

test('a failed receipt update puts back files and receipt together, and a held lock changes nothing', t => {
  const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n' } });
  const before = get(w.client, RECEIPT);
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n' });
  // Each file is one step and the receipt write is the next: interrupt right after the receipt lands.
  const steps = 4; // AGENTS.md, README.md, update/manifest.json, update/pristine.json are added or replaced first
  const failed = w.update(v2, { ORION_UPDATE_FAIL_AFTER:String(steps + 1) });
  assert.equal(failed.status,2,failed.stdout+failed.stderr); assert.match(failed.stderr,/Injected update interruption/);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n'); assert.equal(get(w.client,'README.md'),'readme v1\n');
  assert.equal(existsSync(join(w.client,'update/manifest.json')),false);
  assert.equal(get(w.client,RECEIPT),before);

  mkdirSync(join(w.client,'status/.radio-lock'));
  const locked = w.update(v2, { ORION_STATUS_LOCK_WAIT_MS:'200' });
  assert.notEqual(locked.status,0); assert.match(locked.stderr,/Status is locked/);
  assert.equal(get(w.client,RECEIPT),before); assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
  rmSync(join(w.client,'status/.radio-lock'),{recursive:true});

  const applied = w.update(v2); assert.equal(applied.status,0,applied.stderr);
  assert.equal(receiptOf(w.client).files['README.md'].hash,requireHash('readme v2\n'));
});

// ── Harnesses from before receipts ─────────────────────────────────────────
/** A receipt-free Codex client at 1.0.0: what every harness installed before receipts looks like. */
function legacyWorld(t, options) {
  const w = receiptWorld(t, options);
  rmSync(join(w.client, RECEIPT));
  return w;
}

test('a harness without a receipt migrates: shipped files update, unknown ones are kept and reported, and the new baselines hold on the next update', t => {
  const w = legacyWorld(t, {
    installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n', 'guide.md':'guide v1\n', 'status/a.mjs':'console.log("a v1")\n',
      '.agents/skills/old/SKILL.md':'old v1\n', '.agents/skills/hire/SKILL.md':'hire v0\n', 'update/pristine.json':'{"files":{' },
    retired: [
      { source:'skills/old/SKILL.md', destinations:{'claude-code':'.claude/skills/old/SKILL.md',codex:'.agents/skills/old/SKILL.md'}, fingerprint_key:'skills/old/SKILL.md' },
      { source:'skills/hire/SKILL.md', destinations:{'claude-code':'.claude/skills/hire/SKILL.md',codex:'.agents/skills/hire/SKILL.md'}, fingerprint_key:'skills/hire/SKILL.md' },
    ],
    // The frozen registry: shipped versions by source identity, and an alias for a file that once shipped under another path.
    pristine: { 'AGENTS.md':[requireHash('agents v1\n')], 'README.md':[requireHash('readme v0\n'), requireHash('readme v1\n')], 'guide.md':[requireHash('guide v1\n')],
      'status/a.mjs':[requireHash('console.log("a v1")\n')], 'skills/old/SKILL.md':[requireHash('old v1\n')], '.claude/skills/hire/SKILL.md':[requireHash('hire v0\n')] },
    aliases: { 'skills/hire/SKILL.md':'.claude/skills/hire/SKILL.md' },
  });
  put(w.client,'AGENTS.md','agents v1\r\n');            // shipped; only the line endings differ
  put(w.client,'README.md','readme v0\n');              // an older shipped version: still Orion's
  put(w.client,'guide.md','client guide\n');            // edited: no shipped version matches
  put(w.client,'notes.md','client notes\n');            // never shipped at all
  const files = { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n', 'guide.md':'guide v2\n', 'status/a.mjs':'console.log("a v2")\n', 'notes.md':'notes v2\n', 'added.md':'added v2\n' };
  const v2 = w.publish('2.0.0', files);
  const first = w.update(v2); assert.equal(first.status,0,first.stdout+first.stderr); const report = JSON.parse(first.stdout);
  for (const path of ['AGENTS.md','README.md','status/a.mjs','added.md']) assert.equal(get(w.client,path),files[path],path);
  assert.equal(get(w.client,'guide.md'),'client guide\n');
  assert.equal(get(w.client,'notes.md'),'client notes\n');
  for (const path of ['.agents/skills/old/SKILL.md','.agents/skills/hire/SKILL.md']) assert.equal(existsSync(join(w.client,path)),false,`${path} retired`);
  assert.deepEqual([...report.unknown].sort(),['guide.md','notes.md']);
  let receipt = receiptOf(w.client);
  assert.equal(receipt.template_version,'2.0.0');
  for (const path of ['AGENTS.md','README.md','status/a.mjs','added.md']) assert.equal(receipt.files[path].hash,requireHash(files[path]),path);
  for (const path of ['guide.md','notes.md','.agents/skills/old/SKILL.md','.agents/skills/hire/SKILL.md']) assert.equal(receipt.files[path],undefined,`${path} is not claimed`);
  assert.equal(receipt.files['update/pristine.json'].hash,lf(get(w.client,'update/pristine.json')));
  assert.notEqual(get(w.client,'update/pristine.json'),'{"files":{','the registry copy is bookkeeping: replaced whatever its bytes');

  // The migrated receipt is the baseline now: a later edit is the client's, and untouched files keep updating.
  put(w.client,'AGENTS.md','client agents\n');
  const v3 = w.publish('3.0.0', { ...files, 'AGENTS.md':'agents v3\n', 'README.md':'readme v3\n', 'guide.md':'guide v3\n' });
  const second = w.update(v3); assert.equal(second.status,0,second.stdout+second.stderr); const next = JSON.parse(second.stdout);
  assert.equal(get(w.client,'AGENTS.md'),'client agents\n');
  assert.equal(get(w.client,'README.md'),'readme v3\n');
  assert.equal(get(w.client,'guide.md'),'client guide\n');
  assert.deepEqual(next.kept,['AGENTS.md']);
  assert.deepEqual([...next.unknown].sort(),['guide.md','notes.md']);
  receipt = receiptOf(w.client);
  assert.equal(receipt.files['AGENTS.md'].hash,requireHash('agents v2\n'));
  assert.equal(receipt.files['README.md'].hash,requireHash('readme v3\n'));
});

test('an update killed at any step is recovered with its receipt, and the next update trusts only what it installs', t => {
  // Steps: AGENTS.md, README.md, added.md, update/manifest.json, update/pristine.json, then the receipt.
  for (const [at, next] of [['1','recover'],['3','update'],['6','recover'],['6','update']]) {
    const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n' } });
    const before = get(w.client, RECEIPT);
    const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n', 'added.md':'added v2\n' });
    const killed = w.update(v2, { ORION_UPDATE_CRASH_AFTER:at });
    assert.notEqual(killed.status,0,`killed after step ${at}`);
    // A killed process leaves its lock behind; a person clears it once it has stopped.
    rmSync(join(w.client,'status/.radio-lock'),{recursive:true});
    if (next === 'recover') {
      const recovered = w.recover(); assert.equal(recovered.status,0,recovered.stdout+recovered.stderr);
      assert.equal(JSON.parse(recovered.stdout).recovered.length,1);
      assert.equal(get(w.client,'AGENTS.md'),'agents v1\n',`after step ${at}`);
      assert.equal(get(w.client,'README.md'),'readme v1\n');
      assert.equal(existsSync(join(w.client,'added.md')),false);
      assert.equal(get(w.client,RECEIPT),before,`the receipt is back as it was, after step ${at}`);
      assert.equal(JSON.parse(get(w.client,'status/status.json')).template_version,'1.0.0');
      // The client edits a file the interrupted update had touched; the retry keeps that edit.
      put(w.client,'README.md','readme v1 with our notes\n');
    }
    // Otherwise the retry recovers the pending journal itself before updating.
    const retried = w.update(v2); assert.equal(retried.status,0,retried.stdout+retried.stderr);
    assert.equal(get(w.client,'AGENTS.md'),'agents v2\n');
    const receipt = receiptOf(w.client);
    if (next === 'recover') {
      assert.equal(get(w.client,'README.md'),'readme v1 with our notes\n',`after step ${at}`);
      assert.equal(receipt.files['README.md'].hash,requireHash('readme v1\n'),'the edit is not trusted as installed');
    } else {
      assert.equal(get(w.client,'README.md'),'readme v2\n');
      assert.equal(receipt.files['README.md'].hash,requireHash('readme v2\n'));
      assert.equal(readdirSync(join(w.client,'.update-backup')).length,2,'the killed update and the retry');
    }
    assert.equal(receipt.files['AGENTS.md'].hash,requireHash('agents v2\n'));
    assert.equal(receipt.files['added.md'].hash,requireHash('added v2\n'));
  }
});

test('restore keeps later edits, restores the rest with their baselines, and the next update uses them', t => {
  const old = '.agents/skills/old/SKILL.md';
  const w = receiptWorld(t, {
    installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n', 'status/a.mjs':'console.log("a v1")\n', [old]:'old v1\n' },
    keys: { [old]:'skills/old/SKILL.md' },
    retired: [{ source:'skills/old/SKILL.md', destinations:{'claude-code':'.claude/skills/old/SKILL.md',codex:old}, fingerprint_key:'skills/old/SKILL.md' }],
  });
  const before = receiptOf(w.client);
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n', 'status/a.mjs':'console.log("a v2")\n', 'added.md':'added v2\n', 'dropped.md':'dropped v2\n' });
  const updated = w.update(v2); assert.equal(updated.status,0,updated.stderr);
  const { backup } = JSON.parse(updated.stdout);

  // After the update the client edits one replaced file, deletes an added one and writes
  // their own file where a retired one was.
  put(w.client,'README.md','readme v2 with our notes\n');
  rmSync(join(w.client,'dropped.md'));
  put(w.client,old,'our own skill now\n');
  const restore = w.restore(backup);
  assert.equal(restore.status,0,restore.stdout+restore.stderr);
  const restored = JSON.parse(restore.stdout);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
  assert.equal(get(w.client,'status/a.mjs'),'console.log("a v1")\n');
  assert.equal(existsSync(join(w.client,'added.md')),false);
  assert.equal(get(w.client,'README.md'),'readme v2 with our notes\n','a later edit is kept');
  assert.equal(get(w.client,old),'our own skill now\n','a later file where a retired one was is never overwritten');
  assert.ok(restored.kept.includes('README.md')); assert.ok(restored.kept.includes(old));

  let receipt = receiptOf(w.client);
  assert.equal(receipt.template_version,'1.0.0');
  assert.deepEqual(receipt.files['AGENTS.md'],before.files['AGENTS.md'],'a restored file takes back its prior baseline');
  assert.deepEqual(receipt.files['status/a.mjs'],before.files['status/a.mjs']);
  assert.equal(receipt.files['README.md'].hash,requireHash('readme v2\n'),'a kept file keeps the baseline the update installed');
  assert.equal(receipt.files['added.md'],undefined);
  assert.equal(receipt.files['dropped.md'],undefined,'a file that is gone is not claimed');
  assert.equal(receipt.files[old],undefined,'the client\'s file is not adopted');

  const v3 = w.publish('3.0.0', { 'AGENTS.md':'agents v3\n', 'README.md':'readme v3\n', 'status/a.mjs':'console.log("a v3")\n', 'added.md':'added v3\n', 'dropped.md':'dropped v3\n' });
  const next = w.update(v3); assert.equal(next.status,0,next.stdout+next.stderr);
  const report = JSON.parse(next.stdout);
  assert.equal(get(w.client,'AGENTS.md'),'agents v3\n');
  assert.equal(get(w.client,'status/a.mjs'),'console.log("a v3")\n');
  assert.equal(get(w.client,'added.md'),'added v3\n');
  assert.equal(get(w.client,'dropped.md'),'dropped v3\n');
  assert.equal(get(w.client,'README.md'),'readme v2 with our notes\n');
  assert.ok(report.kept.includes('README.md'));
  assert.ok(report.unknown.includes(old)); assert.equal(get(w.client,old),'our own skill now\n');
  receipt = receiptOf(w.client);
  assert.equal(receipt.files['README.md'].hash,requireHash('readme v2\n'));
  for (const path of ['AGENTS.md','status/a.mjs','added.md','dropped.md']) assert.equal(receipt.files[path].hash,requireHash(get(w.client,path)),path);
});

/**
 * An update that wrote the harness's first receipt (a migration from before receipts) records
 * that there was none: its journal's receipt has `prior: null` and the backup holds no copy.
 * Made here from a completed update's backup, as a crash would leave it.
 */
function firstReceiptUpdate(t, state) {
  const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n' } });
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n', 'added.md':'added v2\n' });
  const updated = w.update(v2); assert.equal(updated.status,0,updated.stderr);
  const { backup } = JSON.parse(updated.stdout), path = join(w.client, backup, 'journal.json');
  const journal = JSON.parse(get(w.client, `${backup}/journal.json`));
  assert.equal(journal.receipt.prior_hash, lf(get(join(w.client, backup), journal.receipt.prior)), 'the journal names the receipt copy it backed up');
  rmSync(join(w.client, backup, 'receipt'), { recursive:true });
  writeFileSync(path, JSON.stringify({ ...journal, state, receipt:{ ...journal.receipt, prior:null, prior_hash:null } }));
  return { ...w, backup, v2 };
}

test('recovering an update that wrote the first receipt leaves no receipt, as before', t => {
  const w = firstReceiptUpdate(t, 'pending');
  const recovered = w.recover(); assert.equal(recovered.status,0,recovered.stdout+recovered.stderr);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
  assert.equal(existsSync(join(w.client,'added.md')),false);
  assert.equal(existsSync(join(w.client,RECEIPT)),false,'receipt absence is restored with the files');
});

test('restoring an update that wrote the first receipt removes it, unless the receipt changed since', t => {
  const w = firstReceiptUpdate(t, 'complete');
  const restored = w.restore(w.backup); assert.equal(restored.status,0,restored.stdout+restored.stderr);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
  assert.equal(existsSync(join(w.client,RECEIPT)),false);

  // A receipt written after the update (say, by a later one) holds evidence the restore does not
  // undo: restored files lose their claims, since the backup recorded no baseline for them.
  const later = firstReceiptUpdate(t, 'complete');
  const receipt = receiptOf(later.client);
  put(later.client, RECEIPT, JSON.stringify({ ...receipt, recorded_at:'2026-11-20T00:00:00.000Z' }, null, 2));
  put(later.client, 'README.md', 'readme v2 with our notes\n');
  const kept = later.restore(later.backup); assert.equal(kept.status,0,kept.stdout+kept.stderr);
  assert.equal(get(later.client,'README.md'),'readme v2 with our notes\n');
  const after = receiptOf(later.client);
  assert.equal(after.files['README.md'].hash,requireHash('readme v2\n'),'the kept file keeps its baseline');
  for (const path of ['AGENTS.md','added.md']) assert.equal(after.files[path],undefined,path);
});

test('restoring a backup from before receipts leaves a harness without one as it is', t => {
  const w = receiptWorld(t, { installed: { 'AGENTS.md':'agents v1\n' }, pristine: { 'AGENTS.md':[requireHash('agents v1\n')] } });
  rmSync(join(w.client, RECEIPT));
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n' });
  const updated = w.update(v2); assert.equal(updated.status,0,updated.stderr);
  const { backup } = JSON.parse(updated.stdout);
  const restored = w.restore(backup); assert.equal(restored.status,0,restored.stdout+restored.stderr);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
  assert.equal(existsSync(join(w.client,RECEIPT)),false);
});

test('restoring a migration after its receipt changed gives restored files the baselines the migration proved', t => {
  const w = legacyWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'status/a.mjs':'console.log("a v1")\n' },
    pristine: { 'AGENTS.md':[requireHash('agents v1\n')], 'status/a.mjs':[requireHash('console.log("a v1")\n')] } });
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'status/a.mjs':'console.log("a v2")\n' });
  const updated = w.update(v2); assert.equal(updated.status,0,updated.stderr);
  // Another Orion command rewrote the receipt after the update (a tool switch does).
  put(w.client, RECEIPT, JSON.stringify({ ...receiptOf(w.client), recorded_by:'switch' }, null, 2));
  const restored = w.restore(JSON.parse(updated.stdout).backup); assert.equal(restored.status,0,restored.stdout+restored.stderr);
  assert.equal(get(w.client,'status/a.mjs'),'console.log("a v1")\n');
  assert.equal(receiptOf(w.client).files['status/a.mjs'].hash,requireHash('console.log("a v1")\n'));
  // So the restored runtime file is Orion's again, and the next update replaces it.
  const again = w.update(v2); assert.equal(again.status,0,again.stdout+again.stderr);
  assert.equal(get(w.client,'status/a.mjs'),'console.log("a v2")\n');
});

test('restoring a migration that kept a later edit keeps a receipt, so the edit is never adopted from an old shipped version', t => {
  const w = legacyWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'README.md':'readme v1\n' },
    pristine: { 'AGENTS.md':[requireHash('agents v1\n')], 'README.md':[requireHash('readme v0\n'), requireHash('readme v1\n')] } });
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n', 'README.md':'readme v2\n' });
  const updated = w.update(v2); assert.equal(updated.status,0,updated.stdout+updated.stderr);
  // After the update the client writes README.md back to text an old release once shipped.
  put(w.client,'README.md','readme v0\n');
  const restored = w.restore(JSON.parse(updated.stdout).backup); assert.equal(restored.status,0,restored.stdout+restored.stderr);
  assert.deepEqual(JSON.parse(restored.stdout).kept,['README.md']);
  assert.equal(get(w.client,'AGENTS.md'),'agents v1\n');
  const receipt = receiptOf(w.client);
  assert.equal(receipt.template_version,'1.0.0');
  assert.equal(receipt.files['AGENTS.md'].hash,requireHash('agents v1\n'),'the restored file takes the baseline the migration proved');
  assert.equal(receipt.files['README.md'].hash,requireHash('readme v2\n'),'the kept edit keeps the update baseline');
  // The next update keeps the client's README.md and still updates the rest.
  const v3 = w.publish('3.0.0', { 'AGENTS.md':'agents v3\n', 'README.md':'readme v3\n' });
  const next = w.update(v3); assert.equal(next.status,0,next.stdout+next.stderr);
  assert.equal(get(w.client,'README.md'),'readme v0\n');
  assert.deepEqual(JSON.parse(next.stdout).kept,['README.md']);
  assert.equal(get(w.client,'AGENTS.md'),'agents v3\n');
});

test('a migrating harness always replaces its registry copy: it is Orion bookkeeping, whatever its bytes', t => {
  const w = legacyWorld(t, { installed: { 'AGENTS.md':'agents v1\n', 'update/pristine.json':'{"files":{"mine":[]}}\n' },
    pristine: { 'AGENTS.md':[requireHash('agents v1\n')] } });
  const v2 = w.publish('2.0.0', { 'AGENTS.md':'agents v2\n' });
  const updated = w.update(v2); assert.equal(updated.status,0,updated.stdout+updated.stderr);
  const report = JSON.parse(updated.stdout);
  assert.equal(get(w.client,'AGENTS.md'),'agents v2\n');
  assert.equal(get(w.client,'update/pristine.json'),get(w.source,'update/pristine.json'));
  assert.ok(!report.unknown.includes('update/pristine.json'));
  assert.equal(receiptOf(w.client).files['update/pristine.json'].hash,lf(get(w.client,'update/pristine.json')));
});
