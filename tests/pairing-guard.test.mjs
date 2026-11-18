import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const moduleUrl = new URL('../status/guard.mjs', import.meta.url);
const at = () => new Date('2026-11-18T12:00:00.000Z');
function harness(t, value = {}) {
 const root = mkdtempSync(join(tmpdir(), 'pairing-guard-')); mkdirSync(join(root,'status'));
 writeFileSync(join(root,'status/status.json'), JSON.stringify({ops_stage:'booked', sharing:{}, ...value}));
 t.after(() => rmSync(root,{recursive:true,force:true})); return root;
}
const status = root => JSON.parse(readFileSync(join(root,'status/status.json')));
test('new install pauses without a verified connection and does not acquire legacy grace', async t => {
 const root=harness(t); const {checkWork}=await import(moduleUrl);
 const result=await checkWork({root,now:at});
 assert.equal(result.allow,false); assert.equal(result.grace,false);
 assert.equal(status(root).sharing.pairing.migration_started_at,null);
});
const identity = '11111111-1111-1111-1111-111111111111';
const token = 'orion_' + '123456'.repeat(4);
const paired = () => ({status_signal_enabled:true, bridge_url:'https://example.test/api/bridge',harness_id:identity,install_token:token});
const accepted = async () => ({status:200,json:async()=>({status:'accepted',harness_id:identity})});
test('accepted ordinary credential is freshly verified without side effects on every invocation', async t => {
 const root=harness(t,{sharing:paired()}); const {checkWork}=await import(moduleUrl); const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return accepted();};
 assert.equal((await checkWork({root,now:at,fetchImpl})).allow,true);
 assert.equal((await checkWork({root,now:at,fetchImpl})).allow,true);
 assert.equal(calls.length,2); assert.equal(calls[0].url,'https://example.test/api/bridge/verify');
 assert.equal(calls[0].options.method,'GET'); assert.deepEqual(calls[0].options.headers,{Authorization:`Bearer ${token}`});
 assert.equal(status(root).sharing.pairing.last_check,'accepted');
});
test('malformed feature marker fails closed even with accepted credentials', async t => {
 const root=harness(t,{sharing:{...paired(),pairing:null}}); const {checkWork}=await import(moduleUrl);
 assert.equal((await checkWork({root,now:at,fetchImpl:accepted})).allow,false);
 assert.equal(status(root).sharing.pairing,null);
});
const marker = extra => ({version:1,state:'unpaired',verified_at:null,last_check:null,migration_started_at:null,migration_deadline_at:null,migration_satisfied_at:null,...extra});
test('existing 2.0 progress receives one durable 30-day clock and keeps declined choice',async t=>{
 const root=harness(t,{schema_version:'2.0.0',template_version:'2.0.0',checklist:{kb_business_context:true},sharing:{status_signal_enabled:false,radio_choice:'declined'}});
 const {checkWork}=await import(moduleUrl);
 assert.equal((await checkWork({root,now:at})).grace,true);
 const first=status(root); assert.equal(first.sharing.pairing.migration_started_at,'2026-11-18T12:00:00.000Z');
 assert.equal(first.sharing.pairing.migration_deadline_at,'2026-12-18T12:00:00.000Z');
 for(const [instant,allow] of [['2026-12-18T11:59:59.999Z',true],['2026-12-18T12:00:00.000Z',false],['2026-12-19T12:00:00.000Z',false]]) {
   const result=await checkWork({root,now:()=>new Date(instant)});assert.equal(result.allow,allow);
 }
 assert.deepEqual(status(root).sharing.pairing,first.sharing.pairing);
 assert.equal(status(root).sharing.radio_choice,'declined');
});
test('progress under the new marker never gains migration grace',async t=>{
 const root=harness(t,{started_at:'2026-11-17T12:00:00.000Z',sharing:{pairing:marker()}});
 const {checkWork}=await import(moduleUrl);assert.equal((await checkWork({root,now:at})).allow,false);
});
for(const timestamps of [
 {migration_started_at:'2026-11-18T12:00:00.000Z'},
 {migration_started_at:'yesterday',migration_deadline_at:'2026-12-18T12:00:00.000Z'},
 {migration_started_at:'2026-11-19T12:00:00.000Z',migration_deadline_at:'2026-12-19T12:00:00.000Z'},
 {migration_satisfied_at:'2026-11-19T12:00:00.000Z'},
 {migration_satisfied_at:'2026-11-18'},
]) test(`invalid migration requires recovery: ${JSON.stringify(timestamps)}`,async t=>{
 const root=harness(t,{sharing:{...paired(),pairing:marker(timestamps)}});const before=status(root);
 const {checkWork}=await import(moduleUrl); assert.equal((await checkWork({root,now:at,fetchImpl:accepted})).allow,false);
 assert.deepEqual(status(root),before);
});
test('overlong deadline is capped and earlier deadline is respected',async t=>{
 const {checkWork}=await import(moduleUrl);
 for(const [deadline,now,allow] of [['2027-12-18T12:00:00.000Z','2026-12-18T12:00:00.000Z',false],['2026-11-19T12:00:00.000Z','2026-11-19T12:00:00.000Z',false],['2026-11-17T12:00:00.000Z','2026-11-18T12:00:00.000Z',false]]) {
 const root=harness(t,{sharing:{pairing:marker({migration_started_at:'2026-11-18T12:00:00.000Z',migration_deadline_at:deadline})}});
 assert.equal((await checkWork({root,now:()=>new Date(now)})).allow,allow);
 }
});
test('legacy paired connection satisfies migration once; revocation and disablement do not restore grace',async t=>{
 const root=harness(t,{ops_stage:'formalised',sharing:paired()});const {checkWork}=await import(moduleUrl);
 assert.equal((await checkWork({root,now:at,fetchImpl:accepted})).allow,true);
 const first=status(root);assert.equal(first.sharing.pairing.migration_satisfied_at,at().toISOString());
 assert.equal((await checkWork({root,now:at,fetchImpl:async()=>({status:401})})).allow,false);
 assert.equal(status(root).sharing.pairing.verified_at,at().toISOString());
 const value=status(root);value.sharing.status_signal_enabled=false;writeFileSync(join(root,'status/status.json'),JSON.stringify(value));
 assert.equal((await checkWork({root,now:at,fetchImpl:accepted})).allow,false);
});
for(const [outcome,fetchImpl] of [
 ['invalid',async()=>({status:401})],['invalid',async()=>({status:200,json:async()=>({status:'accepted',harness_id:'other'})})],
 ['server_error',async()=>({status:503})],['server_error',async()=>({status:200,json:async()=>({})})],
 ['server_error',async()=>({status:200,json:async()=>{throw new Error('broken json')}})],
 ['unreachable',async()=>{throw new Error('do not print server secret')}],
]) test(`fresh verification distinguishes ${outcome}`,async t=>{
 const root=harness(t,{sharing:paired()}); const {checkWork}=await import(moduleUrl);
 const result=await checkWork({root,now:at,fetchImpl});assert.equal(result.allow,false);
 assert.equal(status(root).sharing.pairing.last_check,outcome); assert.doesNotMatch(result.reason,/server secret/);
});
test('pending reports block accepted new work even when replay is disabled',async t=>{
 const root=harness(t,{sharing:paired()});writeFileSync(join(root,'status/radio-outbox.json'),JSON.stringify([{kind:'signal',body:{signal_type:'crm_updated',occurred_at:at().toISOString(),payload:{}}}]));
 const {checkWork}=await import(moduleUrl);
 assert.equal((await checkWork({root,now:at,fetchImpl:accepted,replay:false})).allow,false);
 assert.equal(JSON.parse(readFileSync(join(root,'status/radio-outbox.json'))).length,1);
});
test('unreachable existing grace retains pending reports',async t=>{
 const root=harness(t,{started_at:'2026-11-17T00:00:00.000Z',sharing:paired()});writeFileSync(join(root,'status/radio-outbox.json'),'[]');
 const {checkWork}=await import(moduleUrl);const result=await checkWork({root,now:at,fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(result.allow,true);assert.equal(result.grace,true);
});
test('malformed pending report pauses even an existing grace harness',async t=>{
 const root=harness(t,{started_at:'2026-11-17T00:00:00.000Z'});writeFileSync(join(root,'status/radio-outbox.json'),'[{}]');
 const {checkWork}=await import(moduleUrl);assert.equal((await checkWork({root,now:at})).allow,false);
});
import { copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';
function run(args,env=plainEnv()) { return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env});let output=''; child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>resolve({code,output}));}); }
test('homed, environment and cloud-attached credentials use established precedence and require fresh acceptance',async t=>{
 const {checkWork}=await import(moduleUrl); const previous={ORION_INSTALL_TOKEN:process.env.ORION_INSTALL_TOKEN,ORION_CLOUD:process.env.ORION_CLOUD};
 t.after(()=>{for(const [key,value] of Object.entries(previous)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 for(const source of ['key-file','environment','attached']) {
 delete process.env.ORION_INSTALL_TOKEN;delete process.env.ORION_CLOUD;
 const root=harness(t,{home:{enabled:true},sharing:{...paired(),install_token:null}});
 if(source==='key-file')writeFileSync(join(root,'status/radio.key'),token);
 if(source==='environment'){process.env.ORION_INSTALL_TOKEN=token;writeFileSync(join(root,'status/radio.key'),'orion_' + 'another'.repeat(4));}
 if(source==='attached')process.env.ORION_CLOUD='1';
 let headers;const fetchImpl=async(url,options)=>{headers=options.headers;return accepted();};
 assert.equal((await checkWork({root,now:at,fetchImpl})).allow,true);
 assert.deepEqual(headers,source==='attached'?{}:{Authorization:`Bearer ${token}`});
 assert.equal((await checkWork({root,now:at,fetchImpl:async()=>({status:401})})).allow,false);
 }
});
test('CLI quiet suppresses accepted success but preserves actionable pauses and grace reminders',async t=>{
 const root=harness(t,{sharing:paired()});
 for(const name of ['guard.mjs','store.mjs','shapes.mjs']) copyFileSync(new URL(`../status/${name}`,import.meta.url),join(root,'status',name));
 const preload=join(root,'fetch.mjs');writeFileSync(preload,`globalThis.fetch=async()=>({status:200,json:async()=>({status:'accepted',harness_id:'${identity}'})});`);
 const command=['--import',preload,join(root,'status/guard.mjs'),'check','--quiet'];
 let result=await run(command);assert.equal(result.code,0);assert.equal(result.output,'');
 let value=status(root);value.sharing.status_signal_enabled=false;writeFileSync(join(root,'status/status.json'),JSON.stringify(value));
 result=await run(command);assert.equal(result.code,2);assert.match(result.output,/Run node start.mjs/);
 value={ops_stage:'formalised',sharing:{status_signal_enabled:false}};writeFileSync(join(root,'status/status.json'),JSON.stringify(value));
 result=await run(command);assert.equal(result.code,0);assert.match(result.output,/Pair Orion by/);
});
test('independent processes serialize fresh status edits and outbox appends without lost updates',async t=>{
 const root=harness(t,{count:0});const storeUrl=new URL('../status/store.mjs',import.meta.url).href;
 const script=`import {withStatusLock} from ${JSON.stringify(storeUrl)};await withStatusLock(process.argv[1],async store=>{const s=await store.readStatus();await new Promise(r=>setTimeout(r,20));s.count++;await store.writeStatus(s);const q=await store.readOutbox();q.push({kind:'asset',body:{slug:'test'}});await store.writeOutbox(q);});`;
 const results=await Promise.all(Array.from({length:8},()=>run(['--input-type=module','-e',script,root])));
 assert.ok(results.every(result=>result.code===0),JSON.stringify(results));assert.equal(status(root).count,8);
 assert.equal(JSON.parse(readFileSync(join(root,'status/radio-outbox.json'))).length,8);
});
test('corrupt status or outbox is preserved and cannot authorize work',async t=>{
 const {checkWork}=await import(moduleUrl);
 const root=harness(t,{sharing:paired()});writeFileSync(join(root,'status/status.json'),'{partial');
 assert.equal((await checkWork({root,now:at,fetchImpl:accepted})).allow,false);
 assert.equal(readFileSync(join(root,'status/status.json'),'utf8'),'{partial');
 const other=harness(t,{started_at:'2026-11-17T00:00:00.000Z'});writeFileSync(join(other,'status/radio-outbox.json'),'{partial');
 assert.equal((await checkWork({root:other,now:at})).allow,false);
 assert.equal(readFileSync(join(other,'status/radio-outbox.json'),'utf8'),'{partial');
});
test('interrupted process leaves durable state and pauses for lock recovery without resetting grace',async t=>{
 const root=harness(t);const storeUrl=new URL('../status/store.mjs',import.meta.url).href;
 const script=`import {withStatusLock} from ${JSON.stringify(storeUrl)};await withStatusLock(process.argv[1],async store=>{const s=await store.readStatus();s.sharing.pairing=${JSON.stringify(marker({migration_started_at:'2026-11-18T12:00:00.000Z',migration_deadline_at:'2026-12-18T12:00:00.000Z'}))};await store.writeStatus(s);console.log('saved');await new Promise(()=>{});});`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,root],{env:plainEnv()});
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`exited early ${code}`)));});
 const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
 const before=status(root);const {checkWork}=await import(moduleUrl);const result=await checkWork({root,now:at});
 assert.equal(result.allow,false);assert.match(result.reason,/lock/);assert.deepEqual(status(root),before);
});
test('impossible calendar date does not create a migration window',async t=>{
 const root=harness(t,{sharing:{pairing:marker({migration_started_at:'2026-02-30T12:00:00.000Z',migration_deadline_at:'2026-12-18T12:00:00.000Z'})}});
 const {checkWork}=await import(moduleUrl);assert.equal((await checkWork({root,now:()=>new Date('2026-03-03T12:00:00.000Z')})).allow,false);
});
