/** Pinned, manifest-driven update and restore for a deployed Orion harness. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, lstatSync, readdirSync, rmdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
function legacySchedules(root) {
  const dir = safe(root, 'status/shifts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => /^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(name)).map(file => {
    const path = safe(root, `status/shifts/${file}`);
    const name = file.slice(0, -5);
    let record;
    try { record = json(path); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    const active = record?.os === process.platform
      ? isOn(record, { uid: process.getuid?.() ?? 0 })
      : null;
    return { name, active };
  });
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
    const retired=(manifest.deployment.retired||[]).map(e=>({source:e.source,destination:e.destinations?.[tool]||e.destination,ownership:'release',fingerprint_key:e.sources?.[tool]||e.fingerprint_key||e.source}));
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
    report.legacy_schedules = legacySchedules(root);
    const running = report.legacy_schedules.filter(schedule => schedule.active);
    if (running.length) {
      const commands = running.map(({ name }) => `node status/schedule.mjs off --agent ${name}`).join('\n');
      throw new Error(`Turn off active legacy computer schedules before upgrading:\n${commands}\nThen see docs/scheduled-work.md in the release.`);
    }
    const archiveLegacy = (oldPath, archive) => {
      const src = safe(root, oldPath), dest = safe(root, archive);
      if (!lstatSync(src).isFile()) throw new Error(`Legacy file collision: ${oldPath}`);
      if (!existsSync(dest)) actions.push({kind:'add',e:{destination:archive},src,dest});
      else if (!lstatSync(dest).isFile() || fingerprint(readFileSync(dest)) !== fingerprint(readFileSync(src))) {
        throw new Error(`Legacy file collides with ${archive}`);
      }
      actions.push({kind:'retire',e:{destination:oldPath},dest:src});
    };
    const archives = new Map();
    const collectLegacy = (source, archive) => {
      const path = safe(root, source);
      if (!existsSync(path)) return;
      if (!lstatSync(path).isDirectory()) throw new Error(`Legacy directory collision: ${source}`);
      for (const item of readdirSync(path, { withFileTypes: true })) {
        const from = `${source}/${item.name}`, to = `${archive}/${item.name}`;
        if (item.isDirectory()) collectLegacy(from, to);
        else archives.set(from, to);
      }
    };
    collectLegacy('.claude/agents', 'legacy/claude-agents');
    const legacyHire = tool === 'codex' ? '.agents/skills/hire-agent' : '.claude/skills/hire-agent';
    collectLegacy(legacyHire, 'legacy/hire-agent');
    for (const e of [...retired,...commonRetired]) {
      const dest=safe(root,e.destination), state=destinationState(root,e,pristine);
      if (state==='owned') {
        actions.push({kind:'retire',e,dest});
        archives.delete(e.destination);
      } else if (state==='preserve'||state==='client-owned') {
        if (!archives.has(e.destination)) report.kept.push(e.destination);
      }
    }
    for (const [oldPath, archive] of archives) archiveLegacy(oldPath, archive);
    return applyActions({ root, statusPath, status, manifest, tool, commit, actions, report });
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

function stagedContext(root, snapshot) {
  const manifest=json(join(snapshot,'update/manifest.json'));
  const pristine=json(join(snapshot,'update/pristine.json'));
  const statusPath=safe(root,'status/status.json'), statusBytes=readFileSync(statusPath);
  const status=JSON.parse(statusBytes), statusHash=fingerprint(statusBytes);
  const tool=selectedTool(status,manifest.deployment);
  if (newer(status.template_version,manifest.template_version)) throw new Error('Refusing to roll back the harness version');
  const entries=new Map(planForTool(manifest.deployment,tool,{releaseRoot:snapshot,root}).map(e=>[e.destination,e]));
  const retired=new Map([
    ...(manifest.remove||[]).map(path=>[path,path]),
    ...(manifest.deployment.retired||[]).map(e=>[
      e.destinations?.[tool]||e.destination, e.sources?.[tool]||e.fingerprint_key||e.source,
    ]),
  ]);
  return {manifest,pristine,statusPath,status,statusHash,tool,entries,retired};
}

function currentFingerprint(root, path) {
  const dest=safe(root,path);
  if (!existsSync(dest)) return null;
  if (!lstatSync(dest).isFile()) throw new Error(`Destination is not a file: ${path}`);
  return fingerprint(readFileSync(dest));
}

function stagedInventory(root, repo, commit) {
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const {manifest,pristine,status,statusHash,tool,entries,retired}=stagedContext(root,snapshot);
    const files=[];
    for (const [path,e] of entries) {
      const before=currentFingerprint(root,path);
      const incoming=fingerprint(readFileSync(safe(snapshot,e.source)));
      const shipped=path==='update/pristine.json' || pristine.files?.[e.fingerprint_key]?.includes(before);
      if (before===incoming) continue;
      const action=before===null ? 'copy' : e.ownership==='client-template' ? 'keep' : shipped ? 'copy' : 'merge';
      files.push({path,before,action,source:e.source,fingerprint_key:e.fingerprint_key});
    }
    for (const [path,key] of retired) {
      if (entries.has(path)) continue;
      const before=currentFingerprint(root,path);
      if (before===null) continue;
      files.push({path,before,action:pristine.files?.[key]?.includes(before)?'retire':'keep'});
    }
    return {commit,status_hash:statusHash,from:status.template_version,to:manifest.template_version,
      previous_commit:status.template_commit || status.applied_release?.commit || null,selected_tool:tool,files};
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

// The prompt chooses and merges files. This operation only validates and commits its plan.
function applyStaged(root, repo, commit, stage) {
  if (!stage) throw new Error('--stage is required');
  recoverPendingUpdates(root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const {manifest,pristine,statusPath,status,statusHash,tool,entries,retired}=stagedContext(root,snapshot);
    const plan=json(safe(stage,'plan.json'));
    if (plan.commit!==commit || plan.status_hash!==statusHash) {
      throw new Error('The staged plan no longer matches the source or harness status');
    }
    const seen=new Set(), actions=[];
    for (const { path, before, retire } of plan.files) {
      if (seen.has(path) || path==='status/status.json') throw new Error(`Invalid staged destination: ${path}`);
      seen.add(path);
      const dest=safe(root,path);
      const current=currentFingerprint(root,path);
      if (current!==before) throw new Error(`Destination changed since staging: ${path}`);
      if (retire) {
        const key=retired.get(path);
        if (!key || entries.has(path) || !pristine.files?.[key]?.includes(current)) {
          throw new Error(`Cannot retire a client file: ${path}`);
        }
        actions.push({kind:'retire',e:{destination:path},dest});
        continue;
      }
      const e=entries.get(path);
      if (!e || (current!==null && e.ownership==='client-template')) throw new Error(`Cannot update a client file: ${path}`);
      const src=safe(stage,`files/${path}`);
      if (!lstatSync(src).isFile()) throw new Error(`Staged destination is not a file: ${path}`);
      if (path.endsWith('.mjs')) {
        const check=spawnSync(process.execPath,['--check',src],{encoding:'utf8'});
        if (check.status!==0) throw new Error(`Invalid staged script ${path}: ${check.stderr}`);
      }
      if (current!==fingerprint(readFileSync(src))) actions.push({kind:current===null?'add':'replace',e,src,dest});
    }
    const legacy_schedules=legacySchedules(root);
    const running=legacy_schedules.filter(schedule=>schedule.active);
    if (running.length) throw new Error(`Turn off active legacy computer schedules before upgrading: ${running.map(({name})=>name).join(', ')}. See docs/scheduled-work.md.`);
    if (!actions.length && status.template_commit===commit) return {commit,version:status.template_version,unchanged:true};
    const report={from:status.template_version,to:manifest.template_version,commit,selected_tool:tool,refreshed:[],added:[],retired:[],legacy_schedules};
    return applyActions({root,statusPath,status,manifest,tool,commit,actions,report,recordSource:true});
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

function applyActions({root,statusPath,status,manifest,tool,commit,actions,report,recordSource=false}) {
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backupRel=`.update-backup/${status.template_version}-${stamp}`;
  const backup=safe(root,backupRel); if(existsSync(backup)) throw new Error('Backup already exists');
  mkdirSync(backup,{recursive:true,mode:0o700}); copyTo(statusPath,join(backup,'status/status.json'));
  const journal={kind:'update',state:'pending',from:status.template_version,to:manifest.template_version,commit,selected_tool:tool,
    actions:actions.map(a=>({kind:a.kind,destination:a.e.destination,installed_hash:a.kind==='retire'?null:fingerprint(readFileSync(a.src)),prior_hash:a.kind==='add'?null:fingerprint(readFileSync(a.dest))})),
    remove_status_checklist_keys:manifest.remove_status_checklist_keys||[]};
  for(const key of journal.remove_status_checklist_keys) delete status.checklist?.[key];
  status.template_version=manifest.template_version;
  if (recordSource) {
    status.template_commit=commit;
    journal.record_template_commit=true;
  }
  status.notes=[status.notes||'',`updated to ${manifest.template_version}; backup in ${backupRel}`].filter(Boolean).join('\n');
  const nextStatus=JSON.stringify(status,null,2)+'\n';
  journal.status_installed_hash=fingerprint(nextStatus);
  // All existing targets are backed up before the first write or removal.
  for (const a of actions) if(a.kind!=='add') copyTo(a.dest,join(backup,'files',a.e.destination));
  for (const a of actions) if(a.kind!=='retire') copyTo(a.src,join(backup,'stage',a.e.destination));
  mkdirSync(join(backup,'stage/status'),{recursive:true});
  writeFileSync(join(backup,'stage/status/status.json'),nextStatus,{mode:lstatSync(statusPath).mode & 0o777});
  writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
  try {
    let count=0;
    for (const a of actions) {
      if(a.kind==='retire') {rmSync(a.dest);report.retired.push(a.e.destination);}
      else {mkdirSync(dirname(a.dest),{recursive:true});renameSync(join(backup,'stage',a.e.destination),a.dest);report[a.kind==='add'?'added':'refreshed'].push(a.e.destination);}
      if(process.env.ORION_UPDATE_FAIL_AFTER && ++count===Number(process.env.ORION_UPDATE_FAIL_AFTER)) throw new Error('Injected update interruption');
    }
    for (const path of report.retired.filter(path => path.startsWith('library/'))) {
      let parent = dirname(path);
      while (parent !== '.') {
        const directory = safe(root, parent);
        if (existsSync(directory)) {
          if (readdirSync(directory).length > 0) break;
          rmdirSync(directory);
        }
        parent = dirname(parent);
      }
    }
    renameSync(join(backup,'stage/status/status.json'),statusPath);
    journal.state='complete';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
  } catch(error) {
    rollbackUpdate(root,backup,journal);
    journal.state='recovered';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    throw error;
  }
  return {...report,backup:backupRel};
}

// A switch moves the active skill layout. Historical job files stay in place.
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
          if(oldRoot===oldSkill && rel.split('/')[0].startsWith('speckit-')) {
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
    portable(oldSkill,newSkill);
    for (const schedule of legacySchedules(root)) {
      if (schedule.active) throw new Error(`Schedule ${schedule.name} is active; run node status/schedule.mjs off --agent ${schedule.name} first`);
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
      pruneEmpty(safe(root,oldSkill));
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
  if(journal.kind==='published-update') throw new Error('Use the documented published recovery procedure for this backup.');
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
      const current=currentFingerprint(root,a.destination);
      if(current!==a.installed_hash) {kept.push(a.destination);continue;}
      copyTo(prior,dest);restored.push(a.destination);
    }
  }
  for(const key of journal.remove_status_checklist_keys) if(Object.hasOwn(old.checklist||{},key)) {status.checklist ||= {};status.checklist[key]=old.checklist[key];}
  status.template_version=old.template_version;
  if (journal.record_template_commit) {
    if (Object.hasOwn(old,'template_commit')) status.template_commit=old.template_commit;
    else delete status.template_commit;
  }
  status.notes=[status.notes||'',`restored from ${backupRel}`].filter(Boolean).join('\n');
  writeFileSync(statusPath,JSON.stringify(status,null,2)+'\n');
  return {restored,kept,backup:backupRel};
}
try {
  const command=process.argv[2], root=arg('--root'); if(!root) throw new Error('--root is required');
  const repo=arg('--release-repo')||dirname(dirname(fileURLToPath(import.meta.url)));
  if (command === 'update-published' || command === 'recover-published') {
    const { createReleaseClient } = await import('./published-release.mjs');
    const { applyPublishedUpdate, recoverPublishedUpdate } = await import('./published-transaction.mjs');
    const checkout = dirname(dirname(fileURLToPath(import.meta.url)));
    const tag = arg('--tag');
    const options = {
      root, checkout,
      migrateTo: arg('--migrate-to'), stagedPairing: arg('--staged-pairing') || arg('--migration-pairing'),
      reviewDir: arg('--resolve-required'),
      client: createReleaseClient({
        repository: arg('--repository'), apiBase: arg('--api-base'), sourceUrl: arg('--source-url'),
      }),
      pin: { tag, commit: arg('--commit'), release_id: Number(arg('--release-id')), manifest_version: tag?.slice(1) },
    };
    const result = command === 'recover-published'
      ? await recoverPublishedUpdate({ ...options, backupRel: arg('--backup') })
      : await applyPublishedUpdate(options);
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'inspect') {
    console.log(JSON.stringify(stagedInventory(root,repo,arg('--commit')),null,2));
  } else {
    const { assertPublishedUpdateNotBlocked, withUpdateLock } = await import('./published-transaction.mjs');
    const result = await withUpdateLock(root, () => {
      assertPublishedUpdateNotBlocked(root, { includePending: true });
      switch (command) {
        case 'update': return update(root, repo, arg('--commit'));
        case 'apply-staged': return applyStaged(root,repo,arg('--commit'),arg('--stage'));
        case 'switch': return switchTool(root, repo, arg('--commit'), arg('--to'), arg('--legacy-tool'));
        case 'restore': return restore(root, arg('--backup'));
        case 'recover': return { recovered: [...recoverPendingUpdates(root), ...recoverPendingSwitches(root)] };
        default: throw new Error('Use inspect, apply-staged, update, switch, restore or recover');
      }
    });
    console.log(JSON.stringify(result,null,2));
  }
} catch(error) {console.error(error.message);process.exitCode=2;}
