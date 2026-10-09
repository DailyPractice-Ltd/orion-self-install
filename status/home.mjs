#!/usr/bin/env node
/**
 * A home for this folder: a private repository its owner controls.
 *
 *   node status/home.mjs check
 *   node status/home.mjs prepare [--remote <address>] [--yes]
 *   node status/home.mjs sync [--message "<a few labels>"]
 *
 * What it is for. A harness folder lives on one machine. That is enough until
 * something else needs it: a backup, a second machine, or a shift that runs in
 * the cloud. A cloud shift works on a fresh copy of the folder, fetched from a
 * repository, on a machine that is thrown away when the shift ends. The home is
 * that repository. It is private and it belongs to the folder's owner. Daily
 * Practice has no part in it and cannot read it. Nothing here touches the radio.
 *
 *   check     Looks, and changes nothing. It says what stands between this
 *             folder and a home: a key that would travel with it, an ignore
 *             rule that is missing, a line in some file that is shaped like a
 *             key, a repository sitting inside this one.
 *
 *   prepare   Makes the folder ready, on this machine only. Without --yes it
 *             says what it would do. With --yes it does it:
 *               - makes the folder a git repository, if it is not one yet
 *               - moves the radio key out of status/status.json and into
 *                 status/radio.key, a file that is never saved to the home
 *               - sets the ignore rules: the key, this machine's wake-up files
 *                 and local settings stay behind, and status.json, now holding
 *                 no key, travels. A notebook kept in a plain folder travels
 *                 too. A notebook with a repository of its own stays out.
 *               - marks the logs as append-only, so two machines adding a
 *                 line each never clash
 *               - notes the home's address when --remote gives one
 *               - switches the home on in status.json (home.enabled)
 *             It never creates a repository anywhere and it sends nothing.
 *             Creating the private repository is the owner's step.
 *
 *   sync      Saves what changed here to the home, and brings in what is new
 *             there. status/done.mjs runs it after every finished piece of
 *             work once the home is on, so nobody has to remember it.
 *
 * Three rules sync keeps.
 *
 *   1. The key is never saved. status/radio.key is taken out of a save even if
 *      someone deleted its ignore rule. A key found in status.json is moved to
 *      status/radio.key first. Any file about to be saved with a new line that
 *      is shaped like a key is held back and named, and everything else is
 *      saved without it.
 *   2. It never blocks work. Whatever goes wrong, it prints plain lines and
 *      exits 0. The folder on this machine is always left usable.
 *   3. It never loses work. When the home has changes that clash with this
 *      folder's, this machine keeps its own copy untouched. On a cloud run,
 *      where the machine is about to be thrown away, the work is parked in the
 *      home on a branch named unsaved/..., and the line says so.
 *
 * Home off (the default): sync prints one line and never runs git, so a
 * harness that never asked for a home is not touched by any of this.
 *
 * Dependency-free: node built-ins, its sibling shapes.mjs, and the git that is
 * already on the machine. No package.json, no npm install.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  homeBlock, homeOn, isHomeBranch, isCloudRun, memoryBlock, looksLikeKey, looksLikeCredential,
  INSTALL_TOKEN_RE, RADIO_KEY_FILE,
} from './shapes.mjs';

const STATUS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(STATUS_DIR, '..');
const STATUS_PATH = path.join(STATUS_DIR, 'status.json');
const KEY_PATH = path.join(STATUS_DIR, RADIO_KEY_FILE);
const KEY_REL = `status/${RADIO_KEY_FILE}`;

/**
 * A git call that waits on a network is given a limit, so a shift never hangs
 * on it. Looking is quick or it is broken. Sending may be the whole folder.
 */
const GIT_TIMEOUT_MS = 60000;
const LOOK_TIMEOUT_MS = 30000;
const SEND_TIMEOUT_MS = 150000;
/** A file bigger than this is not read for key shapes: it is data, not something a person wrote. */
const SCAN_MAX_BYTES = 2 * 1024 * 1024;
/** GitHub refuses a file over 100 MB. Say so before the save fails on it. */
const BIG_FILE_BYTES = 95 * 1024 * 1024;
const PUSH_TRIES = 3;

