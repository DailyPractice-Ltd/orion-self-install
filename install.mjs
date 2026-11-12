#!/usr/bin/env node
/** Create a separate, selected-tool client repository from this release. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, existsSync, lstatSync, readdirSync, renameSync, rmdirSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planForTool } from './update/destination-resolver.mjs';

const release = dirname(fileURLToPath(import.meta.url));
const usage = 'Usage: node install.mjs --tool <claude-code|codex> --target <new client folder>';

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
  const plan = planForTool(manifest.deployment, tool, { releaseRoot: release, root: target });
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
    const init = spawnSync('git', ['-C', stage, 'init', '-q', '-b', 'main'], { encoding: 'utf8' });
    if (init.status !== 0) throw new Error(`Could not create client repository: ${init.stderr.trim()}`);
    if (existsSync(target)) rmdirSync(target);
    renameSync(stage, target);
    console.log(`Created ${tool} client repository at ${target}`);
    console.log(`Next: cd ${JSON.stringify(target)} and run node start.mjs`);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}

try { install(); }
catch (error) { console.error(error.message); process.exitCode = 2; }
