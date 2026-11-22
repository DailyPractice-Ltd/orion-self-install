/**
 * Pinned, manifest-driven update, restore and recovery for a deployed Orion harness.
 * Switching between Codex and Claude Code is switch_ai.mjs at the harness root.
 *
 *   node update/apply.mjs update  --root <harness> [--release-repo <repo>] --commit <hash>
 *   node update/apply.mjs restore --root <harness> --backup .update-backup/<name>
 *   node update/apply.mjs recover --root <harness>
 *
 * The Orion plugin package (plugins/orion) is release-managed and replaced as a unit; the
 * complete prior package, in-place edits included, goes into the backup first. The
 * selected tool's catalog file and this harness's own entries in that tool's settings
 * (update/plugin-registration.mjs) are backed up as registration state. After the files, the
 * selected tool is refreshed through its own CLI (update/plugin-native.mjs):
 *   failed             a confirmed failure: the previous coordinated state is restored (exit 3)
 *   pending/registered the update stays pending in status.json `plugin.pending_version`
 *                      until a fresh session confirms discovery; it is never announced as active
 * The whole run holds the shared status lock (status/store.mjs), from the first read of
 * status.json to the journal's last word, so no other Orion command's change is lost to it.
 * Neither tool's marketplace auto-update is used: the harness supplies the pinned package.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, lstatSync, readdirSync, rmdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT, TOOL_LAYOUT, destinationState, fingerprint, planForTool, resolveAiAssistant, safePath } from './destination-resolver.mjs';
import { catalogName, catalogText, ensurePluginRegion } from './plugin-package.mjs';
import { lowerFirst } from './plugin-native.mjs';
import { captureRegistration, restoreRegistration } from './plugin-registration.mjs';
import { RESUME_COMMAND, VERIFY_COMMAND, runPluginSetup } from './plugin-setup.mjs';
import { withStatusLock } from '../status/store.mjs';

const arg = name => { const i=process.argv.indexOf(name); return i<0 ? undefined : process.argv[i+1]; };
const json = path => JSON.parse(readFileSync(path,'utf8'));
const safe = safePath;
const copyTo = (from,to) => { mkdirSync(dirname(to),{recursive:true}); copyFileSync(from,to); };
const versionParts = version => String(version).split('.').map(Number);
const newer = (a,b) => { const x=versionParts(a),y=versionParts(b); for(let i=0;i<3;i++) {if((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0);} return false; };
const writeJson = (path,value) => writeFileSync(path,JSON.stringify(value,null,2));
/** A read-modify-write of the status fields this command owns, under the run's lock. */
const editStatus = async (store,change) => { const status=await store.readStatus(); const result=change(status); await store.writeStatus(status); return result; };
const note = (status,line) => { status.notes=[status.notes||'',line].filter(Boolean).join('\n'); };
const product = tool => TOOL_LAYOUT[tool].product;
const fileHash = path => existsSync(path) && lstatSync(path).isFile() ? fingerprint(readFileSync(path)) : null;
const isPackagePath = path => path===PACKAGE_ROOT || path.startsWith(`${PACKAGE_ROOT}/`);

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

/** Every entry under a directory, as sorted "path hash" lines; links and special files are marked, never followed. */
function treeLines(dir, prefix='') {
  const lines=[];
  for (const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel=prefix?`${prefix}/${item.name}`:item.name, path=join(dir,item.name);
    if (item.isSymbolicLink()) lines.push(`${rel} link`);
    else if (item.isDirectory()) lines.push(...treeLines(path,rel));
    else if (item.isFile()) lines.push(`${rel} ${fingerprint(readFileSync(path))}`);
    else lines.push(`${rel} special`);
  }
  return lines;
}
/** One fingerprint for a whole package folder, or null when it is absent. */
function treeHash(path) {
  if (!existsSync(path)) return null;
  if (!lstatSync(path).isDirectory()) return `not-a-directory`;
  return fingerprint(treeLines(path).join('\n'));
}
function copyTree(from,to) {
  for (const line of treeLines(from)) {
    const rel=line.slice(0,line.lastIndexOf(' '));
    if (/ (link|special)$/.test(line)) throw new Error(`${PACKAGE_ROOT}/${rel} is a link or special file; move it out of the package, then try again`);
    copyTo(join(from,rel),join(to,rel));
  }
}
const hasPackage = deployment => deployment.entries.some(entry => isPackagePath(entry.source));