const say = (line) => console.log(line);

// ── Arguments ───────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
  const name = rest[i].slice(2);
  flags[name] = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : true;
}

if (!['check', 'prepare', 'sync'].includes(command)) {
  say('Usage: node status/home.mjs <check | prepare [--remote <address>] [--yes] | sync [--message "<labels>"]>');
  say('Details in the header of this file.');
  process.exit(command ? 1 : 0);
}

// ── git, kept on a short lead ───────────────────────────────────────────────

/**
 * One git call inside this folder. It never asks a question (nobody may be
 * there to answer), and it never throws: the caller reads what happened. git is
 * asked to speak plainly (LC_ALL=C), so the one reason passed on to a person
 * reads the same on every machine. Nothing here decides anything by reading
 * git's words: a machine whose git speaks French taught that on the first run.
 */
function git(args, { input, timeout = GIT_TIMEOUT_MS } = {}) {
  const r = spawnSync('git', ['-C', ROOT, '-c', 'core.quotepath=off', ...args], {
    encoding: 'utf8',
    input,
    timeout,
    maxBuffer: 1 << 27,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  });
  return {
    ok: r.status === 0 && !r.error,
    code: r.status,
    out: r.stdout || '',
    err: r.stderr || '',
    missing: r.error?.code === 'ENOENT',
  };
}

/** The first line git said about a failure, for one plain sentence. Never a stack of them. */
function firstLine(text) {
  const line = String(text || '').split('\n').map((l) => l.trim()).find((l) => l && !/^hint:/i.test(l));
  // An address may carry a name and a password in front of its host. Never repeat those.
  return (line || 'git gave no reason').replace(/^(fatal|error|remote):\s*/i, '').replace(/\/\/[^@/\s]*@/g, '//').slice(0, 160);
}

/**
 * 'own': this folder is a repository. 'inside': it sits in someone else's. 'none': no repository.
 *
 * git is asked where this folder sits inside its repository, and "nowhere, it
 * is the top" is the answer wanted. Comparing two spellings of the folder's
 * path instead went wrong on Windows, where one folder has a long name and a
 * short one (RUNNER~1) and git and Node each picked a different one.
 */
