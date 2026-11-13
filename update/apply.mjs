/** Pinned, manifest-driven update and restore for a deployed Orion harness. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, lstatSync, readdirSync, rmdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationState, fingerprint, planForTool, selectedTool, safePath } from './destination-resolver.mjs';
import { isOn } from '../status/schedule.mjs';

const arg = name => { const i=process.argv.indexOf(name); return i<0 ? undefined : process.argv[i+1]; };
const json = path => JSON.parse(readFileSync(path,'utf8'));
const safe = safePath;
const copyTo = (from,to) => { mkdirSync(dirname(to),{recursive:true}); copyFileSync(from,to); };
const versionParts = version => String(version).split('.').map(Number);
const newer = (a,b) => { const x=versionParts(a),y=versionParts(b); for(let i=0;i<3;i++) {if((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0);} return false; };
function sourceSnapshot(repo, commit) {
  if (!/^[0-9a-f]{40,64}$/.test(commit||'')) throw new Error('A full pinned commit hash is required');
  const head=execFileSync('git',['rev-parse',`${commit}^{commit}`],{cwd:repo,encoding:'utf8'}).trim();
  if (head!==commit) throw new Error('Commit must resolve exactly');
  const dir=mkdtempSync(join(tmpdir(),'orion-pinned-release-'));
  const archive=execFileSync('git',['archive',commit],{cwd:repo,maxBuffer:1<<28});
  execFileSync('tar',['-xf','-','-C',dir],{input:archive});
  return dir;
}
function update(root,repo,commit) {
  recoverPendingUpdates(root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const manifest=json(join(snapshot,'update/manifest.json'));
    const pristine=json(join(snapshot,'update/pristine.json'));
    const statusPath=safe(root,'status/status.json'), status=json(statusPath);
    const tool=selectedTool(status,manifest.deployment);
    if (newer(status.template_version,manifest.template_version)) throw new Error('Refusing to roll back the harness version');
    const plan=planForTool(manifest.deployment,tool,{releaseRoot:snapshot,root});
    const retired=(manifest.deployment.retired||[]).map(e=>({source:e.source,destination:e.destinations?.[tool]||e.destination,ownership:'release',fingerprint_key:e.fingerprint_key||e.source}));
    const commonRetired=(manifest.remove||[]).map(path=>({source:path,destination:path,ownership:'release',fingerprint_key:path}));
    const actions=[], report={from:status.template_version,to:manifest.template_version,commit,selected_tool:tool,refreshed:[],added:[],retired:[],kept:[],collisions:[]};
    for (const e of plan) {
      const dest=safe(root,e.destination), state=destinationState(root,e,pristine);
      if (state==='client-owned') {report.collisions.push(e.destination);continue;}
      if (state==='preserve' && !/^status\/[^/]+\.mjs$/.test(e.destination)) {report.kept.push(e.destination);continue;}
      if (state==='preserve') report.replaced_edited_scripts=(report.replaced_edited_scripts||[]).concat(e.destination);
      const src=safe(snapshot,e.source);
      if (e.destination.endsWith('.mjs')) { const check=spawnSync(process.execPath,['--check',src],{encoding:'utf8'}); if(check.status!==0) throw new Error(`Invalid script ${e.source}: ${check.stderr}`); }
      if (state==='absent') actions.push({kind:'add',e,src,dest});
      else if (fingerprint(readFileSync(dest))!==fingerprint(readFileSync(src))) actions.push({kind:'replace',e,src,dest});
    }
    // A Codex harness deployed by the earlier preview may still hold client
    // jobs in team/. Promote only Markdown job sheets to agents/ on update.
    if (tool==='codex' && existsSync(safe(root,'team'))) {
      const oldJobs=safe(root,'team');
      if (!lstatSync(oldJobs).isDirectory()) throw new Error('Legacy team/ is not a directory');
      for (const name of readdirSync(oldJobs).filter(n=>/^[A-Za-z0-9][A-Za-z0-9_-]*\.md$/.test(n))) {
        const oldRel=`team/${name}`, nextRel=`agents/${name}`;
        const src=safe(root,oldRel), dest=safe(root,nextRel);
        if (!lstatSync(src).isFile()) throw new Error(`Legacy job sheet collision: ${oldRel}`);
        if (existsSync(dest)) {
          if (!lstatSync(dest).isFile() || fingerprint(readFileSync(dest))!==fingerprint(readFileSync(src))) report.collisions.push(nextRel);
          continue;
        }
        const existing=actions.find(a=>a.e.destination===nextRel);
        if (existing) existing.src=src;
        else actions.push({kind:'add',e:{source:oldRel,destination:nextRel,ownership:'client-template',fingerprint_key:'agents/README.md'},src,dest});
      }
    }
    for (const e of [...retired,...commonRetired]) {
      const dest=safe(root,e.destination), state=destinationState(root,e,pristine);
      if (state==='owned') actions.push({kind:'retire',e,dest});
      else if (state==='preserve'||state==='client-owned') report.kept.push(e.destination);
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const backupRel=`.update-backup/${status.template_version}-${stamp}`;
    const backup=safe(root,backupRel); if(existsSync(backup)) throw new Error('Backup already exists');
    mkdirSync(backup,{recursive:true}); copyTo(statusPath,join(backup,'status/status.json'));
    const journal={kind:'update',state:'pending',from:status.template_version,to:manifest.template_version,commit,selected_tool:tool,
      actions:actions.map(a=>({kind:a.kind,destination:a.e.destination,installed_hash:a.kind==='retire'?null:fingerprint(readFileSync(a.src)),prior_hash:a.kind==='add'?null:fingerprint(readFileSync(a.dest))})),
      remove_status_checklist_keys:manifest.remove_status_checklist_keys||[]};
    for(const key of journal.remove_status_checklist_keys) delete status.checklist?.[key];
    status.template_version=manifest.template_version;
    status.notes=[status.notes||'',`updated to ${manifest.template_version}; backup in ${backupRel}`].filter(Boolean).join('\n');
    const nextStatus=JSON.stringify(status,null,2)+'\n';
    journal.status_installed_hash=fingerprint(nextStatus);
    // All existing targets are backed up before the first write or removal.
    for (const a of actions) if(a.kind!=='add') copyTo(a.dest,join(backup,'files',a.e.destination));
    for (const a of actions) if(a.kind!=='retire') copyTo(a.src,join(backup,'stage',a.e.destination));
    mkdirSync(join(backup,'stage/status'),{recursive:true});
    writeFileSync(join(backup,'stage/status/status.json'),nextStatus);
    writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    try {
      let count=0;
      for (const a of actions) {
        if(a.kind==='retire') {rmSync(a.dest);report.retired.push(a.e.destination);}
        else {mkdirSync(dirname(a.dest),{recursive:true});renameSync(join(backup,'stage',a.e.destination),a.dest);report[a.kind==='add'?'added':'refreshed'].push(a.e.destination);}
        if(process.env.ORION_UPDATE_FAIL_AFTER && ++count===Number(process.env.ORION_UPDATE_FAIL_AFTER)) throw new Error('Injected update interruption');
      }
      renameSync(join(backup,'stage/status/status.json'),statusPath);
      journal.state='complete';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    } catch(error) {
      rollbackUpdate(root,backup,journal);
      journal.state='recovered';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
      throw error;
    }
    return {...report,backup:backupRel};
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

// A switch moves only release-owned files out of the old layout. Personal
// skills, job sheets and the roster are copied across, then left in place.
function switchTool(root,repo,commit,to,legacyTool) {
  recoverPendingSwitches(root);
  recoverPendingUpdates(root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const manifest=json(join(snapshot,'update/manifest.json'));
    const pristine=json(join(snapshot,'update/pristine.json'));
    const deployment=manifest.deployment;
    const statusPath=safe(root,'status/status.json'), status=json(statusPath);
    const from=selectedTool(status,deployment,{legacyTool});
    if (status.template_version !== manifest.template_version ||
        !existsSync(safe(root,'update/manifest.json')) ||
        fingerprint(readFileSync(safe(root,'update/manifest.json'))) !== fingerprint(readFileSync(safe(snapshot,'update/manifest.json')))) {
      throw new Error(`Update this harness to pinned release ${manifest.template_version} before switching tools`);
    }
    for(const path of deployment.common_sources.filter(p=>/^status\/[^/]+\.mjs$/.test(p) || /^update\/(manifest\.json|apply\.mjs|destination-resolver\.mjs|release-contract\.mjs)$/.test(p))) {
      const installed=safe(root,path), released=safe(snapshot,path);
      if(!existsSync(installed) || fingerprint(readFileSync(installed))!==fingerprint(readFileSync(released))) {
        throw new Error(`Update this harness to the pinned release before switching: ${path}`);
      }
    }
    if (!deployment.tools.includes(to) || to===from) throw new Error(`Choose the other supported tool (current: ${from})`);
    const sourcePlan=planForTool(deployment,from,{releaseRoot:snapshot,root});
    const targetPlan=planForTool(deployment,to,{releaseRoot:snapshot,root});
    const actions=[], retire=[], invalidated=[];
    const targetPaths=new Set();
    const add=(destination,source,kind='copy') => {
      safe(root,destination);
      if (targetPaths.has(destination)) throw new Error(`Duplicate switch destination: ${destination}`);
      targetPaths.add(destination);
      if (existsSync(safe(root,destination))) throw new Error(`Target collision: ${destination}`);
      if (!lstatSync(source).isFile()) throw new Error(`Not a regular source file: ${source}`);
      actions.push({kind,destination,source});
    };
    for (const entry of deployment.entries) {
      const old=sourcePlan.find(e=>e.destination===entry.destinations[from]), next=targetPlan.find(e=>e.destination===entry.destinations[to]);
      const oldPath=safe(root,old.destination);
      const state=destinationState(root,old,pristine);
      if (old.destination===next.destination) {
        if (old.source!==next.source && entry.ownership==='release') {
          if (state==='absent') add(next.destination,safe(snapshot,next.source));
          else if (state==='owned') {
            targetPaths.add(next.destination);
            actions.push({kind:'replace',destination:next.destination,source:safe(snapshot,next.source)});
          }
        }
        continue;
      }
      if (state==='preserve' && existsSync(oldPath) && lstatSync(oldPath).isSymbolicLink()) throw new Error(`Source symlink collision: ${old.destination}`);
      if (state==='absent') {
        if (entry.ownership==='release') add(next.destination,safe(snapshot,entry.source));
        continue;
      }
      if (state==='owned') add(next.destination,safe(snapshot,entry.source));
      else if (lstatSync(oldPath).isFile()) add(next.destination,oldPath);
      else throw new Error(`Source collision: ${old.destination}`);
      retire.push(old.destination);
    }
    const portable=(oldRoot,newRoot) => {
      const base=safe(root,oldRoot);
      if (!existsSync(base)) return;
      const walk=(dir,prefix='') => {
        for(const item of readdirSync(dir,{withFileTypes:true})) {
          const rel=prefix?`${prefix}/${item.name}`:item.name, path=join(dir,item.name);
          if(oldRoot===oldSkill && rel.split('/')[0].startsWith('speckit')) {
            if(item.isDirectory()) walk(path,rel);
            else if(item.isFile()) retire.push(`${oldRoot}/${rel}`);
            else throw new Error(`Source symlink or special file: ${oldRoot}/${rel}`);
            continue;
          }
          if(item.isDirectory()) walk(path,rel);
          else if(item.isFile()) {
            const destination=`${newRoot}/${rel}`;
            if(!targetPaths.has(destination)) add(destination,path);
            retire.push(`${oldRoot}/${rel}`);
          } else throw new Error(`Source symlink or special file: ${oldRoot}/${rel}`);
        }
      };
      walk(base);
    };
    const oldSkill=from==='codex'?'.agents/skills':'.claude/skills';
    const newSkill=to==='codex'?'.agents/skills':'.claude/skills';
    const oldJobs=dirname(sourcePlan.find(e=>e.source==='agents/README.md').destination);
    const newJobs=dirname(targetPlan.find(e=>e.source==='agents/README.md').destination);
    portable(oldSkill,newSkill);portable(oldJobs,newJobs);
    const shifts=safe(root,'status/shifts');
    if(existsSync(shifts)) for(const name of readdirSync(shifts).filter(n=>n.endsWith('.json'))) {
      const recordPath=join(shifts,name), record=json(recordPath);
      if(record.os===process.platform) {
        // An active system schedule could fire while its files are being moved.
        if(isOn(record,{uid:process.getuid?.()??0})) throw new Error(`Schedule ${name} is active; run status/schedule.mjs off --agent ${name.slice(0,-5)} first`);
      }
      invalidated.push(name.slice(0,-5));
      retire.push(`status/shifts/${name}`);
      for(const path of [record.wake_up,record.plist].filter(Boolean)) {
        const rel=relative(root,path).split(sep).join('/');
        if(!rel.startsWith('status/shifts/')) throw new Error(`Schedule path outside status/shifts: ${path}`);
        const saved=safe(root,rel);
        if(existsSync(saved)) {
          if(!lstatSync(saved).isFile()) throw new Error(`Schedule file collision: ${rel}`);
          retire.push(rel);
        }
      }
    }
    // Stage expected bytes and all backups before touching the deployed tree.
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const backupRel=`.update-backup/switch-${from}-to-${to}-${stamp}`;
    const backup=safe(root,backupRel);if(existsSync(backup)) throw new Error('Backup already exists');
    mkdirSync(backup,{recursive:true});copyTo(statusPath,join(backup,'status/status.json'));
    for(const a of actions) {
      if(a.kind==='replace') copyTo(safe(root,a.destination),join(backup,'files',a.destination));
      copyTo(a.source,join(backup,'stage',a.destination));
    }
    const retired=[...new Set(retire)];
    for(const destination of retired) copyTo(safe(root,destination),join(backup,'files',destination));
    const journal={kind:'switch',state:'pending',from,to,actions:actions.map(a=>({destination:a.destination,kind:a.kind||'copy',hash:fingerprint(readFileSync(join(backup,'stage',a.destination))),prior_hash:a.kind==='replace'?fingerprint(readFileSync(join(backup,'files',a.destination))):null})),retire:retired,invalidated};
    writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    try {
      let count=0;
      for(const a of journal.actions) {
        const staged=join(backup,'stage',a.destination), dest=safe(root,a.destination);
        copyTo(staged,dest);
        if(fingerprint(readFileSync(dest))!==a.hash) throw new Error(`Validation failed: ${a.destination}`);
        if(process.env.ORION_SWITCH_FAIL_AFTER && ++count===Number(process.env.ORION_SWITCH_FAIL_AFTER)) throw new Error('Injected switch interruption');
      }
      for(const destination of retired) rmSync(safe(root,destination));
      for(const layout of [oldSkill,oldJobs]) pruneEmpty(safe(root,layout));
      pruneEmpty(safe(root,from==='codex'?'.agents':'.claude'));
      status.selected_tool=to;
      status.notes=[status.notes||'',`switched from ${from} to ${to}; backup in ${backupRel}`].filter(Boolean).join('\n');
      writeFileSync(statusPath,JSON.stringify(status,null,2)+'\n');
      journal.state='complete';
      writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
      return {from,to,backup:backupRel,installed:journal.actions.map(a=>a.destination),retired,invalidated_schedules:invalidated};
    } catch(error) {
      rollbackSwitch(root,backup,journal);
      journal.state='recovered';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
      throw error;
    }
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

function pruneEmpty(path) {
  if(!existsSync(path) || !lstatSync(path).isDirectory()) return;
  for(const item of readdirSync(path)) pruneEmpty(join(path,item));
  if(readdirSync(path).length===0) rmdirSync(path);
}

function recoverPendingSwitches(root) {
  const backups=safe(root,'.update-backup');
  if(!existsSync(backups)) return [];
  const recovered=[];
  for(const name of readdirSync(backups).filter(n=>n.startsWith('switch-'))) {
    const backup=safe(root,`.update-backup/${name}`), path=join(backup,'journal.json');
    if(!existsSync(path)) continue;
    const journal=json(path);
    if(journal.kind==='switch' && journal.state==='pending') {
      rollbackSwitch(root,backup,journal);
      journal.state='recovered';writeFileSync(path,JSON.stringify(journal,null,2));
      recovered.push(name);
    }
  }
  return recovered;
}

function rollbackUpdate(root,backup,journal) {
  const statusPath=safe(root,'status/status.json');
  const statusHash=fingerprint(readFileSync(statusPath));
  const oldStatusHash=fingerprint(readFileSync(join(backup,'status/status.json')));
  if(statusHash!==oldStatusHash && statusHash!==journal.status_installed_hash) throw new Error('Update recovery collision: status/status.json');
  const conflicts=journal.actions.filter(a=>{
    const dest=safe(root,a.destination);
    if(!existsSync(dest)) return a.kind==='replace';
    if(!lstatSync(dest).isFile()) return true;
    const current=fingerprint(readFileSync(dest));
    return current!==a.prior_hash && current!==a.installed_hash;
  }).map(a=>a.destination);
  if(conflicts.length) throw new Error(`Update recovery collisions: ${conflicts.join(', ')}`);
  for(const a of [...journal.actions].reverse()) {
    const dest=safe(root,a.destination);
    if(a.kind==='add') {if(existsSync(dest)) rmSync(dest);}
    else copyTo(join(backup,'files',a.destination),dest);
  }
  copyTo(join(backup,'status/status.json'),safe(root,'status/status.json'));
  const stage=join(backup,'stage');if(existsSync(stage)) rmSync(stage,{recursive:true,force:true});
}

function recoverPendingUpdates(root) {
  const backups=safe(root,'.update-backup');if(!existsSync(backups)) return [];
  const recovered=[];
  for(const name of readdirSync(backups)) {
    const backup=safe(root,`.update-backup/${name}`), path=join(backup,'journal.json');
    if(!existsSync(path)) continue;
    const journal=json(path);
    if(journal.kind==='update' && journal.state==='pending') {
      rollbackUpdate(root,backup,journal);
      journal.state='recovered';writeFileSync(path,JSON.stringify(journal,null,2));recovered.push(name);
    }
  }
  return recovered;
}

function rollbackSwitch(root,backup,journal) {
  const conflicts=journal.actions.filter(a=>{
    const path=safe(root,a.destination);
    return existsSync(path) && (!lstatSync(path).isFile() || ![a.hash,a.prior_hash].includes(fingerprint(readFileSync(path))));
  }).map(a=>a.destination);
  if(conflicts.length) throw new Error(`Switch recovery collisions: ${conflicts.join(', ')}`);
  for(const action of [...journal.actions].reverse()) {
    const path=safe(root,action.destination);
    if(action.kind==='replace') copyTo(join(backup,'files',action.destination),path);
    else if(existsSync(path)) rmSync(path);
  }
  for(const destination of journal.retire) {
    const old=join(backup,'files',destination);
    if(existsSync(old)) copyTo(old,safe(root,destination));
  }
  copyTo(join(backup,'status/status.json'),safe(root,'status/status.json'));
}
function restore(root,backupRel) {
  const backup=safe(root,backupRel); const journal=json(join(backup,'journal.json'));
  if(journal.kind==='switch') {
    if(journal.state!=='complete') throw new Error(`Switch backup is ${journal.state}; only completed switches can be restored`);
    const conflicts=journal.actions.filter(a=>{
      const dest=safe(root,a.destination);
      return existsSync(dest) && fingerprint(readFileSync(dest))!==a.hash;
    }).map(a=>a.destination);
    if(conflicts.length) throw new Error(`Restore collisions: ${conflicts.join(', ')}`);
    rollbackSwitch(root,backup,journal);
    journal.state='restored';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    return {restored:journal.retire,removed:journal.actions.map(a=>a.destination),backup:backupRel};
  }
  if(journal.state!=='complete') throw new Error(`Update backup is ${journal.state}; only completed updates can be restored`);
  const statusPath=safe(root,'status/status.json'), status=json(statusPath), old=json(join(backup,'status/status.json'));
  const restored=[],kept=[];
  for(const a of [...journal.actions].reverse()) {
    const dest=safe(root,a.destination), prior=join(backup,'files',a.destination);
    if(a.kind==='add') {
      if(!existsSync(dest)) continue;
      if(fingerprint(readFileSync(dest))!==a.installed_hash) {kept.push(a.destination);continue;}
      rmSync(dest);restored.push(a.destination);
    } else {
      if(existsSync(dest) && a.installed_hash && fingerprint(readFileSync(dest))!==a.installed_hash) {kept.push(a.destination);continue;}
      copyTo(prior,dest);restored.push(a.destination);
    }
  }
  for(const key of journal.remove_status_checklist_keys) if(Object.hasOwn(old.checklist||{},key)) {status.checklist ||= {};status.checklist[key]=old.checklist[key];}
  status.template_version=old.template_version;
  status.notes=[status.notes||'',`restored from ${backupRel}`].filter(Boolean).join('\n');
  writeFileSync(statusPath,JSON.stringify(status,null,2)+'\n');
  return {restored,kept,backup:backupRel};
}
try {
  const command=process.argv[2], root=arg('--root'); if(!root) throw new Error('--root is required');
  const repo=arg('--release-repo')||dirname(dirname(fileURLToPath(import.meta.url)));
  const result=command==='update' ? update(root,repo,arg('--commit')) : command==='switch' ? switchTool(root,repo,arg('--commit'),arg('--to'),arg('--legacy-tool')) : command==='restore' ? restore(root,arg('--backup')) : command==='recover' ? {recovered:[...recoverPendingUpdates(root),...recoverPendingSwitches(root)]} : (()=>{throw new Error('Use update, switch, restore or recover');})();
  console.log(JSON.stringify(result,null,2));
} catch(error) {console.error(error.message);process.exitCode=2;}
