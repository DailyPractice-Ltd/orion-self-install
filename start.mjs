#!/usr/bin/env node
/**
 * Press Start — the Orion setup wizard.
 *
 *   node start.mjs
 *
 * One file, zero dependencies: node: built-ins and global fetch only — no package.json,
 * no npm install, ever (same rule as status/emit-status.mjs). What it does, in order:
 *
 *   1. Looks at this computer (OS, Node, git, which AI tools live here) and writes what
 *      it finds into the bookmark file, status/status.json — so no one is ever asked a
 *      question the machine can answer (spec FR-001).
 *   2. Asks the one question only a human can answer (which AI runs your harness), and
 *      only when two or more are found.
 *   3. Presents the check-in choice — pre-ticked, plain words, one keystroke to decline
 *      (FR-008) — and, with a welcome pack, configures the radio and sends the first
 *      signal. The key is typed masked and never echoed back (FR-002).
 *   4. Hands off: prints the copy-ready prompt that starts the client's AI on the
 *      AGENTS.md install sequence (FR-003).
 *
 * Re-runnable by design: every completed unit is written to the bookmark immediately, a
 * later run greets you with where you left off, and no question answered in the file is
 * ever asked again (constitution Article II). Contracts:
 * specs/002-production-line/contracts/status-additions.schema.json and bridge-radio.md.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join, delimiter } from 'node:path';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = join(__dirname, 'status', 'status.json');
const TEMPLATE_PATH = join(__dirname, 'status', 'status.schema-template.json');

// ── Talking to the human ────────────────────────────────────────────────────
// Everything printed is plain words first (constitution Article I). One shared
// readline interface; when stdin isn't a keyboard (a piped/automated run), every
// question quietly takes its safe default instead of hanging.

const isTTY = process.stdin.isTTY === true;
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
let stdinClosed = false;
rl.on('close', () => { stdinClosed = true; if (pendingResolver) { const r = pendingResolver; pendingResolver = null; r(null); } });
rl.on('SIGINT', () => process.emit('SIGINT'));

// Lines can arrive faster than questions are asked (a piped/scripted run delivers them
// all in one chunk, and readline emits them back-to-back synchronously). Park them in a
// queue so every question still receives its own answer, in order, instead of the later
// ones being silently dropped.
const pendingLines = [];
let pendingResolver = null;
rl.on('line', (line) => {
  if (pendingResolver) { const r = pendingResolver; pendingResolver = null; r(line); }
  else pendingLines.push(line);
});

process.on('SIGINT', () => {
  say('');
  say('Stopped — and nothing is lost. Everything finished so far is saved in your');
  say('bookmark file. Run  node start.mjs  again anytime to pick up right here.');
  process.exit(0);
});

function say(line = '') { process.stdout.write(line + '\n'); }
function rule() { say('─'.repeat(64)); }

function ask(question, fallback = '', { hideEcho = false } = {}) {
  process.stdout.write(question);
  if (pendingLines.length > 0) {
    const v = pendingLines.shift().trim();
    say(isTTY ? '' : (hideEcho ? '→ (received — hidden)' : `→ ${v || '(Enter)'}`));
    return Promise.resolve(v);
  }
  if (stdinClosed) {
    say('→ (no keyboard attached — taking the safe default)');
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    pendingResolver = (line) => {
      if (line === null) { say(''); resolve(fallback); }
      else resolve(line.trim());
    };
  });
}

/**
 * Masked input for the one secret this wizard handles (the welcome-pack key).
 * Nothing is echoed while typing; the value goes straight to the bookmark's sharing
 * settings — its documented home — and is only ever shown back as its last 4 characters.
 * On a non-keyboard run there's no shoulder to look over, so it falls back to a plain
 * read rather than pretending.
 */
function askMasked(question) {
  if (!isTTY || stdinClosed) return ask(question, '', { hideEcho: true });
  process.stdout.write(question);
  rl.pause();
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw === true;
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (buf) => {
      const ch = buf.toString('utf8');
      if (ch === '\r' || ch === '\n') { finish(); return; }
      if (ch === '\u0003') { // Ctrl+C
        cleanup(); say(''); process.emit('SIGINT'); return;
      }
      if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); return; }
      value += ch;
    };
    const cleanup = () => { stdin.removeListener('data', onData); stdin.setRawMode(wasRaw); rl.resume(); };
    const finish = () => { cleanup(); say(''); resolve(value.trim()); };
    stdin.on('data', onData);
  });
}