function repoState() {
  const inside = git(['rev-parse', '--show-prefix']);
  if (!inside.ok) return { state: 'none' };
  if (inside.out.trim() === '') return { state: 'own' };
  return { state: 'inside', where: git(['rev-parse', '--show-toplevel']).out.trim() };
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeStatus(status) {
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');
}

// ── The key leaves status.json ──────────────────────────────────────────────

/** True when status.json itself holds a well-shaped key. */
function keyInStatus(status) {
  return INSTALL_TOKEN_RE.test(String(status?.sharing?.install_token || '').trim());
}

/**
 * Move the key from status.json to status/radio.key. The key file is written
 * and read back before the field is cleared, so a failure half-way leaves the
 * key where it was. Never prints the key.
 */
function moveKeyOut(status) {
  const token = String(status.sharing.install_token).trim();
  fs.writeFileSync(KEY_PATH, token + '\n', { mode: 0o600 });
  // The mode above only counts when the file is new. One that was already there
  // keeps whatever it had, so say it again.
  try { fs.chmodSync(KEY_PATH, 0o600); } catch { /* a disk with no modes: nothing to tighten */ }
  if (fs.readFileSync(KEY_PATH, 'utf8').trim() !== token) {
    throw new Error('the key file did not read back as written');
  }
  status.sharing.install_token = null;
  writeStatus(status);
}

/** The key already in status/radio.key, or '' when there is none or it is not shaped like one. */
function keyInFile() {
  try {
    const text = fs.readFileSync(KEY_PATH, 'utf8').trim();
    return INSTALL_TOKEN_RE.test(text) ? text : '';
  } catch {
    return '';
  }
}

// ── The ignore rules and the append-only logs ───────────────────────────────

const NEVER_SAVED = [
  KEY_REL,                          // the radio key
  'status/shifts/',                 // wake-up files: full paths that only mean something on one machine
  '.update-backup/',                // an update's safety copies, older keys among them
  '.DS_Store',
  'node_modules/',
  '.env',
  '.env.*',
  '.claude/settings.local.json',    // one machine's own permissions
  '.claude/worktrees/',             // working copies an app made, each a repository of its own
];
/** The template's own two notebook lines: everything in memory/ stays out, bar its README. */
const NOTEBOOK_RULES = ['memory/*', '!memory/README.md'];
const APPEND_ONLY = [
  'status/shift-log.md',
  'status/work-log.md',
  'memory/**/log.md',
  'memory/shared/inbox.md',
];

const readLines = (file) => {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
};
const sameRule = (a, b) => a.trim().replace(/^\//, '') === b;

/**
 * What .gitignore should say once the folder has a home. The owner's own lines
 * are kept as they are. A notebook in a plain folder has nowhere else to be
 * saved, so it travels with the folder. A notebook with a repository of its
 * own is saved there, and stays out of this one.
 */
function wantedIgnore(status) {
  const memory = memoryBlock(status);
  const ownRepository = memory.enabled === true && memory.backend === 'git';
  // The template's two notebook lines go either way. In a plain folder the
  // notebook then travels. With a repository of its own it stays out whole,
  // README included: that README belongs to the notebook's repository and a
  // second copy here would only go stale. A `memory/` line the owner wrote
  // themselves is theirs and is never removed.
  const drop = ['status/status.json', ...NOTEBOOK_RULES];
  const need = [...NEVER_SAVED, ...(ownRepository ? ['memory/'] : [])];

  const kept = readLines('.gitignore').filter((line) => !drop.some((rule) => sameRule(line, rule)));
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const missing = need.filter((rule) => !kept.some((line) => sameRule(line, rule)));
  if (missing.length > 0) {
    if (kept.length > 0) kept.push('');
    kept.push('# Never saved to the folder\'s home (status/home.mjs)', ...missing);
  }
  return kept.join('\n') + '\n';
}

/** What .gitattributes should say: each log takes lines from both sides instead of clashing. */
function wantedAttributes() {
  const kept = readLines('.gitattributes');
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const missing = APPEND_ONLY
    .map((file) => `${file} merge=union`)
    .filter((rule) => !kept.some((line) => line.trim() === rule));
  if (missing.length > 0) {
    if (kept.length > 0) kept.push('');
    kept.push('# Append-only logs: two machines adding a line each never clash (status/home.mjs)', ...missing);
  }
  return kept.join('\n') + '\n';
}

const fileText = (file) => {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
};

// ── Looking for key shapes ──────────────────────────────────────────────────

/** Line numbers in a text that are shaped like a key. Numbers only: the line itself is never repeated. */
function keyLines(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (looksLikeKey(lines[i])) hits.push(i + 1);
  return hits;
}

/**
 * Everything a first save would send: files git already follows, and files it
 * would start following. `nested` are repositories sitting inside this one,
 * which git lists as a folder name ending in a slash.
 */
function candidates() {
  const list = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).out.split('\0').filter(Boolean);
  return {
    files: list.filter((p) => !p.endsWith('/')),
    nested: list.filter((p) => p.endsWith('/')),
  };
}

function scanFiles(files) {
  const keys = [];
  const worthALook = [];
  const big = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let st;
    try { st = fs.lstatSync(abs); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.size > BIG_FILE_BYTES) big.push(rel);
    if (st.size > SCAN_MAX_BYTES) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue; // not text
    const hits = keyLines(text);
    if (hits.length > 0) keys.push({ file: rel, lines: hits });
    else if (text.split('\n').some((line) => looksLikeCredential(line))) worthALook.push(rel);
  }
  return { keys, worthALook, big };
}

// ── check ───────────────────────────────────────────────────────────────────

