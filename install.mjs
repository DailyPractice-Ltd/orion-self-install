#!/usr/bin/env node
/** Create a separate client repository for the chosen AI assistant from this release. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, existsSync, lstatSync, readdirSync, renameSync, rmdirSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planForTool } from './update/destination-resolver.mjs';
import { ensurePluginRegion } from './update/plugin-package.mjs';
import { statusTemplate } from './status/store.mjs';
import { checkFolder, describe, runPluginSetup, RESUME_COMMAND } from './update/plugin-setup.mjs';

const release = dirname(fileURLToPath(import.meta.url));
const usage = 'Usage: node install.mjs --tool <claude-code|codex> --target <new client folder> [--github-repo OWNER/NAME | --remote https://github.com/OWNER/NAME.git | --local-only]';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

/** A 1.x harness: its agent definition, or a status file from before 2.0.0. */
function isOrion1x(folder) {
  if (!lstatSync(folder).isDirectory()) return false;
  if (existsSync(join(folder, 'agent/agent-definition.md'))) return true;
  const statusPath = join(folder, 'status/status.json');
  if (!existsSync(statusPath)) return false;
  try {
    const version = JSON.parse(readFileSync(statusPath, 'utf8')).template_version;
    return typeof version !== 'string' || /^[01]\./.test(version);
  } catch {
    return false;
  }
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
  if (process.argv.includes('--migrate-from')) throw new Error('Orion 2.0.0 does not migrate an older folder. Install into a new, empty folder and follow agent/reinstall-from-1.x.md; the old folder is left alone.');
  const githubRepo=arg('--github-repo'), remote=arg('--remote'), localOnly=process.argv.includes('--local-only');
  if([!!githubRepo,!!remote,localOnly].filter(Boolean).length>1) throw new Error('Choose at most one of --github-repo, --remote, or --local-only.');
  const useLocal = !githubRepo && !remote;
  if(githubRepo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepo)) throw new Error('Expected --github-repo OWNER/NAME');
  const remoteRepo=remote?.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\.git)?$/)?.[1];
  if(remote && !remoteRepo) throw new Error('Expected an HTTPS GitHub repository URL.');
  const plan = planForTool(manifest.deployment, ai_assistant, { releaseRoot: release, root: target });
  const parent = dirname(target);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory()) throw new Error('The client folder parent must already exist.');
  const realTarget = join(realpathSync(parent), basename(target));
  const fromRelease = relative(releaseReal, realTarget);
  if (!fromRelease || (!fromRelease.startsWith(`..${sep}`) && fromRelease !== '..')) {
    throw new Error('Choose a client folder outside the release checkout.');
  }
  if (existsSync(target)) {
    if (isOrion1x(target)) throw new Error('This folder holds an Orion 1.x harness. Orion 2.0.0 installs into a new, empty folder: follow agent/reinstall-from-1.x.md. The existing folder was left alone.');
    if (!lstatSync(target).isDirectory() || readdirSync(target).length) throw new Error('The client folder must be new or empty; existing files were left alone.');
  }
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) throw new Error('git is required to create the client repository.');

  const stage = mkdtempSync(join(parent, `.${basename(target)}-install-`));
  try {
    // Record the choice before copying any release file into the staged harness.
    mkdirSync(join(stage, 'status'));
    const status = statusTemplate(release);
    status.ai_assistant = ai_assistant;
    writeFileSync(join(stage, 'status/status.json'), JSON.stringify(status, null, 2) + '\n');
    for (const entry of plan) {
      const destination = join(stage, entry.destination);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(release, entry.source), destination);
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
