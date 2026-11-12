/** Pinned, manifest-driven update and restore for a deployed Orion harness. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationState, fingerprint, planForTool, selectedTool } from './destination-resolver.mjs';

const arg = name => { const i=process.argv.indexOf(name); return i<0 ? undefined : process.argv[i+1]; };
const json = path => JSON.parse(readFileSync(path,'utf8'));
const safe = (root,path) => {
  if (typeof path !== 'string' || !path || path==='.' || path.startsWith('/') || path.split(/[\\/]/).includes('..')) throw new Error(`Unsafe path: ${path}`);
  const target=resolve(root,path); if (relative(root,target).startsWith(`..${sep}`)) throw new Error(`Unsafe path: ${path}`);
  let part=resolve(root); for (const segment of path.split('/')) { part=join(part,segment); if (existsSync(part) && lstatSync(part).isSymbolicLink()) throw new Error(`Symlink collision: ${path}`); }
  return target;
};
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
    for (const e of [...retired,...commonRetired]) {
      const dest=safe(root,e.destination), state=destinationState(root,e,pristine);
      if (state==='owned') actions.push({kind:'retire',e,dest});
      else if (state==='preserve'||state==='client-owned') report.kept.push(e.destination);
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const backupRel=`.update-backup/${status.template_version}-${stamp}`;
    const backup=safe(root,backupRel); if(existsSync(backup)) throw new Error('Backup already exists');
    mkdirSync(backup,{recursive:true}); copyTo(statusPath,join(backup,'status/status.json'));
    const journal={from:status.template_version,to:manifest.template_version,commit,selected_tool:tool,actions:[],remove_status_checklist_keys:manifest.remove_status_checklist_keys||[]};
    // All existing targets are backed up before the first write or removal.
    for (const a of actions) if(a.kind!=='add') copyTo(a.dest,join(backup,'files',a.e.destination));
    writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    for (const a of actions) {
      if(a.kind==='retire') {rmSync(a.dest);report.retired.push(a.e.destination);}
      else {copyTo(a.src,a.dest);report[a.kind==='add'?'added':'refreshed'].push(a.e.destination);}
      journal.actions.push({kind:a.kind,destination:a.e.destination,installed_hash:a.kind==='retire'?null:fingerprint(readFileSync(a.dest))});
      writeFileSync(join(backup,'journal.json'),JSON.stringify(journal,null,2));
    }
    for(const key of journal.remove_status_checklist_keys) delete status.checklist?.[key];
    status.template_version=manifest.template_version;
    status.notes=[status.notes||'',`updated to ${manifest.template_version}; backup in ${backupRel}`].filter(Boolean).join('\n');
    writeFileSync(statusPath,JSON.stringify(status,null,2)+'\n');
    return {...report,backup:backupRel};
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}
function restore(root,backupRel) {
  const backup=safe(root,backupRel); const journal=json(join(backup,'journal.json'));
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
  const result=command==='update' ? update(root,arg('--release-repo')||dirname(dirname(fileURLToPath(import.meta.url))),arg('--commit')) : command==='restore' ? restore(root,arg('--backup')) : (()=>{throw new Error('Use update or restore');})();
  console.log(JSON.stringify(result,null,2));
} catch(error) {console.error(error.message);process.exitCode=2;}