/** What stands between this folder and a home. Each entry is one plain line. Changes nothing. */
function findings(status) {
  const blockers = [];
  const notes = [];

  if (git(['--version']).missing) {
    blockers.push('git is not on this machine. A home is a git repository, so install git first.');
    return { blockers, notes };
  }
  const repo = repoState();
  if (repo.state === 'inside') {
    blockers.push(`This folder sits inside another repository (${repo.where}). A home has to be this folder's own. Move the folder out of it first.`);
    return { blockers, notes };
  }
  if (repo.state === 'none') {
    blockers.push('This folder is not a git repository yet. prepare makes it one.');
    return { blockers, notes };
  }

  if (keyInStatus(status)) {
    blockers.push('The radio key is inside status/status.json, which travels to the home. prepare moves it to status/radio.key.');
  }
  if (!git(['check-ignore', '-q', '--', KEY_REL]).ok) {
    blockers.push(`${KEY_REL} is not on the ignore list. prepare adds it.`);
  }
  if (git(['ls-files', '--error-unmatch', '--', KEY_REL]).ok) {
    blockers.push(`${KEY_REL} is already followed by git. sync takes it out of the next save, but an earlier save may hold it.`);
  }
  if (git(['check-ignore', '-q', '--', 'status/status.json']).ok) {
    blockers.push('status/status.json is on the ignore list, so a fresh copy of this folder would not know who it is. prepare takes it off.');
  }
  if (!homeOn(status)) blockers.push('The home is not switched on in status/status.json (home.enabled). prepare switches it on.');
  if (!git(['remote', 'get-url', 'origin']).ok) {
    blockers.push('This folder has no address for its home yet. Create an empty private repository, then: node status/home.mjs prepare --remote <its address> --yes');
  }

  const { files, nested } = candidates();
  const scan = scanFiles(files);
  for (const hit of scan.keys) {
    // status.json's own key is already named above, with its fix.
    if (hit.file === 'status/status.json' && keyInStatus(status)) continue;
    blockers.push(`${hit.file}, line ${hit.lines.slice(0, 5).join(', ')}: shaped like a key. Take the key out, or sync holds this file back.`);
  }
  for (const dir of nested) {
    notes.push(`${dir} is a repository of its own. It is left out of every save. Add it to .gitignore to stop hearing about it.`);
  }
  for (const file of scan.big) {
    notes.push(`${file} is too big for a repository to take. Add it to .gitignore.`);
  }
  if (scan.worthALook.length > 0) {
    notes.push(`Worth one look, a line mentions a password or an API key by name: ${scan.worthALook.slice(0, 8).join(', ')}${scan.worthALook.length > 8 ? ', and more' : ''}.`);
  }

  // An earlier save may already hold a radio key. Found by shape only.
  if (git(['rev-parse', '--verify', '-q', 'HEAD']).ok) {
    const old = git(['log', '--all', '--format=%h', '-G', 'orion_[A-Za-z0-9_-]{20,}']);
    const commits = [...new Set(old.out.split('\n').filter(Boolean))];
    if (commits.length > 0) {
      blockers.push(`An earlier save holds a line shaped like a radio key (${commits.slice(0, 5).join(', ')}). It would travel with the history. Ask Daily Practice for a fresh pairing code, so the old key stops working, before the first save.`);
    }
  }
  return { blockers, notes };
}

if (command === 'check') {
  const status = readStatus();
  if (!status) {
    say('No readable status/status.json here, so there is nothing to give a home to yet. Run  node start.mjs  first.');
    process.exit(0);
  }
  const { blockers, notes } = findings(status);
  if (blockers.length === 0) {
    const origin = git(['remote', 'get-url', 'origin']).out.trim();
    say(`Ready. The home is on (branch ${homeBlock(status).branch}), at ${origin.replace(/\/\/[^@/]*@/, '//')}.`);
    say('The radio key stays on this machine. To save now: node status/home.mjs sync');
  } else {
    say(`Not ready for a home yet. ${blockers.length} thing${blockers.length === 1 ? '' : 's'} to sort out:`);
    for (const line of blockers) say(`- ${line}`);
  }
  for (const line of notes) say(`Note: ${line}`);
  process.exit(0);
}

// ── prepare ─────────────────────────────────────────────────────────────────

/** An address git can save to: a web or ssh address, or a folder that exists (a shared drive counts). */
function remoteProblem(value) {
  if (typeof value !== 'string' || value.length === 0) return '--remote needs the address of the empty private repository.';
  if (/\s/.test(value)) return 'An address has no spaces in it.';
  if (/^(https:\/\/|ssh:\/\/|git@|file:\/\/)\S+$/.test(value)) return null;
  if (fs.existsSync(value) && fs.statSync(value).isDirectory()) return null;
  return `"${value}" is not an address git can save to. It starts with https:// or git@, or it is a folder on this machine.`;
}