// ── The bookmark file ───────────────────────────────────────────────────────

function loadStatus() {
  if (!existsSync(STATUS_PATH)) {
    copyFileSync(TEMPLATE_PATH, STATUS_PATH);
    return { status: JSON.parse(readFileSync(STATUS_PATH, 'utf8')), firstRun: true };
  }
  return { status: JSON.parse(readFileSync(STATUS_PATH, 'utf8')), firstRun: false };
}

/** Files written under schema 1.0.0 simply lack the 1.1.0 regions — add, never error. */
function migrate(status) {
  if (!('machine_profile' in status)) status.machine_profile = null;
  if (!status.packages || typeof status.packages !== 'object') status.packages = {};
  status.sharing = status.sharing || {};
  for (const key of ['radio_choice', 'bridge_url', 'harness_id', 'install_token']) {
    if (!(key in status.sharing)) status.sharing[key] = null;
  }
  status.schema_version = '1.1.0';
  return status;
}

/** Write after every completed unit, never batched to the end (Article II). */
function save(status) {
  const now = new Date().toISOString();
  if (!status.started_at) status.started_at = now;
  status.updated_at = now;
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');
}

// ── Looking at the machine (FR-001) ─────────────────────────────────────────

const exists = (p) => { try { statSync(p); return true; } catch { return false; } };
const anyExists = (paths) => paths.some(exists);

/** Is an executable with this name reachable on PATH? (no subprocess spawned) */
function onPath(name) {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  return (process.env.PATH || '').split(delimiter).some((dir) =>
    dir && exts.some((ext) => exists(join(dir, name + ext))));
}

function detectGit() {
  try { return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0; }
  catch { return false; }
}

function hasCopilotExtension(home) {
  const extDir = join(home, '.vscode', 'extensions');
  try { return readdirSync(extDir).some((d) => d.startsWith('github.copilot')); }
  catch { return false; }
}

/**
 * Best-effort, honest detection (research.md R1): well-known install locations and
 * PATH probes only. Absence from the result never means "not installed" — and the
 * wizard never says it does.
 */
function detectSurfaces() {
  const home = os.homedir();
  const mac = process.platform === 'darwin';
  const win = process.platform === 'win32';
  const local = process.env.LOCALAPPDATA || '';
  const roaming = process.env.APPDATA || '';
  const found = [];

  if ((mac && anyExists(['/Applications/Claude.app', join(home, 'Library/Application Support/Claude')])) ||
      (win && anyExists([join(local, 'AnthropicClaude'), join(roaming, 'Claude')]))) {
    found.push('claude-desktop');
  }
  if (onPath('claude') || exists(join(home, '.claude'))) found.push('claude-code');
  if ((mac && exists('/Applications/Cursor.app')) || exists(join(home, '.cursor'))) found.push('cursor');
  if ((mac && exists('/Applications/ChatGPT.app')) ||
      (win && exists(join(local, 'Programs', 'ChatGPT')))) {
    found.push('chatgpt-app');
  }
  if (hasCopilotExtension(home)) found.push('copilot-vscode');

  // Code-capable surfaces first — the fastest lane leads, without hiding the others.
  const order = ['claude-code', 'cursor', 'claude-desktop', 'chatgpt-app', 'copilot-vscode'];
  return order.filter((s) => found.includes(s));
}

const SURFACE_WORDS = {
  'claude-code': 'Claude Code (runs in a terminal and can read and write the files here itself — the fastest lane)',
  'cursor': 'Cursor (a code editor with an AI built in — can also work on these files directly)',
  'claude-desktop': 'Claude (the desktop app)',
  'chatgpt-app': 'ChatGPT (the desktop app)',
  'copilot-vscode': 'GitHub Copilot (inside VS Code)',
  'website-chat': 'an AI chat website (claude.ai, chatgpt.com, or Copilot in the browser)',
};

const OS_WORDS = { darwin: 'a Mac', win32: 'a Windows machine', linux: 'a Linux machine' };
const OS_SLUG = { darwin: 'macos', win32: 'windows', linux: 'linux' };

// ── Plain-words description of where the install stands ────────────────────