/** Remove the now-empty folders above removed files, never above the harness root. */
function pruneParents(root, paths) {
  for (const path of paths) {
    let parent=dirname(path);
    while (parent!=='.') {
      const directory=safe(root,parent);
      if (existsSync(directory)) { if (readdirSync(directory).length>0) break; rmdirSync(directory); }
      parent=dirname(parent);
    }
  }
}

const freshCheck = tool => `Start a fresh ${product(tool)} session in this folder${tool==='claude-code'?' (or run /reload-plugins)':''}, then ask your assistant to confirm it sees the Orion skills (it runs "${VERIFY_COMMAND}").`;

async function update(store,root,repo,commit) {
  await recoverPendingUpdates(store,root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const manifest=json(join(snapshot,'update/manifest.json'));
    const pristine=json(join(snapshot,'update/pristine.json'));
    const statusPath=safe(root,'status/status.json'), status=await store.readStatus();
    // 2.0.0 is a reinstall release: a 1.x folder is never updated in place.
    const legacyMarker=['agent/agent-definition.md','agent/adapters/claude.md'].find(path=>existsSync(join(root,path)));
    if (legacyMarker) throw new Error(`This folder is an Orion 1.x harness (it has ${legacyMarker}). Orion 2.0.0 is installed fresh, not updated in place: follow docs/reinstall-from-1.x.md. Nothing was changed`);
    const ai_assistant=resolveAiAssistant(status,manifest.deployment);
    if (newer(status.template_version,manifest.template_version)) throw new Error('Refusing to roll back the harness version');
    if (status.plugin?.pending_switch) throw new Error(`A switch to ${product(status.plugin.pending_switch.to)} has started but is not finished, and an update now could leave the two tools on different releases. Finish the switch first (run "node switch_ai.mjs" again) or cancel it (run "node switch_ai.mjs --to ${ai_assistant}"), then update`);
    const withPlugin=hasPackage(manifest.deployment);
    const plan=planForTool(manifest.deployment,ai_assistant,{releaseRoot:snapshot,root});
    const retired=(manifest.deployment.retired||[]).map(e=>({source:e.source,destination:e.destinations?.[ai_assistant]||e.destination,ownership:'release',fingerprint_key:e.sources?.[ai_assistant]||e.fingerprint_key||e.source}));
    const commonRetired=(manifest.remove||[]).map(path=>({source:path,destination:path,ownership:'release',fingerprint_key:path}));
    const actions=[], report={from:status.template_version,to:manifest.template_version,commit,ai_assistant,refreshed:[],added:[],retired:[],kept:[],collisions:[]};
    for (const e of plan) {
      // The package is replaced as a unit below, never file by file.
      if (withPlugin && isPackagePath(e.destination)) continue;
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

    // The plugin: the whole package, and this harness's catalog for the selected tool.
    let pkg=null, catalog=null, registration=null, identity=null;
    if (withPlugin) {
      identity=ensurePluginRegion(status,{create:true}).catalog_identity;
      // This harness's own entries in the tool's settings; the refresh may rewrite them.
      registration=captureRegistration(root,ai_assistant,catalogName(identity));
      const releasePackage=join(snapshot,PACKAGE_ROOT), harnessPackage=safe(root,PACKAGE_ROOT);
      const prior_hash=treeHash(harnessPackage), installed_hash=treeHash(releasePackage);
      if (prior_hash!==installed_hash) {
        // Reported edits: prior package files that are neither a shipped fingerprint nor the incoming bytes.
        const edits=[];
        for (const line of existsSync(harnessPackage) ? treeLines(harnessPackage) : []) {
          const at=line.lastIndexOf(' '), rel=`${PACKAGE_ROOT}/${line.slice(0,at)}`, hash=line.slice(at+1);
          const incoming=fileHash(join(snapshot,rel));
          if (hash!==incoming && !(pristine.files?.[rel]||[]).includes(hash)) edits.push(rel);
        }
        pkg={prior_hash,installed_hash,edits_backed_up:edits};
      }
      const path=TOOL_LAYOUT[ai_assistant].catalogPath, text=catalogText(ai_assistant,identity);
      const current=fileHash(safe(root,path));
      // Always backed up: the catalog is this harness's registration state for the tool.
      catalog={path,text,prior_hash:current,installed_hash:fingerprint(text),changed:current!==fingerprint(text)};
    }

    const checklistKeys = manifest.remove_status_checklist_keys || [];
    const hasRetiredChecklistKeys = checklistKeys.some(key => Object.hasOwn(status.checklist || {}, key));
    if (status.template_version === manifest.template_version && !actions.length && !pkg && !catalog?.changed && !hasRetiredChecklistKeys) {
      return { ...report, up_to_date: true, ...(withPlugin ? {plugin:pluginReport(status.plugin)} : {}) };
    }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const backupRel=`.update-backup/${status.template_version}-${stamp}`;
    const backup=safe(root,backupRel); if(existsSync(backup)) throw new Error('Backup already exists');
    mkdirSync(backup,{recursive:true}); copyTo(statusPath,join(backup,'status/status.json'));
    const journal={kind:'update',state:'pending',from:status.template_version,to:manifest.template_version,commit,ai_assistant,
      actions:actions.map(a=>({kind:a.kind,destination:a.e.destination,installed_hash:a.kind==='retire'?null:fingerprint(readFileSync(a.src)),prior_hash:a.kind==='add'?null:fingerprint(readFileSync(a.dest))})),
      remove_status_checklist_keys:checklistKeys,
      package:pkg && {path:PACKAGE_ROOT,prior_hash:pkg.prior_hash,installed_hash:pkg.installed_hash},
      catalog:catalog && {path:catalog.path,prior_hash:catalog.prior_hash,installed_hash:catalog.installed_hash},
      registration:registration ? 'registration.json' : null};
    // The status fields this update owns, written under the lock once the files are in place.
    const commitStatus=current=>{
      for(const key of journal.remove_status_checklist_keys) delete current.checklist?.[key];
      current.template_version=manifest.template_version;
      if (withPlugin) {
        const plugin=ensurePluginRegion(current);
        if (plugin.catalog_identity==null) plugin.catalog_identity=identity;
        plugin.pending_version=manifest.template_version;
        plugin.update_backup=backupRel;
        plugin.setup_state='pending';
        plugin.remaining_action=`Finish refreshing the Orion plugin: from this folder run "${RESUME_COMMAND}", then ${lowerFirst(freshCheck(ai_assistant))}`;
      }
      note(current,`updated to ${manifest.template_version}; backup in ${backupRel}`);
    };
    // All existing targets are backed up before the first write or removal.
    for (const a of actions) if(a.kind!=='add') copyTo(a.dest,join(backup,'files',a.e.destination));
    for (const a of actions) if(a.kind!=='retire') copyTo(a.src,join(backup,'stage',a.e.destination));
    if (pkg) {
      if (pkg.prior_hash) copyTree(safe(root,PACKAGE_ROOT),join(backup,'package',PACKAGE_ROOT));
      copyTree(join(snapshot,PACKAGE_ROOT),join(backup,'stage',PACKAGE_ROOT));
    }
    if (catalog) {
      if (catalog.prior_hash) copyTo(safe(root,catalog.path),join(backup,'catalog',catalog.path));
      if (catalog.changed) {
        mkdirSync(dirname(join(backup,'stage',catalog.path)),{recursive:true});
        writeFileSync(join(backup,'stage',catalog.path),catalog.text);
      }
    }
    if (registration) writeJson(join(backup,'registration.json'),registration);
    writeJson(join(backup,'journal.json'),journal);
    try {
      let count=0;
      const step=()=>{ if(process.env.ORION_UPDATE_FAIL_AFTER && ++count===Number(process.env.ORION_UPDATE_FAIL_AFTER)) throw new Error('Injected update interruption'); };
      if (pkg) {
        rmSync(safe(root,PACKAGE_ROOT),{recursive:true,force:true});
        mkdirSync(dirname(safe(root,PACKAGE_ROOT)),{recursive:true});
        renameSync(join(backup,'stage',PACKAGE_ROOT),safe(root,PACKAGE_ROOT));
        report.package={replaced:true,edits_backed_up:pkg.edits_backed_up,backup:`${backupRel}/package/${PACKAGE_ROOT}`};
        step();
      }
      if (catalog?.changed) {
        mkdirSync(dirname(safe(root,catalog.path)),{recursive:true});
        renameSync(join(backup,'stage',catalog.path),safe(root,catalog.path));
        report.catalog=catalog.path;
        step();
      }
      for (const a of actions) {
        if(a.kind==='retire') {rmSync(a.dest);report.retired.push(a.e.destination);}
        else {mkdirSync(dirname(a.dest),{recursive:true});renameSync(join(backup,'stage',a.e.destination),a.dest);report[a.kind==='add'?'added':'refreshed'].push(a.e.destination);}
        step();
      }
      pruneParents(root,report.retired.filter(path => path.startsWith('library/')));
      await editStatus(store,commitStatus);
      journal.state='complete';writeJson(join(backup,'journal.json'),journal);
    } catch(error) {
      await rollbackUpdate(store,root,backup,journal);
      journal.state='recovered';writeJson(join(backup,'journal.json'),journal);
      throw error;
    }
    if (!withPlugin) return {...report,backup:backupRel};

    // Refresh the selected tool. Only a confirmed failure rolls the update back.
    const refreshed=await runPluginSetup(root,{mode:'setup',store});
    if (refreshed.setup_state==='failed') {
      const plugin=await rollbackUpdate(store,root,backup,journal,restored=>{
        const region=ensurePluginRegion(restored);
        region.setup_state='pending';
        region.pending_version=restored.template_version;
        region.remaining_action=`The update to ${manifest.template_version} failed at the plugin refresh and Orion ${restored.template_version} was put back. ${freshCheck(ai_assistant)}`;
        note(restored,`update to ${manifest.template_version} failed (${refreshed.reason||'plugin refresh'}); restored ${restored.template_version} from ${backupRel}`);
        return region;
      });
      journal.state='rolled_back';writeJson(join(backup,'journal.json'),journal);
      process.exitCode=3;
      return {...report,state:'rolled_back',active:false,reason:refreshed.reason,errors:refreshed.errors,remaining_action:plugin.remaining_action,reload_required:true,backup:backupRel};
    }
    return {...report,state:refreshed.setup_state==='complete'?'complete':'pending_verification',active:refreshed.setup_state==='complete',plugin:{...pluginReport(refreshed),checked_with:refreshed.checked_with},backup:backupRel};
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

const pluginReport = plugin => ({setup_state:plugin?.setup_state,pending_version:plugin?.pending_version??null,verified_version:plugin?.verified_version??null,remaining_action:plugin?.remaining_action??null});

const RECOVERY_ACTION = (backup,command,kind='update') => `These files changed after the ${kind}, and putting the backup back would overwrite those changes, so Orion stopped. Nothing was overwritten. Move your changes to those paths somewhere outside this folder (keep them: edits to Orion's own skills belong in a client skill under .claude/skills or .agents/skills), put the paths back as the backup in ${backup} has them or delete them, then run "${command}" again.`;

/**
 * Undo an update's own changes under the run's status lock; `adjust` may change more owned
 * status fields in the same write, and its return value is returned.
 */
async function rollbackUpdate(store,root,backup,journal,adjust) {
  const backupRel=`.update-backup/${backup.split(/[\\/]/).pop()}`;
  const conflicts=journal.actions.filter(a=>{
    const dest=safe(root,a.destination);
    if(!existsSync(dest)) return a.kind==='replace';
    if(!lstatSync(dest).isFile()) return true;
    const current=fingerprint(readFileSync(dest));
    return current!==a.prior_hash && current!==a.installed_hash;
  }).map(a=>a.destination);
  if (journal.package) {
    const current=treeHash(safe(root,PACKAGE_ROOT));
    if (![journal.package.prior_hash,journal.package.installed_hash,null].includes(current)) conflicts.push(PACKAGE_ROOT);
  }
  if (journal.catalog) {
    const current=fileHash(safe(root,journal.catalog.path));
    if (![journal.catalog.prior_hash,journal.catalog.installed_hash,null].includes(current)) conflicts.push(journal.catalog.path);
  }
  if(conflicts.length) throw new Error(`Update recovery collisions: ${conflicts.join(', ')}. ${RECOVERY_ACTION(backupRel,'node update/apply.mjs recover --root .')}`);
  for(const a of [...journal.actions].reverse()) {
    const dest=safe(root,a.destination);
    if(a.kind==='add') {if(existsSync(dest)) rmSync(dest);}
    else copyTo(join(backup,'files',a.destination),dest);
  }
  if (journal.catalog) {
    const dest=safe(root,journal.catalog.path);
    if (journal.catalog.prior_hash) copyTo(join(backup,'catalog',journal.catalog.path),dest);
    else if (existsSync(dest)) { rmSync(dest); pruneParents(root,[journal.catalog.path]); }
  }
  if (journal.package && treeHash(safe(root,PACKAGE_ROOT))!==journal.package.prior_hash) {
    rmSync(safe(root,PACKAGE_ROOT),{recursive:true,force:true});
    if (journal.package.prior_hash) copyTree(join(backup,'package',PACKAGE_ROOT),safe(root,PACKAGE_ROOT));
  }
  if (journal.registration) restoreRegistration(root,json(join(backup,journal.registration)));
  // Status: only the fields the update owns go back; everything written since stays.
  const status=await store.readStatus(), old=json(join(backup,'status/status.json'));
  status.template_version=old.template_version;
  for(const key of journal.remove_status_checklist_keys||[]) if(Object.hasOwn(old.checklist||{},key)) {status.checklist ||= {};status.checklist[key]=old.checklist[key];}
  if (journal.package || journal.catalog) status.plugin=old.plugin;
  const result=adjust?.(status);
  await store.writeStatus(status);
  const stage=join(backup,'stage');if(existsSync(stage)) rmSync(stage,{recursive:true,force:true});
  return result;
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
      journal.state='recovered';writeJson(path,journal);recovered.push(name);
    }
  }
  return recovered;
}

/** Restore one update backup; its file work and its status change happen under the run's status lock. */
async function restore(store,root,backupRel) {
  const backup=safe(root,backupRel); const journal=json(join(backup,'journal.json'));
  if(journal.kind==='switch') throw new Error('This backup is from a tool switch, which switch_ai.mjs undoes by switching again. To switch back, run: node switch_ai.mjs');
  if(journal.state!=='complete') throw new Error(`Update backup is ${journal.state}; only completed updates can be restored`);
  // The package is restored as a unit, so a later edit inside it stops the whole restore first.
  if (journal.package && treeHash(safe(root,PACKAGE_ROOT))!==journal.package.installed_hash) {
    throw new Error(`Restore collision: ${PACKAGE_ROOT} changed after the update, and putting the backup back would overwrite those changes, so Orion stopped. Nothing was restored. Move your changes out of ${PACKAGE_ROOT} (keep them as a client skill under ${TOOL_LAYOUT[journal.ai_assistant]?.skillRoot || '.claude/skills or .agents/skills'}), put back the release's files or delete ${PACKAGE_ROOT}, then run "node update/apply.mjs restore --root . --backup ${backupRel}" again.`);
  }
  const status=await store.readStatus(), old=json(join(backup,'status/status.json'));
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
  if (journal.package) {
    rmSync(safe(root,PACKAGE_ROOT),{recursive:true,force:true});
    if (journal.package.prior_hash) copyTree(join(backup,'package',PACKAGE_ROOT),safe(root,PACKAGE_ROOT));
    restored.push(PACKAGE_ROOT);
  }
  if (journal.catalog) {
    const dest=safe(root,journal.catalog.path), current=fileHash(dest);
    if (current!==null && current!==journal.catalog.installed_hash) kept.push(journal.catalog.path);
    else {
      if (journal.catalog.prior_hash) copyTo(join(backup,'catalog',journal.catalog.path),dest);
      else if (current!==null) rmSync(dest);
      restored.push(journal.catalog.path);
    }
  }
  if (journal.registration) { restoreRegistration(root,json(join(backup,journal.registration))); restored.push('registration'); }
  for(const key of journal.remove_status_checklist_keys) if(Object.hasOwn(old.checklist||{},key)) {status.checklist ||= {};status.checklist[key]=old.checklist[key];}
  status.template_version=old.template_version;
  const result={restored,kept,backup:backupRel};
  if (journal.package || journal.catalog) {
    // The tool must load the restored package before recovery can be claimed.
    const plugin=ensurePluginRegion(status);
    const tool=status.ai_assistant;
    plugin.setup_state='pending';
    plugin.pending_version=old.template_version;
    plugin.update_backup=null;
    plugin.remaining_action=`Orion ${old.template_version} was restored. ${freshCheck(tool)}${tool==='codex'?` If Codex still shows a different Orion version, reinstall Orion from its Plugins Directory first.`:''}`;
    Object.assign(result,{reload_required:true,remaining_action:plugin.remaining_action});
  }
  note(status,`restored from ${backupRel}`);
  await store.writeStatus(status);
  return result;
}

async function main() {
  const command=process.argv[2], root=arg('--root'); if(!root) throw new Error('--root is required');
  const repo=arg('--release-repo')||dirname(dirname(fileURLToPath(import.meta.url)));
  if (command==='switch') throw new Error('To switch AI assistants, run: node switch_ai.mjs');
  if (!['update','restore','recover'].includes(command)) throw new Error('Use update, restore or recover');
  return withStatusLock(root, store =>
    command==='update' ? update(store,root,repo,arg('--commit'))
      : command==='restore' ? restore(store,root,arg('--backup'))
      : recoverPendingUpdates(store,root).then(recovered=>({recovered})));
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=2;});