if (command === 'prepare') {
  const status = readStatus();
  if (!status) {
    say('No readable status/status.json here, so there is nothing to give a home to yet. Run  node start.mjs  first.');
    process.exit(0);
  }
  if (git(['--version']).missing) {
    say('git is not on this machine. A home is a git repository, so install git first. Nothing was changed.');
    process.exit(0);
  }
  const repo = repoState();
  if (repo.state === 'inside') {
    say(`This folder sits inside another repository (${repo.where}). A home has to be this folder's own.`);
    say('Move the folder out of it first. Nothing was changed.');
    process.exit(0);
  }
  if (flags.remote !== undefined) {
    const problem = remoteProblem(flags.remote);
    if (problem) {
      say(`${problem} Nothing was changed.`);
      process.exit(1);
    }
  }

  // Every step is worked out first and named. Nothing runs without --yes.
  const steps = [];
  if (repo.state === 'none') {
    steps.push({
      what: 'Make this folder a git repository.',
      run() {
        if (!git(['init', '-q', '-b', 'main']).ok) {
          // An older git has no -b. Same result in two moves.
          git(['init', '-q']);
          git(['symbolic-ref', 'HEAD', 'refs/heads/main']);
        }
      },
    });
  }
  if (keyInStatus(status)) {
    steps.push({
      what: `Move the radio key out of status/status.json and into ${KEY_REL}, which is never saved to the home.`,
      run: () => moveKeyOut(status),
    });
  }
  const ignore = wantedIgnore(status);
  if (ignore !== fileText('.gitignore')) {
    steps.push({
      what: `Set the ignore rules: ${KEY_REL} and this machine's own files stay behind, and status/status.json travels.`,
      run: () => fs.writeFileSync(path.join(ROOT, '.gitignore'), ignore),
    });
  }
  const notebook = memoryBlock(status);
  if (notebook.enabled === true && notebook.backend === 'git' && repo.state === 'own' &&
      git(['ls-files', '--', 'memory']).out.trim() !== '') {
    steps.push({
      what: 'Stop following the files in memory/: that notebook has a repository of its own, and a second copy here would only go stale.',
      run: () => { git(['rm', '-r', '--cached', '--quiet', '--', 'memory']); },
    });
  }
  const attributes = wantedAttributes();
  if (attributes !== fileText('.gitattributes')) {
    steps.push({
      what: 'Mark the logs as append-only, so two machines adding a line each never clash.',
      run: () => fs.writeFileSync(path.join(ROOT, '.gitattributes'), attributes),
    });
  }
  if (flags.remote !== undefined) {
    const now = repo.state === 'own' ? git(['remote', 'get-url', 'origin']) : { ok: false };
    if (!now.ok) {
      steps.push({
        what: `Note the home's address: ${flags.remote}`,
        run: () => { git(['remote', 'add', 'origin', flags.remote]); },
      });
    } else if (now.out.trim() !== flags.remote) {
      say(`This folder already has a home address (${now.out.trim().replace(/\/\/[^@/]*@/, '//')}). It was left as it is.`);
    }
  }
  if (!homeOn(status)) {
    steps.push({
      what: 'Switch the home on in status/status.json (home.enabled).',
      run() {
        const here = repoState().state === 'own' ? git(['symbolic-ref', '--short', '-q', 'HEAD']).out.trim() : '';
        const fresh = readStatus() || status;
        fresh.home = { ...homeBlock(fresh), enabled: true, branch: isHomeBranch(here) ? here : 'main' };
        writeStatus(fresh);
      },
    });
  }

  if (steps.length === 0) {
    say('Nothing to prepare: this folder is already set up for a home.');
  } else if (flags.yes === undefined) {
    say('This would, on this machine only:');
    for (const step of steps) say(`- ${step.what}`);
    say('Nothing is created anywhere and nothing is sent. To do it: node status/home.mjs prepare --yes');
    process.exit(0);
  } else {
    for (const step of steps) {
      try {
        step.run();
        say(`Done: ${step.what}`);
      } catch (err) {
        say(`Could not: ${step.what} (${err?.code || err?.message || 'unknown'}). Stopped there. Nothing was sent.`);
        process.exit(0);
      }
    }
  }

  const after = readStatus() || status;
  const { blockers, notes } = findings(after);
  if (blockers.length === 0) {
    say('Ready. The first save: node status/home.mjs sync');
  } else {
    say(`Still to sort out before the first save:`);
    for (const line of blockers) say(`- ${line}`);
  }
  for (const line of notes) say(`Note: ${line}`);
  process.exit(0);
}

