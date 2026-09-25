#!/usr/bin/env node
/**
 * The notebook's hands — every script-shaped thing memory needs, in one file.
 *
 * Memory itself is just markdown in the memory/ folder (contract: docs/memory.md;
 * if any other file describes memory differently, that file wins). This script
 * only: creates the structure (init), moves it between machines (sync, git
 * backend only), appends lines (note), creates fact files (file), and answers
 * "is memory healthy?" (check).
 *
 * Postures copied from radio.mjs, deliberately:
 * - Memory off or misconfigured → every command prints ONE plain line, writes
 *   nothing, exits 0. Memory is never a reason a shift fails.
 * - Memory is radio-independent. The radio gate (radioOn) is never consulted
 *   here; the shift-log asymmetry extends: the local memory write never skips
 *   because the radio is off.
 * - Dependency-free: node builtins only. A sibling .mjs import is not a
 *   dependency (see shapes.mjs).
 *
 * Hard rule enforced here AND by the nightly dream agent: credentials never
 * enter memory. Writes that look like tokens or keys are refused with the
 * reason stated.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { memoryConfigured, memoryBlock, MEMORY_GIT_REMOTE_RE } from './shapes.mjs';

const HARNESS_ROOT = process.cwd();

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(path.join(HARNESS_ROOT, 'status', 'status.json'), 'utf8'));
  } catch {
    return null;
  }
}

function memoryRoot(status) {
  const p = memoryBlock(status).path || 'memory';
  return path.resolve(HARNESS_ROOT, p);
}

/** One line, exit 0 — the whole "off" posture. */
function offLine(reason) {
  console.log(`Memory is not set up (${reason}) — carrying on without it. docs/memory.md explains.`);
  process.exit(0);
}

/**
 * The credential tripwire. Narrow on purpose: broad patterns would refuse
 * honest sentences. The dream agent's nightly grep is the second net.
 */
const CREDENTIAL_RES = [
  /orion_[A-Za-z0-9_-]{20,}/,            // an install token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,  // a key file
  /\bsk-[A-Za-z0-9_-]{16,}/,             // API-key shapes
  /\b(password|passwd|api[_-]?key|client[_-]?secret)\s*[:=]\s*\S/i,
];
function credentialProblem(text) {
  for (const re of CREDENTIAL_RES) {
    if (re.test(text)) return 'that looks like a credential, and credentials never go into memory — keep it in the tool that owns it';
  }
  return null;
}

/** A memory path must stay inside the memory root and be markdown. */
function resolveInside(root, rel) {
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  if (!target.endsWith('.md')) return null;
  return target;
}

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function gitBackendReady(root) {
  return fs.existsSync(path.join(root, '.git'));
}

const SCAFFOLD = [
  ['INDEX.md', '# Memory index\n\nWhat this team knows, in one map. The dream agent maintains this file nightly;\nanyone may read it, and the client may edit anything here — it is their memory.\n\n- shared/ — team-wide truths (one small file per fact)\n- roles/ — memory by role area\n- agents/ — each agent\'s own log and learnings\n\nNothing listed yet — the first shifts will change that.\n'],
  ['shared/inbox.md', '# Inbox — proposals for the shared memory\n\nAny agent may append a line here when it believes something is true for the whole\nteam. The dream agent reads this nightly and folds accepted lines into shared/ as\nproper fact files. Format: `{date} | {agent} | {the proposed truth, one line}`\n'],
  ['roles/README.md', '# Roles\n\nOne folder per role area (sales/, ops/, recruitment/, ...), one small file per\nfact. An agent reads the role areas named in its `memory:` frontmatter — and not\nthe others; that is how a talent scout stays out of the sales ICP.\n'],
  ['agents/README.md', '# Agents\n\nOne folder per hired agent: `log.md` (its shift summaries, appended by the report\nstep) and `learning.md` (curated lessons the dream agent maintains — each with an\nID, a source, a rule, and a status of active, candidate, or superseded).\n'],
];

function ensureScaffold(root) {
  let made = 0;
  for (const [rel, content] of SCAFFOLD) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      made++;
    }
  }
  return made;
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return flags;
}

const [, , command, ...rest] = process.argv;
const flags = parseFlags(rest);
const status = readStatus();

if (!command || !['init', 'sync', 'note', 'file', 'check'].includes(command)) {
  console.log('Usage: node status/memory.mjs <init|sync|note|file|check> — contract in docs/memory.md');
  process.exit(0);
}

if (!status) offLine('no status/status.json here');
if (!memoryConfigured(status)) offLine('the memory block in status.json is off or misshapen');

