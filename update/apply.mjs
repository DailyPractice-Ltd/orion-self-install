/** Pinned, manifest-driven update and restore for a deployed Orion harness. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, lstatSync, readdirSync, rmdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationState, fingerprint, planForTool, resolveAiAssistant, safePath } from './destination-resolver.mjs';
import { withStatusLock } from '../status/store.mjs';

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
  // Select top-level paths by name so the snapshot never loads human-only records.
  const paths = execFileSync('git', ['ls-tree', '--name-only', '-z', commit], {cwd:repo,encoding:'utf8'})
    .split('\0').filter(path => path && path !== 'specs' && path !== '.specify');
  if (!paths.length) throw new Error('Release has no permitted source paths');
  const archive=execFileSync('git',['archive',commit,'--',...paths],{cwd:repo,maxBuffer:1<<28});
  const dir=mkdtempSync(join(tmpdir(),'orion-pinned-release-'));
  execFileSync('tar',['-xf','-','-C',dir],{input:archive});
  return dir;
}

async function update(store,root,repo,commit) {
  await recoverPendingUpdates(store,root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const manifest=json(join(snapshot,'update/manifest.json'));
    const pristine=json(join(snapshot,'update/pristine.json'));
    const statusPath=safe(root,'status/status.json'), status=json(statusPath);
    const ai_assistant=resolveAiAssistant(status,manifest.deployment);
    if (newer(status.template_version,manifest.template_version)) throw new Error('Refusing to roll back the harness version');
    const plan=planForTool(manifest.deployment,ai_assistant,{releaseRoot:snapshot,root});
    const retired=(manifest.deployment.retired||[]).map(e=>({source:e.source,destination:e.destinations?.[ai_assistant]||e.destination,ownership:'release',fingerprint_key:e.sources?.[ai_assistant]||e.fingerprint_key||e.source}));
    const commonRetired=(manifest.remove||[]).map(path=>({source:path,destination:path,ownership:'release',fingerprint_key:path}));
    const actions=[], report={from:status.template_version,to:manifest.template_version,commit,ai_assistant,refreshed:[],added:[],retired:[],kept:[],collisions:[]};
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
    const legacyHire = ai_assistant === 'codex' ? '.agents/skills/hire-agent' : '.claude/skills/hire-agent';
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
    const checklistKeys = manifest.remove_status_checklist_keys || [];
    const hasRetiredChecklistKeys = checklistKeys.some(key => Object.hasOwn(status.checklist || {}, key));
    if (status.template_version === manifest.template_version && !actions.length && !hasRetiredChecklistKeys) {
      return { ...report, up_to_date: true };
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const backupRel=`.update-backup/${status.template_version}-${stamp}`;
    const backup=safe(root,backupRel); if(existsSync(backup)) throw new Error('Backup already exists');
    mkdirSync(backup,{recursive:true}); copyTo(statusPath,join(backup,'status/status.json'));
    const journal={kind:'update',state:'pending',from:status.template_version,to:manifest.template_version,commit,ai_assistant,
      actions:actions.map(a=>({kind:a.kind,destination:a.e.destination,installed_hash:a.kind==='retire'?null:fingerprint(readFileSync(a.src)),prior_hash:a.kind==='add'?null:fingerprint(readFileSync(a.dest))})),
      remove_status_checklist_keys:checklistKeys};
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
      await store.writeStatusText(readFileSync(join(backup,'stage/status/status.json'),'utf8'));
      rmSync(join(backup,'stage/status/status.json'));
      journal.state='complete';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    } catch(error) {
      await rollbackUpdate(store,root,backup,journal);
      journal.state='recovered';writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
      throw error;
    }
    return {...report,backup:backupRel};
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

async function rollbackUpdate(store,root,backup,journal) {
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
  await store.writeStatusText(readFileSync(join(backup,'status/status.json'),'utf8'));
  const stage=join(backup,'stage');if(existsSync(stage)) rmSync(stage,{recursive:true,force:true});
}

async function recoverPendingUpdates(store,root) {
  const backups=safe(root,'.update-backup');if(!existsSync(backups)) return [];
  const recovered=[];
  for(const name of readdirSync(backups)) {
    const backup=safe(root,`.update-backup/${name}`), path=join(backup,'journal.json');
    if(!existsSync(path)) continue;
    const journal=json(path);
    if(journal.kind==='update' && journal.state==='pending') {
      await rollbackUpdate(store,root,backup,journal);
      journal.state='recovered';writeFileSync(path,JSON.stringify(journal,null,2));recovered.push(name);
    }
  }
  return recovered;
}

async function restore(store,root,backupRel) {
  const backup=safe(root,backupRel); const journal=json(join(backup,'journal.json'));
  if(journal.kind==='switch') throw new Error('This backup is from a tool switch. To switch back, run: node switch_ai.mjs');
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
  await store.writeStatus(status);
  return {restored,kept,backup:backupRel};
}
try {
  const command=process.argv[2], root=arg('--root'); if(!root) throw new Error('--root is required');
  const repo=arg('--release-repo')||dirname(dirname(fileURLToPath(import.meta.url)));
  if (command==='switch') throw new Error('To switch AI assistants, run: node switch_ai.mjs');
  if (!['update','restore','recover'].includes(command)) throw new Error('Use update, restore or recover');
  // The whole run holds the status lock, from the first read of status.json to
  // the journal's last word, so no other Orion command's change is lost to it.
  const result=await withStatusLock(root, store =>
    command==='update' ? update(store,root,repo,arg('--commit')) : command==='restore' ? restore(store,root,arg('--backup')) : recoverPendingUpdates(store,root).then(recovered=>({recovered})));
  console.log(JSON.stringify(result,null,2));
} catch(error) {console.error(error.message);process.exitCode=2;}