// ── sync ────────────────────────────────────────────────────────────────────

/**
 * Take out of the save what must never be in it. Returns what was held back,
 * each with a plain reason. Runs after `git add -A`, before the commit.
 */
function holdBack() {
  const held = [];

  // The key file, whatever the ignore rules say today.
  if (git(['ls-files', '--error-unmatch', '--', KEY_REL]).ok) {
    git(['rm', '--cached', '--quiet', '--', KEY_REL]);
    held.push({ file: KEY_REL, why: 'it is the radio key, and the key is never saved' });
  }

  // --no-renames: a file that was moved and edited in one go must read as a new
  // file here, or its lines would never be looked at.
  const WHAT = ['diff', '--cached', '--no-renames'];
  const names = (filter) => git([...WHAT, '--name-only', '-z', `--diff-filter=${filter}`]).out.split('\0').filter(Boolean);
  const added = new Set(names('A'));

  // A repository inside this one would be saved as a bare pointer to it, which
  // is no use to anyone. Leave it out.
  const links = git(['ls-files', '-s', '-z']).out.split('\0')
    .filter((entry) => entry.startsWith('160000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1));
  for (const link of links) {
    if (!added.has(link)) continue;
    git(['rm', '--cached', '--quiet', '--', link]);
    held.push({ file: `${link}/`, why: 'it is a repository of its own' });
  }

  // New lines shaped like a key. Only what this save adds is read, so a file
  // that was already in the home is not judged again every time. git is asked
  // once for the whole save, and its answer is cut into one piece per file:
  // the pieces come in the same order as the names. A first save can be
  // hundreds of files, and one question each would be hundreds of git runs.
  // If the pieces and the names ever fail to line up, each file is asked about
  // on its own instead, which is slower and cannot be wrong.
  const changed = names('AM');
  const PATCH = [...WHAT, '--no-color', '--no-ext-diff', '-U0', '--diff-filter=AM'];
  const whole = git(PATCH);
  let pieces = whole.ok ? whole.out.split(/^(?=diff --git )/m).filter(Boolean) : [];
  if (pieces.length !== changed.length) pieces = changed.map((file) => git([...PATCH, '--', file]).out);
  changed.forEach((file, i) => {
    if (links.includes(file) || file === KEY_REL) return;
    let lineNo = 0;
    let hit = 0;
    for (const line of pieces[i].split('\n')) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      if (hunk) { lineNo = Number(hunk[1]); continue; }
      // Before the first hunk a line starting with + is the file's own header.
      if (lineNo === 0 || !line.startsWith('+')) continue;
      if (looksLikeKey(line.slice(1))) { hit = lineNo; break; }
      lineNo++;
    }
    if (!hit) return;
    if (added.has(file)) git(['rm', '--cached', '--quiet', '--', file]);
    else git(['reset', '--quiet', 'HEAD', '--', file]);
    held.push({ file, why: `line ${hit} is shaped like a key` });
  });
  return held;
}

/** `YYYYMMDD-HHMMSS`, in UTC, for the name of a parking branch. */
function stamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

if (command === 'sync') {
  const status = readStatus();
  if (!status) {
    say('No readable status/status.json here, so there is no home to save to.');
    process.exit(0);
  }
  if (!homeOn(status)) {
    say('This folder has no home switched on. Nothing was saved and nothing was fetched.');
    process.exit(0);
  }
  if (git(['--version']).missing) {
    say('git is not on this machine, so the folder could not be saved to its home. Nothing is lost here.');
    process.exit(0);
  }
  const repo = repoState();
  if (repo.state !== 'own') {
    say('The home is switched on, but this folder is not a repository of its own. Run: node status/home.mjs check');
    process.exit(0);
  }
  if (!git(['remote', 'get-url', 'origin']).ok) {
    say('The home is switched on, but this folder has no address for it. Run: node status/home.mjs check');
    process.exit(0);
  }
  // A save of ours that was cut off half-way (a machine going to sleep, a time
  // limit) leaves its own mark. That one is ours to undo, and undoing it puts
  // the folder back exactly as it was before that save began.
  const ourMark = path.resolve(ROOT, git(['rev-parse', '--git-path', 'orion-home-sync']).out.trim() || '.git/orion-home-sync');
  if (fs.existsSync(ourMark)) {
    git(['rebase', '--abort']);
    fs.rmSync(ourMark, { force: true });
  }
  // Someone's own git work, half done. Not ours to finish or to undo.
  for (const mark of ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
    const where = git(['rev-parse', '--git-path', mark]).out.trim();
    if (where && fs.existsSync(path.resolve(ROOT, where))) {
      say('This folder is in the middle of a git step that someone started. It was left exactly as it is, and nothing was saved.');
      process.exit(0);
    }
  }

  const branch = homeBlock(status).branch;
  const cloud = isCloudRun();

  // A key that found its way back into status.json (a fresh pairing, say) is
  // moved out before anything is saved.
  const already = keyInFile();
  if (keyInStatus(status) && already && already !== String(status.sharing.install_token).trim()) {
    // Two different keys, and no way to tell here which is the live one. The
    // key file is where a folder with a home keeps its key, so that one stays.
    status.sharing.install_token = null;
    writeStatus(status);
    say(`status/status.json held a second radio key. It was taken out, and the key in ${KEY_REL} was kept. If the radio answers "that key isn't valid", pair again: node start.mjs`);
  } else if (keyInStatus(status)) {
    try {
      moveKeyOut(status);
      say(`The radio key was inside status/status.json. It is now in ${KEY_REL}, which is never saved.`);
    } catch {
      say('The radio key is inside status/status.json and could not be moved out, so nothing was saved. Run: node status/home.mjs check');
      process.exit(0);
    }
  }

  // A commit needs a name on it. Use the machine's own when it has one.
  const who = String(status.agent_name || '').replace(/[<>\n\r]/g, '').trim() || 'Orion harness';
  const ident = git(['config', 'user.email']).ok
    ? []
    : ['-c', `user.name=${who}`, '-c', 'user.email=harness@orion.invalid'];

  // A repository sitting inside this one (a working copy an app made, a clone
  // someone dropped in) is never part of a save. It is named to git up front:
  // one that has no commit yet would otherwise stop the whole save.
  const nested = candidates().nested;
  const staged = git(['add', '-A', '--', '.', ...nested.map((dir) => `:(exclude,literal)${dir.slice(0, -1)}`)]);
  if (!staged.ok) {
    say(`The folder could not be saved to its home this time (${firstLine(staged.err)}). Nothing is lost on this machine.`);
    process.exit(0);
  }
  const held = [
    ...nested.map((dir) => ({ file: dir, why: 'it is a repository of its own' })),
    ...holdBack(),
  ];

  let committed = false;
  if (git(['diff', '--cached', '--quiet']).code === 1) {
    const from = cloud ? 'a cloud run' : os.hostname();
    const label = typeof flags.message === 'string' && flags.message.trim()
      ? flags.message.replace(/\s+/g, ' ').trim().slice(0, 200)
      : 'saved';
    let commit = git([...ident, 'commit', '--quiet', '-m', `${label} (${from})`]);
    if (!commit.ok) {
      // A machine set up to sign every commit, whose signing is not working
      // right now, must not cost a shift its line. Save it unsigned.
      commit = git([...ident, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', `${label} (${from})`]);
    }
    if (!commit.ok) {
      say(`The folder could not be saved to its home this time (${firstLine(commit.err || commit.out)}). Nothing is lost on this machine.`);
      process.exit(0);
    }
    committed = true;
  }
  if (!git(['rev-parse', '--verify', '-q', 'HEAD']).ok) {
    say('There is nothing in this folder to save yet.');
    process.exit(0);
  }

  // Bring in what is new, then send ours. Someone else may save in between, so
  // go round again a few times before giving up. A refused save is told apart
  // from that race by looking at the home again: if it has not moved since the
  // last look, nobody got in first, and trying again would change nothing.
  let sent = false;
  let nothingToSend = false;
  let broughtIn = 0;
  let clash = null;
  let unreachable = null;
  let seen = null;
  let refusal = null;
  for (let attempt = 1; attempt <= PUSH_TRIES && !sent; attempt++) {
    const fetched = git(['fetch', '--quiet', 'origin', branch], { timeout: SEND_TIMEOUT_MS });
    let theirs = '';
    if (fetched.ok) {
      theirs = git(['rev-parse', 'FETCH_HEAD']).out.trim();
    } else {
      // Either the home cannot be reached, or it is there and simply has no such
      // branch yet, which is what a first save looks like.
      const heads = git(['ls-remote', '--heads', 'origin', branch], { timeout: LOOK_TIMEOUT_MS });
      if (!heads.ok || heads.out.trim() !== '') {
        unreachable = firstLine(heads.ok ? fetched.err : heads.err);
        break;
      }
    }
    if (refusal !== null && theirs === seen) {
      unreachable = refusal;
      break;
    }
    seen = theirs;
    if (theirs) {
      if (!git(['merge-base', '--is-ancestor', 'FETCH_HEAD', 'HEAD']).ok) {
        const newer = Number(git(['rev-list', '--count', 'HEAD..FETCH_HEAD']).out.trim()) || 0;
        fs.writeFileSync(ourMark, 'a save by status/home.mjs is bringing in what is new\n');
        const rebase = git([...ident, 'rebase', '--autostash', 'FETCH_HEAD']);
        if (rebase.ok) fs.rmSync(ourMark, { force: true });
        if (!rebase.ok) {
          const files = git(['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean);
          git(['rebase', '--abort']);
          fs.rmSync(ourMark, { force: true });
          clash = files.length > 0 ? files.slice(0, 5).join(', ') : firstLine(rebase.err || rebase.out);
          break;
        }
        broughtIn += newer;
      }
      if (git(['rev-parse', 'HEAD']).out.trim() === theirs) {
        nothingToSend = true;
        break;
      }
    }
    const push = git(['push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`], { timeout: SEND_TIMEOUT_MS });
    if (push.ok) sent = true;
    else refusal = firstLine(push.err);
  }

  for (const item of held) {
    say(`Held back, not saved: ${item.file} (${item.why}).${/key/.test(item.why) && item.file !== KEY_REL ? ' Take the key out and it is saved next time.' : ''}`);
  }

  if (sent) {
    say(`Saved to the folder's home.${broughtIn > 0 ? ` Brought in ${broughtIn} newer save${broughtIn === 1 ? '' : 's'} from there.` : ''}`);
    process.exit(0);
  }
  if (nothingToSend) {
    say(broughtIn > 0
      ? `Brought in ${broughtIn} newer save${broughtIn === 1 ? '' : 's'} from the folder's home. Nothing new to save from here.`
      : 'The folder and its home already match.');
    process.exit(0);
  }

  // Not sent. Say why, and on a machine about to be thrown away, park the work.
  const why = clash
    ? `the home has changes that clash with this folder's (${clash})`
    : unreachable
      ? `the home could not be reached (${unreachable})`
      : 'the home kept changing while this was being saved';
  if (!cloud) {
    say(`Not saved to the folder's home: ${why}. Nothing is lost: this machine keeps its own copy${committed ? ', and the next save tries again' : ''}.`);
    process.exit(0);
  }
  const parked = `unsaved/${stamp()}`;
  if (git(['push', '--quiet', 'origin', `HEAD:refs/heads/${parked}`], { timeout: SEND_TIMEOUT_MS }).ok) {
    say(`Not saved to the folder's home: ${why}. This run's work is parked there on the branch ${parked}, so it is not lost.`);
  } else {
    say(`NOT SAVED: ${why}, and the work could not be parked either. What this run changed in the folder will be lost when this machine is cleared.`);
  }
  process.exit(0);
}
