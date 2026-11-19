import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { plainEnv } from './helpers/env.mjs';
const source = new URL('../', import.meta.url);
function harness(t, initial = {}) {
 const root = mkdtempSync(join(tmpdir(), 'orion-setup-')); t.after(() => rmSync(root,{recursive:true,force:true}));
 cpSync(new URL('status/',source), join(root,'status'), {recursive:true}); copyFileSync(new URL('start.mjs',source),join(root,'start.mjs'));
 const status = {...JSON.parse(readFileSync(new URL('status/status.schema-template.json',source))), ai_assistant:'codex', ...initial};
 writeFileSync(join(root,'status/status.json'),JSON.stringify(status));
 const mock=join(root,'fetch.mjs');
 writeFileSync(mock, `import {appendFileSync} from 'node:fs'; globalThis.fetch = async (url, options={}) => {
 const scenario=process.env.SCENARIO;
 appendFileSync(${JSON.stringify(join(root,'requests'))}, JSON.stringify({url,body:options.body,headers:options.headers})+'\\n');
 if(scenario==='network') throw new Error('secret-do-not-print');
 if(url.endsWith('/pair')) {
  if(scenario.startsWith('exchange-')) return new Response('{}',{status:Number(scenario.slice(9))});
  return new Response(JSON.stringify(scenario==='incomplete'?{install_token:'orion_'+ 'a'.repeat(48)}:{install_token:'orion_'+ 'a'.repeat(48),harness_id:'12345678-1234-1234-1234-123456789abc',bridge_url:'https://www.dailypractice.world/api/bridge'}),{status:200});
 }
 if(url.endsWith('/verify')) {
  if(scenario==='interrupt') process.exit(17);
  if(scenario==='verify-network') throw new Error('secret-do-not-print');
  return new Response(scenario==='verify-malformed'?'{}':JSON.stringify({status:'accepted',harness_id:scenario==='wrong-harness'?'87654321-1234-1234-1234-123456789abc':'12345678-1234-1234-1234-123456789abc'}),{status:scenario==='reject'?401:scenario==='verify-error'?503:200});
 }
 if(scenario==='checkpoint-malformed') return new Response('{}',{status:201});
 if(scenario==='checkpoint-refuse') return new Response('{}',{status:401});
 if(scenario==='checkpoint-network') throw new Error('secret-do-not-print');
 return new Response(JSON.stringify({signal_id:'s1',recorded_at:'2026-11-18T12:00:00.000Z',replay:false}),{status:201}); };`);
 return {root, status:()=>JSON.parse(readFileSync(join(root,'status/status.json'))), run:(args=[],scenario='',env={})=>spawnSync(process.execPath,['--import',pathToFileURL(mock).href,join(root,'start.mjs'),...args],{input:'',encoding:'utf8',env:plainEnv({SCENARIO:scenario,...env})})};
}
test('new setup without a code pauses with self-service recovery and no handoff',t=>{
 const h=harness(t); const r=h.run(['--checkins','no']);
 assert.equal(r.status,2,r.stdout+r.stderr); assert.match(r.stdout,/Pair Orion with Daily Practice to finish setup\. This lets us support your harness, deliver updates, and see when it is running\. Sign in to Daily Practice to get your one-time code\./);
 assert.match(r.stdout,/https:\/\/www.dailypractice.world\/home\/pair/); assert.doesNotMatch(r.stdout,/your AI takes it from here/); assert.equal(h.status().sharing.pairing.migration_started_at,null);
});
test('exchange is saved before rejected verification and resumes without spending another code',t=>{
 const h=harness(t); const first=h.run(['--code','BCDF-GHJK-LMNP'],'reject');
 assert.equal(first.status,2,first.stdout+first.stderr);
 assert.equal(h.status().sharing.pairing.state,'exchanged');
 assert.equal(h.status().sharing.pairing.last_check,'invalid');
 assert.doesNotMatch(first.stdout,/your AI takes it from here|orion_|aaaa|secret-do-not-print/);
 const second=h.run(); assert.equal(second.status,0,second.stdout+second.stderr);
 assert.match(second.stdout,/your AI takes it from here/); assert.equal(h.status().sharing.pairing.state,'verified');
 const calls=readFileSync(join(h.root,'requests'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(calls.filter(c=>c.url.endsWith('/pair')).length,1); assert.equal(calls.some(c=>c.url.includes('nudges')),false);
});
for (const scenario of ['network','exchange-400','exchange-404','exchange-429','exchange-503','incomplete','reject','verify-network','verify-error','verify-malformed','wrong-harness']) {
 test(`setup stays resumable after ${scenario}`,t=>{
  const h=harness(t); const r=h.run(['--code','BCDF-GHJK-LMNP'],scenario);
  assert.equal(r.status,2,r.stdout+r.stderr); assert.doesNotMatch(r.stdout,/your AI takes it from here|orion_|aaaa|secret-do-not-print/);
  assert.match(r.stdout,/node start.mjs/); assert.equal(h.status().sharing.pairing.migration_started_at,null);
 });
}
for(const code of ['', 'short', 'ABCD-EFGH-IJKL']) {
 test(`invalid or empty code ${JSON.stringify(code)} never finishes setup`,t=>{
  const h=harness(t); const r=h.run(['--code',code]); assert.equal(r.status,2); assert.doesNotMatch(r.stdout,/your AI takes it from here/);
 });
}
test('interrupted exchange resumes with saved answers and stored credential',t=>{
 const h=harness(t); assert.equal(h.run(['--code','BCDF-GHJK-LMNP'],'interrupt').status,17);
 assert.equal(h.status().sharing.pairing.state,'exchanged'); assert.equal(h.status().machine_profile.chosen_surface,'codex');
 assert.equal(h.run().status,2); // Interrupted owner leaves a lock requiring explicit recovery.
 const owner=JSON.parse(readFileSync(join(h.root,'status/.radio-lock/owner.json')));
 assert.throws(()=>process.kill(owner.pid,0));
 rmSync(join(h.root,'status/.radio-lock'),{recursive:true});
 assert.equal(h.run().status,0); assert.equal(h.status().sharing.pairing.state,'verified');
});
test('homed setup keeps the credential outside status and resumes verification',t=>{
 const h=harness(t,{home:{enabled:true,branch:'main'}}); const r=h.run(['--code','BCDF-GHJK-LMNP'],'reject');
 assert.equal(r.status,2); assert.equal(h.status().sharing.install_token,null);
 assert.match(readFileSync(join(h.root,'status/radio.key'),'utf8'),/^orion_/);
 assert.equal(h.run().status,0);
});
test('existing unmarked progress gets its one-time migration before wizard mutation',t=>{
 const sharing=JSON.parse(readFileSync(new URL('status/status.schema-template.json',source))).sharing;
 delete sharing.pairing;
 const h=harness(t,{sharing,started_at:'2026-01-01T00:00:00.000Z',business_name:'Saved business',machine_profile:{chosen_surface:'codex'}});
 const r=h.run(); assert.equal(r.status,2); const after=h.status();
 assert.ok(after.sharing.pairing.migration_started_at); assert.equal(after.business_name,'Saved business'); assert.equal(after.machine_profile.chosen_surface,'codex');
 const start=after.sharing.pairing.migration_started_at; h.run(); assert.equal(h.status().sharing.pairing.migration_started_at,start);
});
test('cloud attached acceptance still requires matching fresh server verification',t=>{
 const template=JSON.parse(readFileSync(new URL('status/status.schema-template.json',source)));
 const sharing={...template.sharing,radio_choice:'accepted',status_signal_enabled:true,bridge_url:'https://www.dailypractice.world/api/bridge',harness_id:'12345678-1234-1234-1234-123456789abc'};
 const h=harness(t,{sharing});
 assert.equal(h.run([],'reject',{ORION_CLOUD:'1'}).status,2);
 assert.equal(h.run([],'',{ORION_CLOUD:'1'}).status,0);
 assert.equal(h.status().sharing.install_token,null);
});
test('pristine older status without the pairing marker never gains grace from wizard profile writes',t=>{
 const sharing=JSON.parse(readFileSync(new URL('status/status.schema-template.json',source))).sharing; delete sharing.pairing;
 const h=harness(t,{sharing}); assert.equal(h.run().status,2);
 assert.equal(h.status().sharing.pairing.migration_started_at,null); assert.equal(h.run().status,2);
 assert.equal(h.status().sharing.pairing.migration_started_at,null);
});
test('malformed pairing state stops before changing the saved machine profile',t=>{
 const template=JSON.parse(readFileSync(new URL('status/status.schema-template.json',source)));
 template.sharing.pairing.migration_started_at='invalid';
 const h=harness(t,{sharing:template.sharing,machine_profile:{chosen_surface:'codex',detected_at:'saved'}});
 assert.equal(h.run().status,2); assert.deepEqual(h.status().machine_profile,{chosen_surface:'codex',detected_at:'saved'});
});
test('first report failure suppresses handoff and resumes the original checkpoint exactly once',t=>{
 const h=harness(t);const first=h.run(['--code','BCDF-GHJK-LMNP'],'checkpoint-network');
 assert.equal(first.status,2,first.stdout+first.stderr);assert.doesNotMatch(first.stdout,/your AI takes it from here/);
 const queued=JSON.parse(readFileSync(join(h.root,'status/radio-outbox.json')));assert.equal(queued.length,1);
 const resumed=h.run();assert.equal(resumed.status,0,resumed.stdout+resumed.stderr);
 const original=queued[0].body;const calls=readFileSync(join(h.root,'requests'),'utf8').trim().split('\n').map(JSON.parse).filter(c=>c.url.endsWith('/signals'));
 assert.ok(calls.every(c=>JSON.parse(c.body).occurred_at===original.occurred_at));
 const before=calls.length;assert.equal(h.run().status,0);
 assert.equal(readFileSync(join(h.root,'requests'),'utf8').trim().split('\n').map(JSON.parse).filter(c=>c.url.endsWith('/signals')).length,before);
});
for (const scenario of ['checkpoint-malformed','checkpoint-refuse']) {
 test(`first report ${scenario} stays queued and never permits handoff`,t=>{
  const h=harness(t);const run=h.run(['--code','BCDF-GHJK-LMNP'],scenario);
  assert.equal(run.status,2,run.stdout+run.stderr);assert.doesNotMatch(run.stdout,/your AI takes it from here/);
  assert.equal(JSON.parse(readFileSync(join(h.root,'status/radio-outbox.json'))).length,1);
 });
}
for (const selected of ['website-chat', 'chatgpt-app', 'claude-desktop']) {
 test(`legacy ${selected} setup hands off only to its recorded supported tool`, t => {
  const h=harness(t,{machine_profile:{chosen_surface:selected},business_name:'Saved business'});
  const run=h.run(['--code','BCDF-GHJK-LMNP']);
  assert.equal(run.status,0,run.stdout+run.stderr);
  assert.equal(h.status().machine_profile.chosen_surface,'codex');
  assert.equal(h.status().business_name,'Saved business');
  assert.match(run.stdout,/typing  codex/);
  assert.doesNotMatch(run.stdout,/attach the file|Create a Project|your AI.s website|paste status.status.json/);
 });
}

test('legacy unsupported surface without a recorded tool requests only executable choices', t => {
 const h=harness(t,{ai_assistant:null,machine_profile:{chosen_surface:'website-chat'},business_name:'Saved business'});
 const run=h.run(['--code','BCDF-GHJK-LMNP']);
 assert.equal(run.status,0,run.stdout+run.stderr);
 assert.ok(['codex','claude-code'].includes(h.status().machine_profile.chosen_surface));
 assert.equal(h.status().business_name,'Saved business');
 assert.match(run.stdout,/Choose Codex or Claude Code/);
 assert.doesNotMatch(run.stdout,/attach the file|Create a Project|your AI.s website|paste status.status.json/);
});

test('a waiting wizard preserves another wizard pairing, checkpoint and concurrent answers', async t => {
 const {spawn}=await import('node:child_process');
 const h=harness(t,{ai_assistant:null});
 const home=join(h.root,'home'); mkdirSync(join(home,'.codex'),{recursive:true}); mkdirSync(join(home,'.claude'));
 const a=spawn(process.execPath,['--import',pathToFileURL(join(h.root,'fetch.mjs')).href,join(h.root,'start.mjs')],{env:plainEnv({HOME:home,PATH:''}),stdio:['pipe','pipe','pipe']});
 t.after(()=>a.kill()); let output='';
 await new Promise((resolve,reject)=>{a.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Type a number and press Enter'))resolve();});a.once('error',reject);a.once('exit',code=>reject(Error(`early exit ${code}: ${output}`)));});
 const b=h.run(['--code','BCDF-GHJK-LMNP'],'',{HOME:home,PATH:''}); assert.equal(b.status,0,b.stdout+b.stderr);
 const paired=h.status(); paired.business_name='Concurrent saved business'; paired.checklist.business_name_set=true;
 writeFileSync(join(h.root,'status/status.json'),JSON.stringify(paired));
 const ended=new Promise(resolve=>a.once('exit',resolve)); a.stdin.end('surface=2\n');
 assert.equal(await ended,0,output);
 const after=h.status(); assert.ok(after.sharing.install_token===paired.sharing.install_token);
 assert.equal(after.sharing.harness_id,paired.sharing.harness_id); assert.equal(after.sharing.paired_at,paired.sharing.paired_at);
 assert.equal(after.sharing.pairing.migration_satisfied_at,paired.sharing.pairing.migration_satisfied_at); assert.deepEqual(after.setup_checkpoint,paired.setup_checkpoint);
 assert.equal(after.business_name,'Concurrent saved business'); assert.equal(after.checklist.business_name_set,true);
 assert.equal(readFileSync(join(h.root,'requests'),'utf8').trim().split('\n').map(JSON.parse).filter(c=>c.url.endsWith('/pair')).length,1);
 assert.doesNotMatch(output,/orion_|aaaa/);
});

test('no detected app routes setup to Codex or Claude Code installation',t=>{
 const h=harness(t); const home=join(h.root,'empty-home');mkdirSync(home);
 const detection=join(h.root,'no-apps.mjs');
 writeFileSync(detection,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const stat=fs.statSync;fs.statSync=(path,...args)=>{if(String(path).startsWith('/Applications/'))throw Object.assign(Error('not installed'),{code:'ENOENT'});return stat(path,...args);};syncBuiltinESMExports();`);
 const run=h.run([],'',{HOME:home,PATH:'',NODE_OPTIONS:`--import=${pathToFileURL(detection).href}`});
 assert.equal(run.status,2,run.stdout+run.stderr); assert.deepEqual(h.status().machine_profile.surfaces_found,[]);
 assert.match(run.stdout,/Install Codex or Claude Code, then open this folder there/);
 assert.match(run.stdout,/docs\/setup\.md/);
 assert.doesNotMatch(run.stdout,/websites .*work for everyone|README.s Step 4 shows that lane/);
});