const block = memoryBlock(status);
const root = memoryRoot(status);

if (command === 'init') {
  if (block.backend === 'git' && !fs.existsSync(root)) {
    if (!MEMORY_GIT_REMOTE_RE.test(block.remote || '')) offLine('git backend but no usable remote');
    const r = git(HARNESS_ROOT, ['clone', block.remote, root]);
    if (r.status !== 0) {
      console.log(`Couldn't clone the memory repo (${(r.stderr || '').trim().split('\n')[0] || 'git failed'}) — nothing written.`);
      process.exit(0);
    }
  }
  fs.mkdirSync(root, { recursive: true });
  const made = ensureScaffold(root);
  console.log(`Memory ready at ${path.relative(HARNESS_ROOT, root) || '.'} (${made} scaffold file${made === 1 ? '' : 's'} created, backend: ${block.backend}).`);
  process.exit(0);
}

if (!fs.existsSync(root)) {
  // Zero-setup promise: on the plain-folder backend the structure self-creates
  // the first time anything touches it. Only the git backend needs an explicit
  // init, because cloning a team repo is not something to do implicitly.
  if (block.backend === 'folder') {
    fs.mkdirSync(root, { recursive: true });
    ensureScaffold(root);
  } else {
    offLine('the memory folder does not exist yet — run: node status/memory.mjs init');
  }
}

if (command === 'sync') {
  if (block.backend !== 'git') {
    console.log('Memory backend is a plain folder — nothing to sync (the client\'s own sync tool owns that).');
    process.exit(0);
  }
  if (!gitBackendReady(root)) offLine('git backend but the memory folder is not a clone — run init');
  const pull = git(root, ['pull', '--rebase', '--autostash', '--quiet']);
  if (pull.status !== 0) console.log('Memory pull didn\'t go through — working from the local copy; the dream agent reconciles.');
  const dirty = (git(root, ['status', '--porcelain']).stdout || '').trim();
  if (dirty) {
    git(root, ['add', '-A']);
    const who = `${os.hostname()} ${new Date().toISOString().slice(0, 16)}`;
    git(root, ['commit', '-q', '-m', `memory: ${who}`]);
  }
  const push = git(root, ['push', '--quiet']);
  if (push.status !== 0) {
    console.log('Memory push didn\'t go through — your writes are safe locally and will sync next time.');
    process.exit(0);
  }
  console.log('Memory synced.');
  process.exit(0);
}

if (command === 'note') {
  const to = typeof flags.to === 'string' ? flags.to : '';
  const line = typeof flags.line === 'string' ? flags.line : '';
  if (!to || !line) { console.log('Usage: node status/memory.mjs note --to <path inside memory, .md> --line "<one line>"'); process.exit(0); }
  const target = resolveInside(root, to);
  if (!target) { console.log('A note lands inside the memory folder, in a .md file — that path is neither.'); process.exit(0); }
  const cred = credentialProblem(line);
  if (cred) { console.log(`Not written: ${cred}.`); process.exit(0); }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, line.endsWith('\n') ? line : line + '\n');
  console.log(`Noted in ${path.relative(root, target)}.`);
  process.exit(0);
}

if (command === 'file') {
  const rel = typeof flags.path === 'string' ? flags.path : '';
  const content = typeof flags.content === 'string' ? flags.content : '';
  if (!rel || !content) { console.log('Usage: node status/memory.mjs file --path <path inside memory, .md> --content "<the fact>" [--force]'); process.exit(0); }
  const target = resolveInside(root, rel);
  if (!target) { console.log('A fact file lives inside the memory folder, as .md — that path is neither.'); process.exit(0); }
  if (fs.existsSync(target) && flags.force !== true) { console.log(`${path.relative(root, target)} already exists — memory never silently overwrites; pass --force only when replacing it is the point.`); process.exit(0); }
  const cred = credentialProblem(content);
  if (cred) { console.log(`Not written: ${cred}.`); process.exit(0); }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.endsWith('\n') ? content : content + '\n');
  console.log(`Saved ${path.relative(root, target)}.`);
  process.exit(0);
}

if (command === 'check') {
  let count = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) count++;
    }
  })(root);
  let syncState = 'folder backend — the client\'s own sync tool owns movement';
  if (block.backend === 'git') {
    syncState = gitBackendReady(root) ? `git backend, remote ${block.remote}` : 'git backend but NOT a clone — run init';
  }
  console.log(`Memory: ${count} note${count === 1 ? '' : 's'} at ${path.relative(HARNESS_ROOT, root) || '.'} — ${syncState}.`);
  process.exit(0);
}
