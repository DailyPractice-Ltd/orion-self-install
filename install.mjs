#!/usr/bin/env node
/** Create a separate client repository for the chosen AI assistant from this release. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, existsSync, lstatSync, readdirSync, renameSync, rmdirSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planForTool, fingerprint, safePath } from './update/destination-resolver.mjs';
import { ensurePluginRegion } from './update/plugin-package.mjs';
import { checkFolder, describe, runPluginSetup, RESUME_COMMAND } from './update/plugin-setup.mjs';

const release = dirname(fileURLToPath(import.meta.url));
const usage = 'Usage: node install.mjs --tool <claude-code|codex> --target <new client folder> [--migrate-from <legacy checkout>] [--github-repo OWNER/NAME | --remote https://github.com/OWNER/NAME.git | --local-only]';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

async function install() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const ai_assistant = arg('--tool');
  const targetArg = arg('--target');
  if (!ai_assistant || !targetArg || targetArg.startsWith('--')) throw new Error(usage);
  const target = resolve(targetArg);
  const releaseReal = realpathSync(release);
  const manifest = JSON.parse(readFileSync(join(release, 'update/manifest.json'), 'utf8'));
  const migrationArg=arg('--migrate-from');
  const migration=migrationArg && realpathSync(migrationArg);
  const githubRepo=arg('--github-repo'), remote=arg('--remote'), localOnly=process.argv.includes('--local-only');
  if([!!githubRepo,!!remote,localOnly].filter(Boolean).length>1) throw new Error('Choose at most one of --github-repo, --remote, or --local-only.');
  const useLocal = !githubRepo && !remote;
  if(githubRepo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepo)) throw new Error('Expected --github-repo OWNER/NAME');
  const remoteRepo=remote?.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\.git)?$/)?.[1];
  if(remote && !remoteRepo) throw new Error('Expected an HTTPS GitHub repository URL.');
  const plan = planForTool(manifest.deployment, ai_assistant, { releaseRoot: release, root: target });
  if(migration && migration===releaseReal) throw new Error('Use a distinct legacy checkout for migration.');
  const parent = dirname(target);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory()) throw new Error('The client folder parent must already exist.');
  const realTarget = join(realpathSync(parent), basename(target));
  const fromRelease = relative(releaseReal, realTarget);
  if (!fromRelease || (!fromRelease.startsWith(`..${sep}`) && fromRelease !== '..')) {
    throw new Error('Choose a client folder outside the release checkout.');
  }
  if (existsSync(target)) {
    if (!lstatSync(target).isDirectory() || readdirSync(target).length) throw new Error('The client folder must be new or empty; existing files were left alone.');
  }
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) throw new Error('git is required to create the client repository.');

  const stage = mkdtempSync(join(parent, `.${basename(target)}-install-`));
  try {
    // Record the choice before copying any release file into the staged harness.
    mkdirSync(join(stage, 'status'));
    const status = JSON.parse(readFileSync(join(release, 'status/status.schema-template.json'), 'utf8'));
    status.ai_assistant = ai_assistant;
    writeFileSync(join(stage, 'status/status.json'), JSON.stringify(status, null, 2) + '\n');
    for (const entry of plan) {
      const destination = join(stage, entry.destination);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(release, entry.source), destination);
    }
    if(migration) {
      const oldStatusPath=join(migration,'status/status.json');
      if(!existsSync(oldStatusPath)) throw new Error('Legacy checkout has no status/status.json');
      const oldStatus=JSON.parse(readFileSync(oldStatusPath,'utf8'));
      const oldAssistant=oldStatus.ai_assistant;
      if(oldAssistant!=null && oldAssistant!==ai_assistant) throw new Error('Migrate with the AI assistant recorded in the legacy status, then switch.');
      if(oldAssistant==null && ai_assistant!=='claude-code') throw new Error('Legacy layout without a recorded AI assistant requires --tool claude-code.');
      const pristine=JSON.parse(readFileSync(join(release,'update/pristine.json'),'utf8'));
      const planned=new Map(plan.map(entry=>[entry.destination,entry]));
      const excluded=['.git','.github','.codex','node_modules','install.mjs','n8n','.specify','update/scaffold',...(ai_assistant==='codex'?['team']:[]),...manifest.deployment.release_only.filter(path=>!path.includes('*')).map(path=>path.replace(/\/$/,'')),...(manifest.remove||[])];
      const retired = new Map((manifest.deployment.retired || []).map(entry => [entry.destinations?.[ai_assistant], entry.fingerprint_key]));
      const skillRoot=ai_assistant==='codex'?'.agents/skills':'.claude/skills';
      const otherRoot=ai_assistant==='codex'?'.claude':'.agents';
      const excludedPath=path=>excluded.some(prefix=>path===prefix || path.startsWith(`${prefix}/`)) ||
        path===otherRoot || path.startsWith(`${otherRoot}/`) ||
        path==='status/shifts' || path.startsWith('status/shifts/') ||
        path==='status/status.json' || path==='status/status.schema-template.json' || path==='status/status-schema.md' ||
        /^status\/[^/]+\.mjs$/.test(path) ||
        path.startsWith(`${skillRoot}/speckit`);
      const collisions=[];
      const copyTree=(path)=>{
        if(excludedPath(path)) return;
        let archive = path;
        if (path.startsWith('.claude/agents/')) archive = `legacy/claude-agents/${path.slice('.claude/agents/'.length)}`;
        if (path.startsWith(`${skillRoot}/hire-agent/`)) archive = `legacy/hire-agent/${path.slice(`${skillRoot}/hire-agent/`.length)}`;
        const source=safePath(migration,path), dest=safePath(stage,archive);
        if(!existsSync(source)) return;
        if(lstatSync(source).isSymbolicLink()) throw new Error(`Legacy symlink collision: ${path}`);
        if(lstatSync(source).isDirectory()) {
          for(const name of readdirSync(source)) copyTree(`${path}/${name}`);
        } else if(lstatSync(source).isFile()) {
          const retiredKey = retired.get(path);
          if (retiredKey && (pristine.files?.[retiredKey] || []).includes(fingerprint(readFileSync(source)))) return;
          const entry=planned.get(path);
          if(entry && entry.ownership!=='client-template') {
            const sourceEntry=manifest.deployment.entries.find(item=>item.destinations?.[ai_assistant]===path);
            const known=[...(pristine.files?.[entry.fingerprint_key]||[]),...(pristine.files?.[sourceEntry?.fingerprint_key]||[])];
            if(known.includes(fingerprint(readFileSync(source)))) return;
          }
          if(entry && existsSync(dest) && fingerprint(readFileSync(source))!==fingerprint(readFileSync(dest))) collisions.push(path);
          mkdirSync(dirname(dest),{recursive:true});copyFileSync(source,dest);
        }
        else throw new Error(`Legacy special file: ${path}`);
      };
      for(const name of readdirSync(migration)) copyTree(name);
      // Preserve Codex job sheets from the pre-split agents/ and team/ layouts.
      if (ai_assistant === 'codex' && existsSync(safePath(migration, 'agents'))) {
        for (const name of readdirSync(safePath(migration, 'agents'))) {
          if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\.md$/.test(name)) continue;
          const source = safePath(migration, `agents/${name}`);
          if (!lstatSync(source).isFile()) throw new Error(`Legacy job sheet collision: agents/${name}`);
          if (name === 'README.md' && (pristine.files?.['agents/README.md'] || []).includes(fingerprint(readFileSync(source)))) continue;
          mkdirSync(safePath(stage, 'agents'), { recursive: true });
          copyFileSync(source, safePath(stage, `agents/${name}`));
        }
      }
      // Keep historical team/ files at their original paths.
      if(ai_assistant==='codex' && existsSync(safePath(migration,'team'))) {
        const oldJobs=safePath(migration,'team');
        if(!lstatSync(oldJobs).isDirectory()) throw new Error('Legacy team/ is not a directory');
        for(const name of readdirSync(oldJobs)) {
          if(!/^[A-Za-z0-9][A-Za-z0-9_-]*\.md$/.test(name)) continue;
          const source=safePath(migration,`team/${name}`);
          if(!lstatSync(source).isFile()) throw new Error(`Legacy job sheet collision: team/${name}`);
          const destination = safePath(stage, `team/${name}`);
          mkdirSync(dirname(destination), { recursive: true });
          copyFileSync(source, destination);
        }
      }
      const template=JSON.parse(readFileSync(join(release,'status/status.schema-template.json'),'utf8'));
      Object.assign(oldStatus,{...template,...oldStatus});
      oldStatus.checklist={...template.checklist,...oldStatus.checklist};
      delete oldStatus.checklist.n8n_wf01_imported;
      delete oldStatus.checklist.n8n_wf02_imported;
      oldStatus.sharing={...template.sharing,...oldStatus.sharing,pairing:{...template.sharing.pairing,...oldStatus.sharing?.pairing}};
      oldStatus.scopes={...template.scopes,...oldStatus.scopes};
      oldStatus.schema_version=template.schema_version;
      oldStatus.ai_assistant = ai_assistant;
      oldStatus.template_version=manifest.template_version;
      oldStatus.home={enabled:false,branch:'main'};
      oldStatus.notes=[oldStatus.notes||'','Review any schedules in the original folder before replacing them with native scheduled tasks.'].filter(Boolean).join('\n');
      oldStatus.notes=[oldStatus.notes||'',`migrated from legacy checkout to ${target}`].filter(Boolean).join('\n');
      writeFileSync(join(stage,'status/status.json'),JSON.stringify(oldStatus,null,2)+'\n');
      if(collisions.length) console.log(`Migration collisions (client edits preserved): ${collisions.sort().join(', ')}`);
    }
    // The plugin: this harness's catalog identity (made once) and the selected tool's
    // catalog only, both checked here in the stage. Registration waits for the final path.
    const stagedStatus = JSON.parse(readFileSync(join(stage, 'status/status.json'), 'utf8'));
    const { catalog_identity: identity } = ensurePluginRegion(stagedStatus, { create: true });
    writeFileSync(join(stage, 'status/status.json'), JSON.stringify(stagedStatus, null, 2) + '\n');
    const packageErrors = checkFolder(stage, { tool: ai_assistant, identity, version: manifest.template_version, write: true });
    if (packageErrors.length) throw new Error(`The Orion plugin package did not validate:\n  ${packageErrors.join('\n  ')}`);
    const init = spawnSync('git', ['-C', stage, 'init', '-q', '-b', 'main'], { encoding: 'utf8' });
    if (init.status !== 0) throw new Error(`Could not create client repository: ${init.stderr.trim()}`);
    if(!useLocal) {
      const name=githubRepo||remoteRepo;
      if(remoteRepo) {
        const view=spawnSync('gh',['api',`repos/${name}`,'--jq','.private'],{encoding:'utf8'});
        if(view.status!==0 || view.stdout.trim()!=='true') throw new Error(`GitHub repository ${name} must exist and be private.`);
      }
      const prepare=spawnSync(process.execPath,[join(stage,'status/home.mjs'),'prepare',...(remoteRepo?['--remote',remote]:[]),'--yes'],{encoding:'utf8',cwd:stage});
      if(prepare.status!==0 || !JSON.parse(readFileSync(join(stage,'status/status.json'),'utf8')).home?.enabled) {
        throw new Error(`Could not prepare the private repository home: ${prepare.stderr.trim() || prepare.stdout.trim()}`);
      }
      const add=spawnSync('git',['-C',stage,'add','.'],{encoding:'utf8'});
      if(add.status!==0) throw new Error(add.stderr.trim());
      const commit=spawnSync('git',['-C',stage,'-c','user.name=Orion installer','-c','user.email=installer@users.noreply.github.com','commit','-qm','Install Orion harness'],{encoding:'utf8'});
      if(commit.status!==0) throw new Error(`Could not commit client repository: ${commit.stderr.trim()}`);
      if(githubRepo) {
        const create=spawnSync('gh',['repo','create',githubRepo,'--private','--source',stage,'--remote','origin','--push'],{encoding:'utf8'});
        if(create.status!==0) throw new Error(`Could not create private GitHub repository: ${create.stderr.trim()}`);
      } else {
        const push=spawnSync('git',['-C',stage,'push','-u','origin','main'],{encoding:'utf8'});
        if(push.status!==0) throw new Error(`Could not push to private GitHub repository: ${push.stderr.trim()}`);
      }
    }
    if (existsSync(target)) rmdirSync(target);
    renameSync(stage, target);
    console.log(`Created ${ai_assistant} client repository at ${target}`);
    console.log(useLocal?'Local Git repository ready; a private GitHub remote can be added later.':`Private GitHub repository provisioned: ${githubRepo||remoteRepo}`);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
  // Only now, at its final path, is the harness registered with the selected tool.
  let plugin;
  try { plugin = await runPluginSetup(target, { mode: 'setup' }); }
  catch (error) { plugin = { setup_state: 'failed', tool: ai_assistant, reason: error.message, errors: [], remaining_action: `Plugin setup stopped before it could finish (${error.message}). Your new folder is installed and keeps its progress: from that folder run "${RESUME_COMMAND}" to try again.` }; }
  console.log(describe(plugin));
  console.log(`Next: cd ${JSON.stringify(target)} and run node start.mjs`);
  if (plugin.setup_state === 'failed') process.exitCode = 3;
}

try { await install(); }
catch (error) { console.error(error.message); process.exitCode = 2; }