const STAGE_WORDS = {
  booked: 'the very beginning — your AI is about to interview you about your business',
  day1_encode: 'teaching your AI about your business (the knowledge base)',
  day2_wire_and_run: 'connecting your tools — CRM, email, calendar',
  validated: 'proving everything works against your real accounts',
  seven_day_checkin: 'up and running solo — your AI is on standby for questions',
  formalised: 'complete — your harness is installed and confirmed stable',
};

// ── The wizard, step by step ────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    say('Press Start — the Orion setup wizard. Run it with:  node start.mjs');
    say('Safe to re-run anytime: it resumes from status/status.json, your bookmark file.');
    process.exit(0);
  }

  rule();
  say('  Orion — Press Start');
  rule();

  // Step 0 — the bookmark: read it before saying anything (AGENTS.md rule 1).
  const { status: statusRaw, firstRun } = loadStatus();
  const status = migrate(statusRaw);
  const resuming = !firstRun && (status.machine_profile || status.ops_stage !== 'booked' ||
    Object.values(status.checklist || {}).some(Boolean));

  if (resuming) {
    const doneCount = Object.values(status.checklist || {}).filter(Boolean).length;
    say('');
    say(`Welcome back${status.business_name ? ', ' + status.business_name : ''} — nothing was lost.`);
    say(`Your bookmark says you're at: ${STAGE_WORDS[status.ops_stage] || status.ops_stage}.`);
    if (doneCount > 0) say(`(${doneCount} install step${doneCount === 1 ? '' : 's'} already done — none will be repeated.)`);
    say("I'll re-check the machine quietly, skip every question you've already answered,");
    say('and hand you the same starting prompt at the end.');
  } else {
    say('');
    say("Hi. I'm the setup wizard — a small program that looks at this computer, works");
    say('out what\'s already here, and gets you to the point where your own AI assistant');
    say('takes over the install. Two promises before I start:');
    say('');
    say('  • I only LOOK. The one thing I write is your bookmark file');
    say('    (status/status.json) — it lives in this folder and belongs to you.');
    say('  • I never take passwords or keys for safe-keeping. When a secret is');
    say('    needed, you type it where it\'s used, and I wait.');
    say('');
    say('This takes a few minutes. Stop anytime (Ctrl+C) — running me again picks up');
    say('exactly where you left off.');
  }

  // Step 1 — look at the machine. No questions: the machine answers these itself.
  say('');
  rule();
  say('  Step 1 of 3 — a look at this computer');
  rule();
  const surfaces = detectSurfaces();
  const gitPresent = detectGit();
  say('');
  say('Here\'s what I found, in plain words:');
  say(`  • This is ${OS_WORDS[process.platform] || 'a ' + process.platform + ' machine'}.`);
  say(`  • Node.js is installed (${process.version}) — it's what's running me right now.`);
  say(gitPresent
    ? '  • git is installed — handy for updates later, never required.'
    : "  • I didn't find git — that's completely fine, you don't need it.");
  if (surfaces.length > 0) {
    say('  • AI tools that live on this computer:');
    for (const s of surfaces) say(`      – ${SURFACE_WORDS[s]}`);
  } else {
    say("  • I didn't find an AI app installed here — no problem at all. The chat");
    say('    websites (claude.ai, chatgpt.com, Copilot) work for everyone, and the');
    say('    README\'s Step 2 shows that lane.');
  }

  status.machine_profile = {
    os: OS_SLUG[process.platform] || process.platform,
    os_version: os.release(),
    node_version: process.version,
    git_present: gitPresent,
    surfaces_found: surfaces,
    chosen_surface: status.machine_profile?.chosen_surface ?? null,
    detected_at: new Date().toISOString(),
  };
  save(status);
  say('');
  say('  ✓ Saved to your bookmark — none of this will ever be asked of you.');

  // Step 1b — the one fork only a human can pick (US1 edge case: ask exactly one
  // question, and only when there genuinely is a choice).
  const mp = status.machine_profile;
  if (!mp.chosen_surface) {
    if (surfaces.length === 0) {
      mp.chosen_surface = 'website-chat';
      say(`  ✓ Your lane: ${SURFACE_WORDS['website-chat']}.`);
    } else if (surfaces.length === 1) {
      mp.chosen_surface = surfaces[0];
      say(`  ✓ Your lane: ${SURFACE_WORDS[surfaces[0]]} — the only AI tool found, so no need to ask.`);
    } else {
      say('');
      say('One question — the only one this machine can\'t answer for you:');
      say('');
      say('  Which of these should run your harness day to day?');
      surfaces.forEach((s, i) => say(`    ${i + 1}) ${SURFACE_WORDS[s]}`));
      say('');
      const answer = await ask(`  Type a number and press Enter (or just Enter for 1): `, '1');
      const idx = Math.min(Math.max(parseInt(answer || '1', 10) || 1, 1), surfaces.length) - 1;
      mp.chosen_surface = surfaces[idx];
      say(`  ✓ Noted: ${SURFACE_WORDS[mp.chosen_surface]}.`);
    }
    save(status);
  } else {
    say(`  ✓ Your chosen lane (from last time): ${SURFACE_WORDS[mp.chosen_surface] || mp.chosen_surface}.`);
  }

  // Step 2 — the check-in choice (FR-008). Pre-ticked, plain words, one keystroke to
  // decline, never re-asked once answered. Full disclosure: docs/radio.md.
  say('');
  rule();
  say('  Step 2 of 3 — the check-in choice');
  rule();
  if (status.sharing.radio_choice === null) {
    say('');
    say('Your harness checks in with Daily Practice so we can support you and count');
    say('your system as running. A check-in is small and boring on purpose: which');
    say('install step you\'re on, "a task ran just now," and which packages you\'ve');
    say('installed — never the content of your messages, your knowledge base, or your');
    say('prospects. You can switch this off, now or with one edit later, and');
    say('everything else works exactly the same. (Full detail: docs/radio.md.)');
    say('');
    const keep = (await ask('  Keep check-ins on? [Y/n] ', 'y')).toLowerCase();
    if (keep === 'n' || keep === 'no') {
      status.sharing.radio_choice = 'declined';
      status.sharing.status_signal_enabled = false;
      save(status);
      say('');
      say('  ✓ Done — check-ins are OFF and nothing will ever be sent. Everything');
      say('    else about your install works identically.');
    } else {
      status.sharing.radio_choice = 'accepted';
      status.sharing.status_signal_enabled = true;
      save(status);
      say('');
      say('  ✓ Check-ins stay on. Thank you — it\'s how we spot a problem before');
      say('    you have to report it.');
      await welcomePackStep(status);
    }
  } else {
    say('');
    say(status.sharing.radio_choice === 'declined'
      ? '  ✓ You chose to keep check-ins off — unchanged, and not asking again.'
      : '  ✓ Check-ins are on (chosen earlier — not asking again).');
    if (status.sharing.radio_choice === 'accepted' && !radioConfigured(status)) {
      await welcomePackStep(status);
    }
  }

  // Step 3 — hand off to the client's own AI (FR-003).
  say('');
  rule();
  say('  Step 3 of 3 — your AI takes it from here');
  rule();
  printHandoff(mp.chosen_surface);

  say('You\'ll know this whole setup worked when: your AI introduces itself and asks');
  say('about your business — not about your computer. See you on the other side.');
  say('');
  rl.close();
}

