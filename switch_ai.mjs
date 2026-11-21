#!/usr/bin/env node
/**
 * Switch this Orion folder between Codex and Claude Code, entirely on this machine.
 *
 *   node switch_ai.mjs                    switch to the other AI assistant
 *   node switch_ai.mjs --to claude-code   or name the one you want
 *   node switch_ai.mjs --to codex
 *
 * It moves every skill from one assistant's skills folder to the other's and records
 * the new assistant in status/status.json. No release, git or internet is needed.
 * It refuses to overwrite anything, and keeps a copy of the old skills and status in
 * .update-backup/ first. To undo a switch, run it again.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = { codex: '.agents/skills', 'claude-code': '.claude/skills' };
const TOP = { codex: '.agents', 'claude-code': '.claude' };
const NAME = { codex: 'Codex', 'claude-code': 'Claude Code' };
const TOOLS = Object.keys(SKILLS);

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const isSymlink = (path) => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } };
const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };

/** Every file under dir, as paths relative to it. Refuses symlinks and special files. */
function filesUnder(dir, label, prefix = '') {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) files.push(...filesUnder(join(dir, item.name), label, rel));
    else if (item.isFile()) files.push(rel);
    else throw new Error(`${label}/${rel} is a link or special file. Move it out of the way, then run this again.`);
  }
  return files;
}

function pruneEmpty(path) {
  if (!existsSync(path) || !lstatSync(path).isDirectory()) return;
  for (const item of readdirSync(path)) pruneEmpty(join(path, item));
  if (readdirSync(path).length === 0) rmdirSync(path);
}

/** The assistant this folder uses now: recorded in status, or read from the folder layout. */
function currentTool(root, status) {
  if (status.ai_assistant != null) {
    if (!TOOLS.includes(status.ai_assistant)) throw new Error(`status/status.json names an unknown AI assistant: ${status.ai_assistant}`);
    return status.ai_assistant;
  }
  const present = TOOLS.filter((tool) => existsSync(join(root, SKILLS[tool])));
  if (present.length !== 1) throw new Error('status/status.json does not say which AI assistant this folder uses, and the skills folders do not show it either.');
  return present[0];
}

export function switchAi(root, to) {
  const statusPath = join(root, 'status/status.json');
  if (!existsSync(statusPath)) throw new Error('No status/status.json here. Run this from inside your Orion folder.');
  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  const from = currentTool(root, status);
  to ??= TOOLS.find((tool) => tool !== from);
  if (!TOOLS.includes(to)) throw new Error(`Choose --to claude-code or --to codex (not ${to}).`);
  if (to === from) throw new Error(`This folder already uses ${NAME[from]}.`);

  for (const path of [TOP[from], SKILLS[from], TOP[to], SKILLS[to]]) {
    if (isSymlink(join(root, path))) throw new Error(`${path} is a link. Move it out of the way, then run this again.`);
  }
  const files = filesUnder(join(root, SKILLS[from]), SKILLS[from]);
  // Spec Kit skills were maintainer tooling and are not carried to the new assistant.
  const dropped = files.filter((rel) => rel.split('/')[0].startsWith('speckit-'));
  const moving = files.filter((rel) => !dropped.includes(rel));
  const collisions = moving.filter((rel) => existsSync(join(root, SKILLS[to], rel)) || isSymlink(join(root, SKILLS[to], rel)));
  if (collisions.length) {
    throw new Error(`Nothing was changed, because these files already exist in ${SKILLS[to]}:\n${collisions.map((rel) => `  ${SKILLS[to]}/${rel}`).join('\n')}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `.update-backup/switch-${from}-to-${to}-${stamp}`;
  const backup = join(root, backupRel);
  if (existsSync(backup)) throw new Error(`${backupRel} already exists. Wait a moment and run this again.`);
  for (const rel of files) copy(join(root, SKILLS[from], rel), join(backup, SKILLS[from], rel));
  copy(statusPath, join(backup, 'status/status.json'));

  const created = [];
  try {
    for (const rel of moving) {
      const target = join(root, SKILLS[to], rel);
      copy(join(root, SKILLS[from], rel), target);
      created.push(target);
    }
    for (const rel of files) rmSync(join(root, SKILLS[from], rel));
    pruneEmpty(join(root, SKILLS[from]));
    pruneEmpty(join(root, TOP[from]));
    status.ai_assistant = to;
    if (status.machine_profile && typeof status.machine_profile === 'object') status.machine_profile.chosen_surface = to;
    status.notes = [status.notes || '', `switched from ${from} to ${to}; backup in ${backupRel}`].filter(Boolean).join('\n');
    writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
  } catch (error) {
    // Put the folder back as it was: remove what was added, restore from the backup.
    for (const target of created) rmSync(target, { force: true });
    pruneEmpty(join(root, SKILLS[to]));
    pruneEmpty(join(root, TOP[to]));
    for (const rel of files) {
      const source = join(root, SKILLS[from], rel);
      if (!existsSync(source)) copy(join(backup, SKILLS[from], rel), source);
    }
    copy(join(backup, 'status/status.json'), statusPath);
    throw error;
  }
  return { from, to, moved: moving.map((rel) => `${SKILLS[to]}/${rel}`), dropped: dropped.map((rel) => `${SKILLS[from]}/${rel}`), backup: backupRel };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const root = arg('--root') || dirname(fileURLToPath(import.meta.url));
    const result = switchAi(root, arg('--to'));
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Switched this Orion folder from ${NAME[result.from]} to ${NAME[result.to]}.`);
      console.log(`Moved ${result.moved.length} skill file(s) to ${SKILLS[result.to]}.`);
      if (result.dropped.length) console.log(`Left out ${result.dropped.length} Spec Kit file(s); they are in the backup.`);
      console.log(`Backup of the old skills and status: ${result.backup}`);
      console.log(`Open this folder in ${NAME[result.to]} to carry on. To switch back, run: node switch_ai.mjs`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
