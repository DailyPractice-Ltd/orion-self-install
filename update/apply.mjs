/**
 * Pinned, manifest-driven update, tool switch, restore and recovery for a deployed Orion harness.
 *
 *   node update/apply.mjs update  --root <harness> [--release-repo <repo>] --commit <hash>
 *   node update/apply.mjs switch  --root <harness> [--release-repo <repo>] --commit <hash> --to <tool>
 *   node update/apply.mjs restore --root <harness> --backup .update-backup/<name>
 *   node update/apply.mjs recover --root <harness>
 *
 * The Orion plugin package (plugins/orion) is release-managed and replaced as a unit; the
 * complete prior package, in-place edits included, goes into the backup first. Only the
 * selected tool's catalog file is backed up as registration state. After the files, the
 * selected tool is refreshed through its own CLI (update/plugin-native.mjs):
 *   failed             a confirmed failure: the previous coordinated state is restored (exit 3)
 *   pending/registered the update stays pending in status.json `plugin.pending_version`
 *                      until a fresh session confirms discovery; it is never announced as active
 * A switch writes the target tool's catalog and sets that tool up first. The selected tool
 * (`ai_assistant`) changes only once the target's own CLI lists Orion for this folder;
 * until then the switch is pending (`plugin.pending_switch`) and the same command resumes it.
 * Neither tool's marketplace auto-update is used: the harness supplies the pinned package.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, lstatSync, readdirSync, rmdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT, TOOL_LAYOUT, destinationState, fingerprint, planForTool, resolveAiAssistant, safePath } from './destination-resolver.mjs';
import { catalogName, catalogText, ensurePluginRegion } from './plugin-package.mjs';
import { lowerFirst, retirePlugin } from './plugin-native.mjs';
import { RESUME_COMMAND, VERIFY_COMMAND, nativeStep, runPluginSetup } from './plugin-setup.mjs';

const arg = name => { const i=process.argv.indexOf(name); return i<0 ? undefined : process.argv[i+1]; };
const json = path => JSON.parse(readFileSync(path,'utf8'));
const safe = safePath;
const copyTo = (from,to) => { mkdirSync(dirname(to),{recursive:true}); copyFileSync(from,to); };
const versionParts = version => String(version).split('.').map(Number);
const newer = (a,b) => { const x=versionParts(a),y=versionParts(b); for(let i=0;i<3;i++) {if((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0);} return false; };
const writeJson = (path,value) => writeFileSync(path,JSON.stringify(value,null,2));
const writeStatus = (root,status) => writeFileSync(safe(root,'status/status.json'),JSON.stringify(status,null,2)+'\n');
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

async function update(root,repo,commit) {
  await recoverPendingUpdates(root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const manifest=json(join(snapshot,'update/manifest.json'));
    const pristine=json(join(snapshot,'update/pristine.json'));
    const statusPath=safe(root,'status/status.json'), status=json(statusPath);
    const ai_assistant=resolveAiAssistant(status,manifest.deployment);
    if (newer(status.template_version,manifest.template_version)) throw new Error('Refusing to roll back the harness version');
    if (status.plugin?.pending_switch) throw new Error(`A switch to ${status.plugin.pending_switch.to} is waiting. Finish it (run the same switch command again) or cancel it with "node update/apply.mjs restore --root . --backup ${status.plugin.pending_switch.backup}", then update`);
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
    let pkg=null, catalog=null;
    if (withPlugin) {
      const identity=ensurePluginRegion(status,{create:true}).catalog_identity;
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
      catalog:catalog && {path:catalog.path,prior_hash:catalog.prior_hash,installed_hash:catalog.installed_hash}};
    for(const key of journal.remove_status_checklist_keys) delete status.checklist?.[key];
    status.template_version=manifest.template_version;
    if (withPlugin) {
      const plugin=ensurePluginRegion(status);
      plugin.pending_version=manifest.template_version;
      plugin.setup_state='pending';
      plugin.remaining_action=`Finish refreshing the Orion plugin: from this folder run "${RESUME_COMMAND}", then ${lowerFirst(freshCheck(ai_assistant))}`;
    }
    note(status,`updated to ${manifest.template_version}; backup in ${backupRel}`);
    const nextStatus=JSON.stringify(status,null,2)+'\n';
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
    mkdirSync(join(backup,'stage/status'),{recursive:true});
    writeFileSync(join(backup,'stage/status/status.json'),nextStatus);
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
      renameSync(join(backup,'stage/status/status.json'),statusPath);
      journal.state='complete';writeJson(join(backup,'journal.json'),journal);
    } catch(error) {
      rollbackUpdate(root,backup,journal);
      journal.state='recovered';writeJson(join(backup,'journal.json'),journal);
      throw error;
    }
    if (!withPlugin) return {...report,backup:backupRel};

    // Refresh the selected tool. Only a confirmed failure rolls the update back.
    const refreshed=await runPluginSetup(root,{mode:'setup'});
    if (refreshed.setup_state==='failed') {
      rollbackUpdate(root,backup,journal);
      const restored=json(statusPath), plugin=ensurePluginRegion(restored);
      plugin.setup_state='pending';
      plugin.pending_version=restored.template_version;
      plugin.remaining_action=`The update to ${manifest.template_version} failed at the plugin refresh and Orion ${restored.template_version} was put back. ${freshCheck(ai_assistant)}`;
      note(restored,`update to ${manifest.template_version} failed (${refreshed.reason||'plugin refresh'}); restored ${restored.template_version} from ${backupRel}`);
      writeStatus(root,restored);
      journal.state='rolled_back';writeJson(join(backup,'journal.json'),journal);
      process.exitCode=3;
      return {...report,state:'rolled_back',active:false,reason:refreshed.reason,errors:refreshed.errors,remaining_action:plugin.remaining_action,reload_required:true,backup:backupRel};
    }
    return {...report,state:refreshed.setup_state==='complete'?'complete':'pending_verification',active:refreshed.setup_state==='complete',plugin:{...pluginReport(refreshed),checked_with:refreshed.checked_with},backup:backupRel};
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

const pluginReport = plugin => ({setup_state:plugin?.setup_state,pending_version:plugin?.pending_version??null,verified_version:plugin?.verified_version??null,remaining_action:plugin?.remaining_action??null});

// A switch moves the active layout and plugin registration. Historical job files stay in place.
async function switchTool(root,repo,commit,ai_assistant,legacyTool) {
  await recoverPendingSwitches(root);
  await recoverPendingUpdates(root);
  const snapshot=sourceSnapshot(repo,commit);
  try {
    const manifest=json(join(snapshot,'update/manifest.json'));
    const pristine=json(join(snapshot,'update/pristine.json'));
    const deployment=manifest.deployment;
    const statusPath=safe(root,'status/status.json'), status=json(statusPath);
    const from=resolveAiAssistant(status,deployment,{legacyTool});
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
    if (!deployment.tools.includes(ai_assistant) || ai_assistant===from) throw new Error(`Choose the other supported tool (current: ${from})`);
    const withPlugin=hasPackage(deployment);
    const waiting=status.plugin?.pending_switch;
    if (waiting && waiting.to!==ai_assistant) throw new Error(`A switch to ${waiting.to} is waiting. Finish it with --to ${waiting.to}, or cancel it with "node update/apply.mjs restore --root . --backup ${waiting.backup}"`);

    let backupRel, backup, journal, count=0;
    const step=()=>{ if(process.env.ORION_SWITCH_FAIL_AFTER && ++count===Number(process.env.ORION_SWITCH_FAIL_AFTER)) throw new Error('Injected switch interruption'); };
    if (waiting) {
      backupRel=waiting.backup; backup=safe(root,backupRel); journal=json(join(backup,'journal.json'));
      if (journal.kind!=='switch' || journal.state!=='awaiting_target' || journal.to!==ai_assistant) throw new Error(`The waiting switch's backup ${backupRel} is ${journal.state}; run "node update/apply.mjs recover --root ." and switch again`);
    } else {
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      backupRel=`.update-backup/switch-${from}-to-${ai_assistant}-${stamp}`;
      backup=safe(root,backupRel);if(existsSync(backup)) throw new Error('Backup already exists');
      mkdirSync(backup,{recursive:true});copyTo(statusPath,join(backup,'status/status.json'));
      journal={kind:'switch',state:'pending',from,to:ai_assistant,actions:[],retire:[],plugin:withPlugin};
    }

    if (withPlugin && !waiting) {
      // Prepare: the target tool's catalog, from the same identity, beside the current one.
      const identity=ensurePluginRegion(status,{create:true}).catalog_identity;
      const path=TOOL_LAYOUT[ai_assistant].catalogPath, text=catalogText(ai_assistant,identity), current=fileHash(safe(root,path));
      if (current!==null && current!==fingerprint(text)) throw new Error(`Target collision: ${path}`);
      if (current===null) {
        mkdirSync(dirname(join(backup,'stage',path)),{recursive:true});writeFileSync(join(backup,'stage',path),text);
        journal.actions.push({destination:path,kind:'copy',hash:fingerprint(text),prior_hash:null});
      }
      writeJson(join(backup,'journal.json'),journal);
      try {
        for (const a of journal.actions) { copyTo(join(backup,'stage',a.destination),safe(root,a.destination)); step(); }
        status.plugin.pending_switch={to:ai_assistant,backup:backupRel,remaining_action:null};
        writeStatus(root,status);
        journal.state='awaiting_target';writeJson(join(backup,'journal.json'),journal);
      } catch(error) {
        rollbackSwitch(root,backup,journal);
        journal.state='recovered';writeJson(join(backup,'journal.json'),journal);
        throw error;
      }
    }
    if (withPlugin) {
      const identity=status.plugin.catalog_identity;
      const target=nativeStep(root,{tool:ai_assistant,identity,version:manifest.template_version,mode:'setup'});
      journal.target_touched=true;
      if (target.state==='failed') {
        rollbackSwitch(root,backup,journal);
        retirePlugin({root,tool:ai_assistant,catalogName:catalogName(identity)});
        journal.state='rolled_back';journal.reason=target.details?.reason;writeJson(join(backup,'journal.json'),journal);
        process.exitCode=3;
        return {state:'rolled_back',from,to:ai_assistant,reason:target.details?.reason,errors:target.details?.errors||[],selected:from,backup:backupRel};
      }
      if (target.state==='pending') {
        const current=json(statusPath);
        current.plugin.pending_switch={to:ai_assistant,backup:backupRel,remaining_action:target.remaining_action};
        writeStatus(root,current);
        writeJson(join(backup,'journal.json'),journal);
        return {state:'pending_switch',from,to:ai_assistant,selected:from,remaining_action:`${target.remaining_action} Then run this same switch command again to finish.`,backup:backupRel};
      }
      journal.target_next=target.details?.next;
    }
    return commitSwitch({root,snapshot,deployment,pristine,from,to:ai_assistant,backup,backupRel,journal,withPlugin,version:manifest.template_version,step});
  } finally {rmSync(snapshot,{recursive:true,force:true});}
}

function commitSwitch({root,snapshot,deployment,pristine,from,to,backup,backupRel,journal,withPlugin,version,step}) {
  const status=json(safe(root,'status/status.json'));
  const sourcePlan=planForTool(deployment,from,{releaseRoot:snapshot,root});
  const targetPlan=planForTool(deployment,to,{releaseRoot:snapshot,root});
  const actions=[], retire=[];
  const targetPaths=new Set(journal.actions.map(a=>a.destination));
  const add=(destination,source,kind='copy') => {
    safe(root,destination);
    if (targetPaths.has(destination)) throw new Error(`Duplicate switch destination: ${destination}`);
    targetPaths.add(destination);
    if (existsSync(safe(root,destination))) throw new Error(`Target collision: ${destination}`);
    if (!lstatSync(source).isFile()) throw new Error(`Not a regular source file: ${source}`);
    actions.push({kind,destination,source});
  };
  for (const entry of deployment.entries) {
    // Package entries have no per-tool destinations: they stay at their own path.
    const at=tool=>entry.destinations?entry.destinations[tool]:entry.source;
    const old=sourcePlan.find(e=>e.destination===at(from)), next=targetPlan.find(e=>e.destination===at(to));
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
  const oldSkill=TOOL_LAYOUT[from].skillRoot, newSkill=TOOL_LAYOUT[to].skillRoot;
  // Client skills move with the selected tool; maintainer-only speckit skills are retired.
  const portable=(oldRoot,newRoot) => {
    const base=safe(root,oldRoot);
    if (!existsSync(base)) return;
    const walk=(dir,prefix='') => {
      for(const item of readdirSync(dir,{withFileTypes:true})) {
        const rel=prefix?`${prefix}/${item.name}`:item.name, path=join(dir,item.name);
        if(rel.split('/')[0].startsWith('speckit-')) {
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
  portable(oldSkill,newSkill);
  // Only the previous tool's Orion catalog leaves; its other settings stay. It is backed up
  // with the other retired files but removed last, after that tool's Orion is retired.
  const oldCatalog=TOOL_LAYOUT[from].catalogPath;
  if (withPlugin && existsSync(safe(root,oldCatalog))) retire.push(oldCatalog);
  // Stage expected bytes and all backups before touching the deployed tree.
  for(const a of actions) {
    if(a.kind==='replace') copyTo(safe(root,a.destination),join(backup,'files',a.destination));
    copyTo(a.source,join(backup,'stage',a.destination));
  }
  const retired=[...new Set(retire)];
  for(const destination of retired) copyTo(safe(root,destination),join(backup,'files',destination));
  const staged=actions.map(a=>({destination:a.destination,kind:a.kind||'copy',hash:fingerprint(readFileSync(join(backup,'stage',a.destination))),prior_hash:a.kind==='replace'?fingerprint(readFileSync(join(backup,'files',a.destination))):null}));
  journal.actions=[...journal.actions,...staged];
  journal.retire=retired;
  journal.state='pending';
  writeJson(join(backup,'journal.json'),journal);
  try {
    for(const a of staged) {
      const dest=safe(root,a.destination);
      copyTo(join(backup,'stage',a.destination),dest);
      if(fingerprint(readFileSync(dest))!==a.hash) throw new Error(`Validation failed: ${a.destination}`);
      step();
    }
    const removeNow=retired.filter(path=>!(withPlugin && path===oldCatalog));
    for(const destination of removeNow) rmSync(safe(root,destination));
    pruneParents(root,removeNow);
    if (process.env.ORION_SWITCH_FAIL_BEFORE_COMMIT) throw new Error('Injected switch interruption');
    status.ai_assistant = to;
    if (withPlugin) {
      const plugin=ensurePluginRegion(status);
      plugin.pending_switch=null;
      plugin.setup_state='registered';
      plugin.pending_version=version;
      plugin.remaining_action=`${journal.target_next || ''} Then ask your assistant to confirm it sees the Orion skills (it runs "${VERIFY_COMMAND}").`.trim();
    }
    note(status,`switched from ${from} to ${to}; backup in ${backupRel}`);
    writeStatus(root,status);
    journal.state='complete';
    writeJson(join(backup,'journal.json'),journal);
  } catch(error) {
    rollbackSwitch(root,backup,journal);
    if (withPlugin && journal.target_touched) retirePlugin({root,tool:to,catalogName:catalogName(status.plugin.catalog_identity)});
    journal.state='recovered';writeJson(join(backup,'journal.json'),journal);
    throw error;
  }
  // Committed. Only now does the previous tool's Orion go, and its catalog after it, so a
  // failure before this point leaves that tool exactly as it was.
  const result={state:'switched',from,to,selected:to,backup:backupRel,installed:journal.actions.map(a=>a.destination),retired};
  if (withPlugin) {
    const oldRetired=retirePlugin({root,tool:from,catalogName:catalogName(status.plugin.catalog_identity)});
    result.active=false;
    result.remaining_action=status.plugin.remaining_action;
    if (oldRetired.state==='complete') {
      if (existsSync(safe(root,oldCatalog))) { rmSync(safe(root,oldCatalog)); pruneParents(root,[oldCatalog]); }
    } else {
      result.retired=retired.filter(path=>path!==oldCatalog);
      result.previous_tool_action=`Orion could not remove itself from ${product(from)} for this folder (${oldRetired.details?.reason || 'its program was not reachable'}), so ${product(from)} may still offer the Orion skills here. Remove Orion there by hand; nothing else in ${product(from)} was changed, and ${oldCatalog} stays until then.`;
    }
  }
  return result;
}

async function recoverPendingSwitches(root) {
  const backups=safe(root,'.update-backup');
  if(!existsSync(backups)) return [];
  const recovered=[];
  for(const name of readdirSync(backups).filter(n=>n.startsWith('switch-'))) {
    const backup=safe(root,`.update-backup/${name}`), path=join(backup,'journal.json');
    if(!existsSync(path)) continue;
    const journal=json(path);
    if(journal.kind==='switch' && journal.state==='pending') {
      rollbackSwitch(root,backup,journal);
      const identity=json(safe(root,'status/status.json')).plugin?.catalog_identity;
      if (journal.plugin && journal.target_touched && identity) retirePlugin({root,tool:journal.to,catalogName:catalogName(identity)});
      journal.state='recovered';writeJson(path,journal);
      recovered.push(name);
    }
  }
  return recovered;
}

const RECOVERY_ACTION = (backup,command) => `Nothing was overwritten. Move your changes to those paths somewhere outside this folder (keep them: edits to Orion's own skills belong in a client skill under .claude/skills or .agents/skills), put the paths back as the backup in ${backup} has them or delete them, then run "${command}" again.`;

function rollbackUpdate(root,backup,journal) {
  const statusPath=safe(root,'status/status.json');
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
  // Status: only the fields the update owns go back; everything written since stays.
  const status=json(statusPath), old=json(join(backup,'status/status.json'));
  status.template_version=old.template_version;
  for(const key of journal.remove_status_checklist_keys||[]) if(Object.hasOwn(old.checklist||{},key)) {status.checklist ||= {};status.checklist[key]=old.checklist[key];}
  if (journal.package || journal.catalog) status.plugin=old.plugin;
  writeStatus(root,status);
  const stage=join(backup,'stage');if(existsSync(stage)) rmSync(stage,{recursive:true,force:true});
}

async function recoverPendingUpdates(root) {
  const backups=safe(root,'.update-backup');if(!existsSync(backups)) return [];
  const recovered=[];
  for(const name of readdirSync(backups)) {
    const backup=safe(root,`.update-backup/${name}`), path=join(backup,'journal.json');
    if(!existsSync(path)) continue;
    const journal=json(path);
    if(journal.kind==='update' && journal.state==='pending') {
      rollbackUpdate(root,backup,journal);
      journal.state='recovered';writeJson(path,journal);recovered.push(name);
    }
  }
  return recovered;
}

/** Undo a switch's own file changes; status keeps every field it did not own. */
function rollbackSwitch(root,backup,journal) {
  const conflicts=journal.actions.filter(a=>{
    const path=safe(root,a.destination);
    return existsSync(path) && (!lstatSync(path).isFile() || ![a.hash,a.prior_hash].includes(fingerprint(readFileSync(path))));
  }).map(a=>a.destination);
  const backupRel=`.update-backup/${backup.split(/[\\/]/).pop()}`;
  if(conflicts.length) throw new Error(`Switch recovery collisions: ${conflicts.join(', ')}. ${RECOVERY_ACTION(backupRel,'node update/apply.mjs recover --root .')}`);
  const removed=[];
  for(const action of [...journal.actions].reverse()) {
    const path=safe(root,action.destination);
    if(action.kind==='replace') copyTo(join(backup,'files',action.destination),path);
    else if(existsSync(path)) {rmSync(path);removed.push(action.destination);}
  }
  pruneParents(root,removed);
  for(const destination of journal.retire) {
    const old=join(backup,'files',destination);
    if(existsSync(old)) copyTo(old,safe(root,destination));
  }
  const statusPath=safe(root,'status/status.json'), status=json(statusPath);
  status.ai_assistant=json(join(backup,'status/status.json')).ai_assistant;
  if (status.plugin && typeof status.plugin==='object') status.plugin.pending_switch=null;
  writeStatus(root,status);
}