function radioConfigured(status) {
  const s = status.sharing;
  return Boolean(s.bridge_url && s.harness_id && s.install_token);
}

/**
 * The welcome-pack step — the wizard's only credential moment (research.md R2).
 * No pack is never a blocker: the radio just stays quietly unconfigured (US4 edge case).
 */
async function welcomePackStep(status) {
  say('');
  say('Did Daily Practice send you a welcome pack? It\'s a short note with four');
  say('things: your client id, your harness id, your key, and the radio address.');
  say('');
  const have = (await ask('  Do you have it handy? [y/N] ', 'n')).toLowerCase();
  if (have !== 'y' && have !== 'yes') {
    say('');
    say('  ✓ No problem — the radio simply stays quiet until the pack details are in.');
    say('    Nothing else is affected. When it arrives, just run  node start.mjs');
    say('    again. Expecting one and it never came? Ask support@dailypractice.world.');
    return;
  }

  const url = await ask('  The radio address (starts with https://): ', '');
  const harnessId = await ask('  Your harness id: ', '');
  const clientId = await ask('  Your client id: ', '');
  say('');
  say('  Now the key. Type or paste it — nothing will appear as you type, which is');
  say('  the point: it\'s never shown, never echoed back, and lands only in your own');
  say('  bookmark file, where the radio reads it from.');
  const token = await askMasked('  Your key: ');

  if (!url || !harnessId || !token) {
    say('');
    say('  ✓ Some of that was blank, so I\'ve left the radio unconfigured — nothing');
    say('    is lost, nothing sends, and running me again re-opens this step.');
    return;
  }

  status.sharing.bridge_url = url.replace(/\/+$/, '');
  status.sharing.harness_id = harnessId;
  status.sharing.install_token = token;
  if (!status.client_id && clientId) status.client_id = clientId;
  save(status);
  say('');
  say(`  ✓ Radio configured — key ending ····${token.slice(-4)}. Sending the first signal…`);

  // First signal, during the install session itself (FR-008). One try, honest report,
  // never a blocker — the same posture every outbound path in this repo has.
  try {
    const res = await fetch(status.sharing.bridge_url + '/signals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${status.sharing.install_token}`,
      },
      body: JSON.stringify({
        harness_id: status.sharing.harness_id,
        signal_type: 'install_checkpoint',
        sent_at: new Date().toISOString(),
        payload: {
          ops_stage: status.ops_stage,
          harness_status: status.harness_status,
          template_version: status.template_version,
        },
      }),
    });
    if (res.ok) {
      say('  ✓ The first signal just landed with Daily Practice — your system now');
      say('    counts as alive. That\'s the radio working.');
    } else if (res.status === 401) {
      say('  • The radio address answered "that key isn\'t valid" (401). Double-check');
      say('    the key in your welcome pack, or ask support@dailypractice.world for a');
      say('    fresh one. Everything is saved; nothing else is affected.');
    } else {
      say(`  • The radio address answered with status ${res.status} — not retrying.`);
      say('    Your settings are saved; your AI will try again at its next check-in.');
    }
  } catch (err) {
    say(`  • The radio address didn't answer (${err?.cause?.code || err.code || err.message}) — not retrying.`);
    say('    Your settings are saved; your AI will try again at its next check-in.');
  }
}

