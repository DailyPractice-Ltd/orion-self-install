import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {checkWork,runWork} from '../status/guard.mjs';
import {reportSignal} from '../status/report.mjs';
import {plainEnv} from './helpers/env.mjs';
import { copyStatusResources } from './helpers/status.mjs';
const id='11111111-1111-1111-1111-111111111111';
const time='2026-11-18T12:00:00.000Z', deadline='2026-11-20T12:00:00.000Z';
const at = value => () => new Date(value);
const offline=async()=>{throw Error('offline');};
const online=async url=>({status:url.endsWith('/verify')?200:201,json:async()=>url.endsWith('/verify')?{status:'accepted',harness_id:id}:{signal_id:'s',recorded_at:time,replay:false}});
function harness(t,marker={version:2,state:'verified',verified_at:time,last_check:'accepted',last_connected_at:time}) {
 const root=mkdtempSync(join(tmpdir(),'allowance-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'status'));
 writeFileSync(join(root,'status/status.json'),JSON.stringify({ops_stage:'formalised',sharing:{status_signal_enabled:true,bridge_url:'https://example.test/api/bridge',harness_id:id,install_token:'orion_'+'test'.repeat(6),pairing:marker}}));
 return root;
}
const read=root=>JSON.parse(readFileSync(join(root,'status/status.json')));
const save=(root,value)=>writeFileSync(join(root,'status/status.json'),JSON.stringify(value));
for(const failure of ['network','server','malformed-response']) test(`${failure}: allowance before/exactly at/after 48 elapsed hours persists across new invocations`,async t=>{
 const root=harness(t);const fetchImpl=failure==='network'?offline:failure==='server'?async()=>({status:503}):async()=>({status:200,json:async()=>({})});
 for(const [instant,allow] of [['2026-11-20T11:59:59.999Z',true],[deadline,false],['2026-11-20T12:00:00.001Z',false]]) {
  const result=await checkWork({root,now:at(instant),fetchImpl});assert.equal(result.allow,allow);assert.equal(result.allowance,allow);assert.equal(result.deadlineAt,deadline);assert.equal(read(root).sharing.pairing.last_connected_at,time);
 }
 assert.equal((await checkWork({root,now:at(deadline),fetchImpl:online})).allow,true);
 assert.equal(read(root).sharing.pairing.last_connected_at,deadline);
});
for(const code of [401,403]) test(`credential refusal ${code} clears allowance until a complete recovery`,async t=>{
 const root=harness(t);assert.equal((await checkWork({root,now:at(time),fetchImpl:async()=>({status:code})})).allow,false);assert.equal(read(root).sharing.pairing.last_connected_at,null);
 assert.equal((await checkWork({root,now:at(time),fetchImpl:offline})).allow,false);
 assert.equal((await checkWork({root,now:at(time),fetchImpl:online})).allow,true);
});
for(const value of ['tomorrow','2026-11-19T12:00:00.000Z','2026-02-30T12:00:00.000Z',undefined]) test(`unsafe connection timestamp ${value} requires recovery`,async t=>{
 const root=harness(t);const s=read(root);s.sharing.pairing.last_connected_at=value;save(root,s);
 assert.equal((await checkWork({root,now:at(time),fetchImpl:online})).allow,false);
});
test('version 1 upgrade ignores verification and migration timestamps rather than inferring an allowance',async t=>{
 const root=harness(t,{version:1,state:'verified',verified_at:time,last_check:'accepted',migration_started_at:time,migration_deadline_at:'2027-01-01',migration_satisfied_at:time});
 assert.equal((await checkWork({root,now:at(time),fetchImpl:offline})).allow,false);assert.equal(read(root).sharing.pairing.last_connected_at,null);assert.equal(read(root).sharing.pairing.version,2);
 assert.equal((await checkWork({root,now:at(time),fetchImpl:online})).allow,true);
});
test('partial and repeatedly failed replay never refreshes accepted verification clock; full recovery does',async t=>{
 const root=harness(t);
 for(let i=0;i<2;i++) await reportSignal({root,signalType:'crm_updated',occurredAt:`2026-11-18T12:00:0${i}.000Z`,fetchImpl:offline});
 let posts=0;const partial=async url=>url.endsWith('/verify')?online(url):++posts===1?online(url):{status:503,json:async()=>({})};
 assert.equal((await checkWork({root,now:at('2026-11-19T12:00:00Z'),fetchImpl:partial})).allow,true);
 assert.equal(JSON.parse(readFileSync(join(root,'status/radio-outbox.json'))).length,1);assert.equal(read(root).sharing.pairing.last_connected_at,time);
 const failure=async url=>url.endsWith('/verify')?online(url):offline();
 assert.equal((await checkWork({root,now:at(deadline),fetchImpl:failure})).allow,false);assert.equal(read(root).sharing.pairing.last_connected_at,time);
 assert.equal((await checkWork({root,now:at(deadline),fetchImpl:online})).allow,true);assert.equal(read(root).sharing.pairing.last_connected_at,deadline);
});
test('post-work delivery alone never renews the clock and credential rejection invalidates it',async t=>{
 const root=harness(t);await reportSignal({root,signalType:'crm_updated',fetchImpl:online});assert.equal(read(root).sharing.pairing.last_connected_at,time);
 await reportSignal({root,signalType:'crm_updated',fetchImpl:async()=>({status:401,json:async()=>({})})});assert.equal(read(root).sharing.pairing.last_connected_at,null);
});
test('disabled radio, wrong report identity and corrupt queues block within the allowance',async t=>{
 for(const kind of ['disabled','identity','corrupt']) {
  const root=harness(t);if(kind==='disabled'){const s=read(root);s.sharing.status_signal_enabled=false;save(root,s);}
  else writeFileSync(join(root,'status/radio-outbox.json'),kind==='corrupt'?'[{}]':JSON.stringify([{kind:'signal',body:{harness_id:'22222222-2222-2222-2222-222222222222',signal_type:'crm_updated',occurred_at:time,payload:{}}}]));
  assert.equal((await checkWork({root,now:at(time),fetchImpl:online})).allow,false);
 }
});
test('setup-only verification cannot grant work or refresh the allowance even with an empty queue',async t=>{
 const root=harness(t);assert.equal((await checkWork({root,now:at(deadline),fetchImpl:online,replay:false})).allow,false);assert.equal(read(root).sharing.pairing.last_connected_at,time);
});
function child(args,env) {return new Promise(resolve=>{const p=spawn(process.execPath,args,{env});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('close',code=>resolve({code,output}));});}
test('allowed outages print nothing in quiet and normal CLI checks and post-work reporting',async t=>{
 const root=harness(t);const saved=read(root);copyStatusResources(root);save(root,saved);cpSync(new URL('../update/',import.meta.url),join(root,'update'),{recursive:true});
 const preload=join(root,'offline.mjs');writeFileSync(preload,`const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-11-19T12:00:00Z']));}static now(){return 1795089600000;}};globalThis.fetch=async()=>{throw Error('offline');};`);
 for(const extra of [[],['--quiet']]) {const r=await child(['--import',preload,join(root,'status/guard.mjs'),'check',...extra],plainEnv());assert.equal(r.code,0,r.output);assert.equal(r.output,'');}
 const r=await child(['--import',preload,join(root,'status/done.mjs'),'--tag','research','--line','Finished locally'],plainEnv({NODE_OPTIONS:`--import=${pathToFileURL(preload).href}`}));assert.equal(r.code,0,r.output);assert.doesNotMatch(r.output,/radio|offline|recovery|connection|unreachable/i);
});
test('admitted invocation finishes nested gated effects and reporting after expiry; scope dies with the task',async t=>{
 const root=harness(t);const saved=read(root);copyStatusResources(root);save(root,saved);cpSync(new URL('../update/',import.meta.url),join(root,'update'),{recursive:true});
 const script=join(root,'task.mjs');writeFileSync(script,`import {checkWork} from './status/guard.mjs';import {reportSignal} from './status/report.mjs';import {writeFileSync} from 'node:fs';const p=await checkWork({root:process.cwd(),now:()=>new Date('${deadline}'),fetchImpl:async()=>{throw Error('offline');}});if(!p.allow)process.exit(3);writeFileSync('effect','finished');writeFileSync('old-scope',process.env.ORION_TASK_SCOPE);const r=await reportSignal({root:process.cwd(),signalType:'crm_updated',fetchImpl:async()=>{throw Error('offline');}});if(r.status!=='queued')process.exit(4);`);
 const code=await runWork({root,command:process.execPath,args:[script],now:at('2026-11-20T11:59:59.999Z'),fetchImpl:offline});assert.equal(code,0);assert.equal(readFileSync(join(root,'effect'),'utf8'),'finished');assert.equal(read(root).sharing.pairing.last_connected_at,time);
 assert.equal((await checkWork({root,now:at(deadline),fetchImpl:offline})).allow,false);
 const probe=`import {checkWork} from ${JSON.stringify(pathToFileURL(join(root,'status/guard.mjs')).href)};const p=await checkWork({root:${JSON.stringify(root)}});process.exit(p.allow?3:0);`;
 const r=await child(['--input-type=module','-e',probe],plainEnv({ORION_TASK_SCOPE:readFileSync(join(root,'old-scope'),'utf8')}));assert.equal(r.code,0,r.output);
});

test('live task scope does not conceal known credential refusal or disabled radio',async t=>{
 for(const kind of ['invalid','disabled','corrupt']) {
  const root=harness(t);const script=join(root,'stop.mjs');
  writeFileSync(script,`import {readFileSync,writeFileSync} from 'node:fs';import {checkWork} from ${JSON.stringify(new URL('../status/guard.mjs',import.meta.url).href)};const p='status/status.json';const s=JSON.parse(readFileSync(p));if('${kind}'==='disabled')s.sharing.status_signal_enabled=false;else if('${kind}'==='invalid'){s.sharing.pairing.last_check='invalid';s.sharing.pairing.last_connected_at=null;}else writeFileSync('status/radio-outbox.json','[{}]');writeFileSync(p,JSON.stringify(s));const permission=await checkWork({root:process.cwd(),now:()=>new Date('${time}')});process.exit(permission.allow?3:0);`);
  assert.equal(await runWork({root,command:process.execPath,args:[script],now:at(time),fetchImpl:online}),0);
 }
});