function restore(root,backupRel) {
  const backup=safe(root,backupRel); const journal=json(join(backup,'journal.json'));
  if(journal.kind==='switch') {
    if(!['complete','awaiting_target'].includes(journal.state)) throw new Error(`Switch backup is ${journal.state}; only completed or waiting switches can be restored`);
    const conflicts=journal.actions.filter(a=>{
      const dest=safe(root,a.destination);
      return existsSync(dest) && fingerprint(readFileSync(dest))!==a.hash;
    }).map(a=>a.destination);
    if(conflicts.length) throw new Error(`Restore collisions: ${conflicts.join(', ')}. ${RECOVERY_ACTION(backupRel,`node update/apply.mjs restore --root . --backup ${backupRel}`)}`);
    const waiting=journal.state==='awaiting_target';
    rollbackSwitch(root,backup,journal);
    const result={restored:journal.retire,removed:journal.actions.map(a=>a.destination),backup:backupRel};
    const status=json(safe(root,'status/status.json'));
    if (journal.plugin && !waiting) {
      const plugin=ensurePluginRegion(status);
      plugin.setup_state='pending';
      plugin.pending_version=status.template_version;
      plugin.remaining_action=`Re-register Orion with ${product(journal.from)}: from this folder run "${RESUME_COMMAND}". ${freshCheck(journal.from)} Orion may still be listed in ${product(journal.to)}; remove it there if you no longer use it.`;
      Object.assign(result,{reload_required:true,remaining_action:plugin.remaining_action});
    } else if (waiting) {
      result.remaining_action=`The waiting switch was cancelled. Orion may be listed in ${product(journal.to)}; remove it there if you no longer use it.`;
    }
    note(status,`${waiting?'cancelled switch':'restored'} from ${backupRel}`);
    writeStatus(root,status);
    journal.state=waiting?'cancelled':'restored';writeJson(join(backup,'journal.json'),journal);
    return result;
  }
  if(journal.state!=='complete') throw new Error(`Update backup is ${journal.state}; only completed updates can be restored`);
  // The package is restored as a unit, so a later edit inside it stops the whole restore first.
  if (journal.package && treeHash(safe(root,PACKAGE_ROOT))!==journal.package.installed_hash) {
    throw new Error(`Restore collision: ${PACKAGE_ROOT} changed after the update. Nothing was restored. Move your changes out of ${PACKAGE_ROOT} (keep them as a client skill under ${TOOL_LAYOUT[journal.ai_assistant]?.skillRoot || '.claude/skills or .agents/skills'}), put back the release's files or delete ${PACKAGE_ROOT}, then run "node update/apply.mjs restore --root . --backup ${backupRel}" again.`);
  }
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
  for(const key of journal.remove_status_checklist_keys) if(Object.hasOwn(old.checklist||{},key)) {status.checklist ||= {};status.checklist[key]=old.checklist[key];}
  status.template_version=old.template_version;
  const result={restored,kept,backup:backupRel};
  if (journal.package || journal.catalog) {
    // The tool must load the restored package before recovery can be claimed.
    const plugin=ensurePluginRegion(status);
    const tool=status.ai_assistant;
    plugin.setup_state='pending';
    plugin.pending_version=old.template_version;
    plugin.remaining_action=`Orion ${old.template_version} was restored. ${freshCheck(tool)}${tool==='codex'?` If Codex still shows a different Orion version, reinstall Orion from its Plugins Directory first.`:''}`;
    Object.assign(result,{reload_required:true,remaining_action:plugin.remaining_action});
  }
  note(status,`restored from ${backupRel}`);
  writeStatus(root,status);
  return result;
}

async function main() {
  const command=process.argv[2], root=arg('--root'); if(!root) throw new Error('--root is required');
  const repo=arg('--release-repo')||dirname(dirname(fileURLToPath(import.meta.url)));
  if (command==='update') return update(root,repo,arg('--commit'));
  if (command==='switch') return switchTool(root,repo,arg('--commit'),arg('--to'),arg('--legacy-tool'));
  if (command==='restore') return restore(root,arg('--backup'));
  if (command==='recover') return {recovered:[...await recoverPendingUpdates(root),...await recoverPendingSwitches(root)]};
  throw new Error('Use update, switch, restore or recover');
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=2;});