/** The copy-ready prompt that starts the client's AI on the AGENTS.md sequence. */
function printHandoff(surface) {
  const prompt = 'Read AGENTS.md and let\'s get started. Press Start has already run — my machine profile is saved in status/status.json, so don\'t re-ask anything it already answers.';
  const promptChat = 'Read AGENTS.md and let\'s get started. Press Start has already run on my computer — I\'ll paste status/status.json whenever you need to check where we are.';

  say('');
  switch (surface) {
    case 'claude-code':
      say('Open a terminal in this folder (tip: you\'re in one right now), start Claude');
      say('Code by typing  claude  and pressing Enter, then paste this prompt:');
      box(prompt);
      break;
    case 'cursor':
      say('Open Cursor, use File → Open Folder… to open THIS folder, open its AI chat');
      say('panel, and paste this prompt:');
      box(prompt);
      break;
    case 'copilot-vscode':
      say('Open VS Code, use File → Open Folder… to open THIS folder, open Copilot');
      say('Chat, and paste this prompt:');
      box(prompt);
      break;
    case 'claude-desktop':
      say('Open the Claude app and create a Project (call it "My Orion" — a Project is');
      say('just a chat space with its own memory). Add the file AGENTS.md from this');
      say('folder to the Project (the same everyday action as attaching a file to an');
      say('email), then paste this prompt:');
      box(promptChat);
      break;
    case 'chatgpt-app':
      say('Open ChatGPT and attach the file AGENTS.md from this folder to a new chat');
      say('(or add it to a Project/GPT if your plan has those), then paste this');
      say('prompt:');
      box(promptChat);
      break;
    default:
      say('Go to your AI\'s website (claude.ai, chatgpt.com, or Copilot), follow');
      say('README.md Step 2 to hand it the file AGENTS.md, then paste this prompt:');
      box(promptChat);
  }
  say('');
  say('(That prompt also lives in README.md, so you can copy it later without');
  say('re-running me. And if you ever switch AI tools, just run me again.)');
  say('');
}

function box(text) {
  say('');
  say('  ┌' + '─'.repeat(60));
  // Wrap at 58 chars, plain greedy wrap — readability over cleverness.
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 58) { lines.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line.trim());
  for (const l of lines) say('  │ ' + l);
  say('  └' + '─'.repeat(60));
}

await main();
