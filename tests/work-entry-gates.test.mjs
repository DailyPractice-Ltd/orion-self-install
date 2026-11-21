import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';
const source = new URL('../', import.meta.url);
const identity = '11111111-1111-1111-1111-111111111111';
function harness(t, outcome='accepted', pending=false) {
 const root=mkdtempSync(join(tmpdir(),'orion-work-gate-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const path of ['status','update','crm','plugins/orion/skills/call-planner']) cpSync(new URL(path,source),join(root,path),{recursive:true});
 const status=JSON.parse(readFileSync(new URL('status/status.schema-template.json',source),'utf8'));
 status.ai_assistant='codex'; status.scopes.send_risk='low'; status.sharing={...status.sharing,status_signal_enabled:true,bridge_url:'https://bridge.test/api/bridge',harness_id:identity,install_token:'orion_'+'test'.repeat(6)};
 writeFileSync(join(root,'status/status.json'),JSON.stringify(status));
 if(pending)writeFileSync(join(root,'status/radio-outbox.json'),JSON.stringify([{kind:'signal',body:{signal_type:'crm_updated',occurred_at:'2026-11-18T10:00:00.000Z',payload:{}}}]));
 mkdirSync(join(root,'.agents/skills/shared'),{recursive:true});writeFileSync(join(root,'.agents/skills/shared/SKILL.md'),'# Shared skill');
 writeFileSync(join(root,'data.json'),JSON.stringify({today:[],enrichment:[],lists:[]}));
 writeFileSync(join(root,'fetch.mjs'),`import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,options={})=>{appendFileSync(${JSON.stringify(join(root,'calls.jsonl'))},JSON.stringify({url,method:options.method||'GET'})+'\\n');if(url.endsWith('/verify')){if(${JSON.stringify(outcome)}==='unreachable')throw Error('offline');return new Response(JSON.stringify({status:'accepted',harness_id:'${identity}'}),{status:${outcome==='revoked'?401:outcome==='server_error'?503:200}});}if(url.endsWith('/signals'))return new Response(JSON.stringify({signal_id:'s1',recorded_at:'2026-11-18T12:00:00.000Z',replay:false}),{status:${outcome==='pending_failure'?503:201}});if(url.includes('/library/'))return new Response(JSON.stringify({name:'Example',content:'# Example',version:'1.0.0',kind:'skill'}),{status:200});return new Response('{"results":[]}',{status:200});};`);
 return {root,run(args){const result=spawnSync(process.execPath,['--import',join(root,'fetch.mjs'),...args],{cwd:root,encoding:'utf8',env:plainEnv({ATTIO_API_KEY:'test',HUBSPOT_API_KEY:'test'})});return {...result,output:result.stdout+result.stderr};},calls(){return existsSync(join(root,'calls.jsonl'))?readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[];}};
}
const commands=[
 ['send authorization',['status/send.mjs','score','--agent','orion','--to','client@example.test','--channel','email','--relationship','customer','--content','logistics']],
 ['stage advancement',['status/emit-status.mjs','--ops_stage','day1_encode']],
 ['Attio configuration',['crm/attio/apply-attio-template.mjs']],
 ['HubSpot configuration',['crm/hubspot/apply-hubspot-template.mjs']],
 ['call plan',['plugins/orion/skills/call-planner/scripts/build-call-plan.mjs','--data','data.json']],
 ['radio message',['status/radio.mjs','send','--message','hello','--yes']],
 ['radio reply',['status/radio.mjs','reply','--nudge','n1','--message','hello','--yes']],
 ['skill contribution',['status/radio.mjs','contribute','--slug','shared','--yes']],
 ['library installation',['status/radio.mjs','library','--install','example','--yes']],
];
for(const [name,args] of commands)for(const outcome of ['revoked','unreachable','server_error','pending_failure'])test(`${name} stops actual work on ${outcome}`,t=>{
 const h=harness(t,outcome,outcome==='pending_failure'); const r=h.run(args);
 assert.equal(r.status,2,r.output);
 assert.equal(JSON.parse(readFileSync(join(h.root,'status/status.json'))).ops_stage,'booked');
 assert.equal(existsSync(join(h.root,'status/send-log.md')),false);
 assert.equal(existsSync(join(h.root,'.agents/skills/example')),false);
 assert.deepEqual(readdirSync(h.root).filter(name=>name.startsWith('call-plan-')),[]);
 assert.equal(existsSync(join(h.root,'.claude/skills/example')),false);
 assert.ok(h.calls().every(c=>c.url.endsWith('/verify')||c.url.endsWith('/signals')),JSON.stringify(h.calls()));
 if(outcome==='pending_failure')assert.equal(JSON.parse(readFileSync(join(h.root,'status/radio-outbox.json'))).length,1);
});
test('direct outbound invocation freshly verifies and replays pending reports before sending',t=>{
 const h=harness(t,'accepted',true);
 for(let i=0;i<2;i++){const r=h.run(['status/radio.mjs','send','--message','hello','--yes']);assert.equal(r.status,0,r.output);}
 assert.deepEqual(h.calls().map(c=>new URL(c.url).pathname),['/api/bridge/verify','/api/bridge/signals','/api/bridge/nudges','/api/bridge/verify','/api/bridge/nudges']);
 assert.deepEqual(JSON.parse(readFileSync(join(h.root,'status/radio-outbox.json'))),[]);
});
for(const outcome of ['accepted','revoked','unreachable','server_error','pending_failure'])test(`scheduled task command applies ${outcome} before its actual output`,t=>{
 const h=harness(t,outcome,true); const r=spawnSync('/bin/sh',['-c','node --import ./fetch.mjs status/guard.mjs check --quiet && node --import ./fetch.mjs plugins/orion/skills/call-planner/scripts/build-call-plan.mjs --data data.json'],{cwd:h.root,encoding:'utf8',env:plainEnv()});
 assert.equal(r.status,outcome==='accepted'?0:2,r.stdout+r.stderr);
 const outputs=readdirSync(h.root).filter(name=>name.startsWith('call-plan-'));
 assert.equal(outputs.length,outcome==='accepted'?3:0);
 if(outcome==='accepted')assert.equal(new URL(h.calls()[1].url).pathname,'/api/bridge/signals');
 else assert.ok(h.calls().every(c=>c.url.endsWith('/verify')||c.url.endsWith('/signals')));
});
for(const [name,args] of commands)test(`${name} proceeds after fresh acceptance`,t=>{
 const h=harness(t);const r=h.run(args);
 assert.equal(r.status,0,r.output);
 assert.equal(new URL(h.calls()[0].url).pathname,'/api/bridge/verify');
 if(name==='stage advancement')assert.equal(JSON.parse(readFileSync(join(h.root,'status/status.json'))).ops_stage,'day1_encode');
 if(name==='send authorization')assert.equal(existsSync(join(h.root,'status/send-log.md')),true);
 if(name==='call plan')assert.match(r.output,/Day sheet written:/);
 if(name.endsWith('configuration'))assert.ok(h.calls().some(c=>c.method==='POST'&&!c.url.startsWith('https://bridge.test')));
 if(name==='library installation')assert.match(r.output,/Written: 1 file/);
});
test('a call-planner copy elsewhere uses the Orion folder it runs in and writes no outputs on pause',t=>{
 const h=harness(t,'revoked');mkdirSync(join(h.root,'.agents/skills'),{recursive:true});cpSync(join(h.root,'plugins/orion/skills/call-planner'),join(h.root,'.agents/skills/call-planner'),{recursive:true});
 const r=h.run(['.agents/skills/call-planner/scripts/build-call-plan.mjs','--data','data.json']);
 assert.equal(r.status,2,r.output);assert.equal(h.calls().length,1);
});
test('post-work signals, support inspection and policy recovery remain usable while pairing is revoked',t=>{
 const h=harness(t,'revoked');
 for(const args of [
  ['status/radio.mjs','signal','--type','crm_updated'],
  ['status/radio.mjs','check'],
  ['status/send.mjs','outcome','sent','--agent','orion','--score','0'],
  ['status/send.mjs','no-contact','--add','stop@example.test'],
  ['status/emit-status.mjs','--notes','Recovering pairing'],
 ]) {const r=h.run(args);assert.equal(r.status,0,r.output);}
 assert.ok(h.calls().every(c=>!c.url.endsWith('/verify')));
 assert.match(readFileSync(join(h.root,'status/no-contact.md'),'utf8'),/stop@example.test/);
 assert.equal(JSON.parse(readFileSync(join(h.root,'status/status.json'))).notes,'Recovering pairing');
});

for(const outcome of ['unreachable','server_error','pending_failure']) for(const [name,args] of commands) test(`${name} permits silent ${outcome} within the shared allowance`,t=>{
 const h=harness(t,outcome,outcome==='pending_failure');const path=join(h.root,'status/status.json');const s=JSON.parse(readFileSync(path));
 const connected=new Date(Date.now()-24*60*60*1000).toISOString();s.sharing.pairing={version:2,state:'verified',verified_at:connected,last_check:'accepted',last_connected_at:connected};writeFileSync(path,JSON.stringify(s));
 const r=h.run(args);assert.equal(r.status,0,r.output);assert.doesNotMatch(r.output,/could not be reached|could not verify|still waiting|restore the connection|saved for recovery|radio did not acknowledge/i);
 assert.equal(JSON.parse(readFileSync(path)).sharing.pairing.last_connected_at,connected);
 if(name==='stage advancement')assert.equal(JSON.parse(readFileSync(path)).ops_stage,'day1_encode');
 if(name==='send authorization')assert.equal(existsSync(join(h.root,'status/send-log.md')),true);
 if(name==='call plan')assert.match(r.output,/Day sheet written:/);
 if(name.endsWith('configuration'))assert.ok(h.calls().some(c=>c.method==='POST'&&!c.url.startsWith('https://bridge.test')));
 if(name==='library installation')assert.match(r.output,/Written: 1 file/);
});
