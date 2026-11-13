#!/usr/bin/env node
/** Create a separate, selected-tool client repository from this release. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, existsSync, lstatSync, readdirSync, renameSync, rmdirSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planForTool, fingerprint, safePath } from './update/destination-resolver.mjs';

const release = dirname(fileURLToPath(import.meta.url));
const usage = 'Usage: node install.mjs --tool <claude-code|codex> --target <new client folder> [--migrate-from <legacy checkout>] [--github-repo OWNER/NAME | --remote https://github.com/OWNER/NAME.git | --local-only]';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

function install() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const tool = arg('--tool');
  const targetArg = arg('--target');
  if (!tool || !targetArg || targetArg.startsWith('--')) throw new Error(usage);
  const target = resolve(targetArg);
  const releaseReal = realpathSync(release);
  const manifest = JSON.parse(readFileSync(join(release, 'update/manifest.json'), 'utf8'));
  const migrationArg=arg('--migrate-from');
  const migration=migrationArg && realpathSync(migrationArg);
  const githubRepo=arg('--github-repo'), remote=arg('--remote'), localOnly=process.argv.includes('--local-only');
  if([!!githubRepo,!!remote,localOnly].filter(Boolean).length!==1) throw new Error('Choose exactly one of --github-repo, --remote, or --local-only.');
  if(githubRepo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepo)) throw new Error('Expected --github-repo OWNER/NAME');
  const remoteRepo=remote?.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\.git)?$/)?.[1];
  if(remote && !remoteRepo) throw new Error('Expected an HTTPS GitHub repository URL.');
  const plan = planForTool(manifest.deployment, tool, { releaseRoot: release, root: target });
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
    status.selected_tool = tool;
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
      if(oldStatus.selected_tool && oldStatus.selected_tool!==tool) throw new Error('Legacy selected_tool differs; migrate with its current tool, then switch.');
      if(!oldStatus.selected_tool && tool!=='claude-code') throw new Error('Legacy layout without selected_tool requires --tool claude-code.');
      const pristine=JSON.parse(readFileSync(join(release,'update/pristine.json'),'utf8'));
      const planned=new Map(plan.map(entry=>[entry.destination,entry]));
      const excluded=['.git','.github','.codex','node_modules','install.mjs','n8n',...manifest.deployment.release_only.filter(path=>!path.includes('*')).map(path=>path.replace(/\/$/,'')),...(manifest.remove||[])];
      const skillRoot=tool==='codex'?'.agents/skills':'.claude/skills';
      const otherRoot=tool==='codex'?'.claude':'.agents';
      const excludedPath=path=>excluded.some(prefix=>path===prefix || path.startsWith(`${prefix}/`)) ||
        path===otherRoot || path.startsWith(`${otherRoot}/`) ||
        path==='status/shifts' || path.startsWith('status/shifts/') ||
        path==='status/status.json' || path==='status/status.schema-template.json' || path==='status/status-schema.md' ||
        /^status\/[^/]+\.mjs$/.test(path) ||
        path.startsWith(`${skillRoot}/speckit`);
      const copyTree=(path)=>{
        if(excludedPath(path)) return;
        const source=safePath(migration,path), dest=safePath(stage,path);
        if(!existsSync(source)) return;
        if(lstatSync(source).isSymbolicLink()) throw new Error(`Legacy symlink collision: ${path}`);
        if(lstatSync(source).isDirectory()) {
          for(const name of readdirSync(source)) copyTree(`${path}/${name}`);
        } else if(lstatSync(source).isFile()) {
          const entry=planned.get(path);
          if(entry && entry.ownership!=='client-template') {
            const known=pristine.files?.[entry.fingerprint_key]||[];
            if(known.includes(fingerprint(readFileSync(source)))) return;
          }
          mkdirSync(dirname(dest),{recursive:true});copyFileSync(source,dest);
        }
        else throw new Error(`Legacy special file: ${path}`);
      };
      for(const name of readdirSync(migration)) copyTree(name);
      oldStatus.selected_tool=tool;
      oldStatus.template_version=manifest.template_version;
      oldStatus.home={enabled:false,branch:'main'};
      oldStatus.notes=[oldStatus.notes||'','Saved schedules need to be wired again in this new folder.'].filter(Boolean).join('\n');
      oldStatus.notes=[oldStatus.notes||'',`migrated from legacy checkout to ${target}`].filter(Boolean).join('\n');
      writeFileSync(join(stage,'status/status.json'),JSON.stringify(oldStatus,null,2)+'\n');
    }
    const init = spawnSync('git', ['-C', stage, 'init', '-q', '-b', 'main'], { encoding: 'utf8' });
    if (init.status !== 0) throw new Error(`Could not create client repository: ${init.stderr.trim()}`);
    if(!localOnly) {
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
    console.log(`Created ${tool} client repository at ${target}`);
    console.log(localOnly?'GitHub repository pending: rerun with --github-repo or set up a private remote.':`Private GitHub repository provisioned: ${githubRepo||remoteRepo}`);
    console.log(`Next: cd ${JSON.stringify(target)} and run node start.mjs`);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}

try { install(); }
catch (error) { console.error(error.message); process.exitCode = 2; }
