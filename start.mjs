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
 *      (FR-008) — and, given a pairing code, sets the radio up and sends the first
 *      signal. You are never asked for a key: the code is exchanged for one, and the
 *      key is written straight to your own bookmark file (FR-002, FR-B09).
 *   4. Hands off: prints the copy-ready prompt that starts the client's AI on the
 *      AGENTS.md install sequence (FR-003).
 *
 * Driving this from a script or an AI agent? Two supported ways, both order-free:
 *   node start.mjs --code BCDF-GHJK-LMNP [--checkins yes|no] [--surface 1]
 *   printf 'code=BCDF-GHJK-LMNP\ncheckins=y\n' | node start.mjs
 * Bare positional answers still work, but they are fragile: the surface question only
 * appears on a machine with 2+ AI tools, so a caller that guesses wrong shifts every
 * later answer by one. That is exactly what went wrong on the first real install
 * (2026-07-28) — hence the key=value form, and the leftover-answer report at the end.
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
import {
  bridgeBase,
  isPairingCode,
  normalizePairingCode,
  pairingCodeProblem,
  radioConfigured,
} from './status/shapes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = join(__dirname, 'status', 'status.json');
const TEMPLATE_PATH = join(__dirname, 'status', 'status.schema-template.json');

/** How long we'll wait on the radio before giving up and carrying on. */
const NETWORK_TIMEOUT_MS = 10000;

/**
 * Every question has a stable id, so a scripted caller can answer by name
 * (`code=…`) instead of by position. Positional answers still work, but the
 * surface question is conditional — a caller that guesses wrong shifts every
 * later answer by one, which is what put a stray "y" in a real client's radio
 * address on 2026-07-28.
 */
const ANSWER_KEYS = ['surface', 'checkins', 'code'];

const cliFlags = parseCliFlags(process.argv.slice(2));

function parseCliFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const m = argv[i].match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) continue;
    const name = m[1];
    const inline = m[2];
    if (inline !== undefined) out[name] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { out[name] = argv[i + 1]; i += 1; }
    else out[name] = true;
  }
  return out;
}

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
let awaitingId = null;
rl.on('line', (line) => {
  // A line addressed to a DIFFERENT question waits its turn rather than being
  // handed to whichever question happens to be open. Without this the keyed
  // form silently degrades to positional the moment lines arrive faster than
  // questions are asked — which is the normal case for a piped run.
  const keyed = parseKeyedLine(line);
  if (pendingResolver && (!keyed || keyed.key === awaitingId)) {
    const r = pendingResolver; pendingResolver = null; awaitingId = null; r(line);
  } else {
    pendingLines.push(line);
  }
});

process.on('SIGINT', () => {
  say('');
  say('Stopped — and nothing is lost. Everything finished so far is saved in your');
  say('bookmark file. Run  node start.mjs  again anytime to pick up right here.');
  process.exit(0);
});

function say(line = '') { process.stdout.write(line + '\n'); }
function rule() { say('─'.repeat(64)); }

/** `code=BCDF-…` → {key:'code', value:'BCDF-…'}, for any id we actually ask about. */
function parseKeyedLine(line) {
  const m = String(line).match(/^\s*([a-z_]+)\s*=\s*(.*)$/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return ANSWER_KEYS.includes(key) ? { key, value: m[2].trim() } : null;
}

/**
 * Ask one question, by id.
 *
 * A scripted caller may answer by NAME (`code=BCDF-GHJK-LMNP`), in any order —
 * that is the safe form, and the only one an AI agent should use. Positional
 * answers are still honoured for backwards compatibility, but a keyed line
 * belonging to a DIFFERENT question is never consumed positionally: that is the
 * precise bug that put a "y" into a real client's radio address.
 */
function ask(id, question, fallback = '') {
  process.stdout.write(question);

  // 1. An answer addressed to this question by name, wherever it sits.
  const keyedAt = pendingLines.findIndex((l) => parseKeyedLine(l)?.key === id);
  if (keyedAt !== -1) {
    const { value } = parseKeyedLine(pendingLines.splice(keyedAt, 1)[0]);
    say(isTTY ? '' : `→ ${value || '(Enter)'}`);
    return Promise.resolve(value);
  }

  // 2. Otherwise the next positional line — skipping anything addressed to a
  //    different question, which stays put for its own turn.
  const posAt = pendingLines.findIndex((l) => parseKeyedLine(l) === null);
  if (posAt !== -1) {
    const v = pendingLines.splice(posAt, 1)[0].trim();
    say(isTTY ? '' : `→ ${v || '(Enter)'}`);
    return Promise.resolve(v);
  }

  if (stdinClosed) {
    say('→ (no keyboard attached — taking the safe default)');
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    awaitingId = id;
    pendingResolver = (line) => {
      if (line === null) { say(''); resolve(fallback); }
      else {
        // Forgive a human who types the scripted form.
        const keyed = parseKeyedLine(line);
        resolve(keyed && keyed.key === id ? keyed.value : line.trim());
      }
    };
  });
}

/**
 * Anything left in the queue at the end was never asked for. Today's bug was
 * silent; this makes the same mistake shout.
 */
function reportLeftoverAnswers() {
  if (isTTY || pendingLines.length === 0) return;
  say('');
  say(`  • ${pendingLines.length} answer line(s) were never used:`);
  for (const l of pendingLines) say(`      "${l.trim()}"`);
  say('    If you are driving this from a script, answer by name instead — the');
  say(`    order then stops mattering:  ${ANSWER_KEYS.map((k) => `${k}=…`).join('  ')}`);
}


// ── The bookmark file ───────────────────────────────────────────────────────

function loadStatus() {
  if (!existsSync(STATUS_PATH)) {
    copyFileSync(TEMPLATE_PATH, STATUS_PATH);
    return { status: JSON.parse(readFileSync(STATUS_PATH, 'utf8')), firstRun: true };
  }
  return { status: JSON.parse(readFileSync(STATUS_PATH, 'utf8')), firstRun: false };
}

/**
 * Files written under older schemas simply lack the newer regions — add, never error.
 * 1.2.0 (002a reconciliation) also removed the legacy unauthenticated webhook field;
 * delete it if an old bookmark still carries it.
 */
function migrate(status) {
  if (!('machine_profile' in status)) status.machine_profile = null;
  if (!status.packages || typeof status.packages !== 'object') status.packages = {};
  status.sharing = status.sharing || {};
  for (const key of ['radio_choice', 'bridge_url', 'harness_id', 'install_token', 'paired_at']) {
    if (!(key in status.sharing)) status.sharing[key] = null;
  }
  delete status.sharing.status_signal_endpoint;
  // 1.3.0 adds sharing.paired_at — when the pairing code was exchanged for the
  // key. A bookmark written before pairing existed simply carries null.
  status.schema_version = '1.3.0';
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
  if (onPath('codex') || exists(join(home, '.codex'))) found.push('codex');
  if ((mac && exists('/Applications/Cursor.app')) || exists(join(home, '.cursor'))) found.push('cursor');
  if ((mac && exists('/Applications/ChatGPT.app')) ||
      (win && exists(join(local, 'Programs', 'ChatGPT')))) {
    found.push('chatgpt-app');
  }
  if (hasCopilotExtension(home)) found.push('copilot-vscode');

  // Code-capable surfaces first — the fastest lane leads, without hiding the others.
  const order = ['claude-code', 'codex', 'cursor', 'claude-desktop', 'chatgpt-app', 'copilot-vscode'];
  return order.filter((s) => found.includes(s));
}

const SURFACE_WORDS = {
  'claude-code': 'Claude Code (runs in a terminal and can read and write the files here itself — the fastest lane)',
  'codex': "Codex (OpenAI's coding agent — runs in a terminal and can work on these files directly)",
  'cursor': 'Cursor (a code editor with an AI built in — can also work on these files directly)',
  'claude-desktop': 'Claude (the desktop app — its Code tab can open this folder directly)',
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
    say('');
    say('  --code BCDF-GHJK-LMNP   pair without being asked (also ORION_PAIRING_CODE)');
    say('  --repair-radio          forget the current radio settings and pair again');
    say('  --checkins yes|no       answer the check-in question up front');
    say('');
    say('Driving this from a script? Answer by name, in any order:');
    say('  printf \'code=BCDF-GHJK-LMNP\\ncheckins=y\\n\' | node start.mjs');
    process.exit(0);
  }

  rule();
  say('  Orion — Press Start');
  rule();

  // Step 0 — the bookmark: read it before saying anything (AGENTS.md rule 1).
  const { status: statusRaw, firstRun } = loadStatus();
  const status = migrate(statusRaw);

  // --repair-radio: the escape hatch when the settings LOOK fine but aren't —
  // most often a key that was rotated our side. Shape-checking can't see that,
  // so nothing else would ever re-open the pairing step.
  if (cliFlags['repair-radio']) {
    status.sharing.bridge_url = null;
    status.sharing.harness_id = null;
    status.sharing.install_token = null;
    status.sharing.paired_at = null;
    save(status);
    say('');
    say('  ✓ Radio settings cleared. Nothing else about your install was touched —');
    say('    your knowledge base, your progress and your packages are all intact.');
  }
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
    say('  • I never ask you for a password or a key. The only thing you\'ll type is');
    say('    a short pairing code your coach reads out — and it stops working the');
    say('    moment it\'s used.');
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
    say('    README\'s Step 4 shows that lane.');
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
      const answer = await ask('surface', '  Type a number and press Enter (or just Enter for 1): ', '1');
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
    const keep = (typeof cliFlags.checkins === 'string'
      ? (say(`  Keep check-ins on? [Y/n] (from --checkins): ${cliFlags.checkins}`), cliFlags.checkins)
      : await ask('checkins', '  Keep check-ins on? [Y/n] ', 'y')).toLowerCase();
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
      await pairingStep(status);
    }
  } else {
    say('');
    say(status.sharing.radio_choice === 'declined'
      ? '  ✓ You chose to keep check-ins off — unchanged, and not asking again.'
      : '  ✓ Check-ins are on (chosen earlier — not asking again).');
    if (status.sharing.radio_choice === 'accepted') {
      if (!radioConfigured(status)) {
        await pairingStep(status);
      } else if (!(await radioStillWorks(status))) {
        // A revoked key still looks well-formed, so only the radio itself can
        // tell us. Rotations become self-healing instead of a support ticket.
        say('');
        say('  • Your key has been cancelled by Daily Practice — usually because it');
        say('    was rotated for safety. Nothing is wrong with your install.');
        await pairingStep(status);
      }
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
  reportLeftoverAnswers();
  say('');
  rl.close();
}

/**
 * The pairing step — where the radio gets switched on (FR-B09).
 *
 * You are never asked for a key. Your coach reads you a short code; this sends
 * it to Daily Practice, which hands back the key and writes it straight into
 * your own bookmark file. Nothing secret is ever typed by a coach into a chat,
 * which is the whole reason this replaced the old four-value welcome pack.
 *
 * No code is never a blocker: the radio stays quietly off and the next run
 * re-opens this step (US4 edge case).
 */
async function pairingStep(status) {
  say('');
  say('Your coach will read you a pairing code on the call — twelve letters in');
  say('three groups, like BCDF-GHJK-LMNP. All letters, no vowels, no numbers. It');
  say('works once, and only for 15 minutes. Type it in and I\'ll set the radio up');
  say('for you — you\'ll never be asked for a key or an address.');
  say('');

  const fromFlag = typeof cliFlags.code === 'string' ? cliFlags.code : process.env.ORION_PAIRING_CODE;
  const entered = fromFlag
    ? (say(`  Pairing code (from --code): ${fromFlag}`), fromFlag)
    : await ask('code', '  Pairing code (or press Enter to skip for now): ', '');

  if (!entered || !entered.trim()) {
    say('');
    say('  ✓ No problem — the radio stays quiet until you have a code. Nothing else');
    say('    is affected. When your coach reads you one, run  node start.mjs  again.');
    say('    Expecting a code and it never came? Ask support@dailypractice.world.');
    return;
  }

  const problem = pairingCodeProblem(entered);
  if (problem) {
    say('');
    say(`  • ${problem}`);
    say('    Nothing is saved and nothing was sent. Ask your coach to read it again,');
    say('    then run  node start.mjs  once more.');
    return;
  }

  const base = bridgeBase();
  say('');
  say('  Checking that code with Daily Practice…');

  let res;
  try {
    res = await fetch(`${base}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalizePairingCode(entered) }),
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
  } catch (err) {
    say(`  • Daily Practice didn't answer (${err?.cause?.code || err.code || err.message}) — not retrying.`);
    say('    Nothing is saved. Check your internet and run  node start.mjs  again.');
    return;
  }

  if (res.status === 404) {
    say('  • That code isn\'t valid, has expired (they only last 15 minutes), or has');
    say('    already been used. Ask for a fresh one — it takes your coach two seconds.');
    return;
  }
  if (res.status === 429) {
    say('  • Too many tries from this network. Wait five minutes, then run');
    say('    node start.mjs  again with a fresh code.');
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    say(`  • Daily Practice answered ${res.status}${body?.error ? ` — ${body.error}` : ''}.`);
    say('    Nothing is saved. Ask support@dailypractice.world if it keeps happening.');
    return;
  }

  const pack = await res.json().catch(() => null);
  if (!pack?.install_token || !pack?.harness_id) {
    say('  • Daily Practice answered, but the reply was incomplete — nothing saved.');
    say('    Ask support@dailypractice.world.');
    return;
  }

  status.sharing.bridge_url = String(pack.bridge_url || base).replace(/\/+$/, '');
  status.sharing.harness_id = pack.harness_id;
  status.sharing.install_token = pack.install_token;
  status.sharing.paired_at = new Date().toISOString();
  save(status);

  say(`  ✓ Paired — your key is saved in your own bookmark file (ends ····${String(pack.install_token).slice(-4)}).`);
  say('    That code is now used up; it can never be used again, by anyone.');
  say('    Sending the first check-in…');

  await sendFirstSignal(status);
}

/**
 * First signal, during the install session itself (FR-008). One try, honest
 * report, never a blocker — the same posture every outbound path here has.
 */
async function sendFirstSignal(status) {
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
        occurred_at: new Date().toISOString(),
        payload: {
          ops_stage: status.ops_stage,
          harness_status: status.harness_status,
          template_version: status.template_version,
        },
      }),
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (res.ok) {
      say('  ✓ The first check-in just landed with Daily Practice — your system now');
      say('    counts as alive. That\'s the radio working.');
    } else if (res.status === 401) {
      say('  • The radio says that key isn\'t valid (401) — unusual right after');
      say('    pairing. Ask support@dailypractice.world. Nothing else is affected.');
    } else {
      say(`  • The radio answered with status ${res.status} — not retrying.`);
      say('    Your settings are saved; your AI will try again at its next check-in.');
    }
  } catch (err) {
    say(`  • The radio didn't answer (${err?.cause?.code || err.code || err.message}) — not retrying.`);
    say('    Your settings are saved; your AI will try again at its next check-in.');
  }
}

/**
 * A key can be cancelled from our side (a leak, a rotation). Shape-checking
 * cannot detect that — a revoked key still looks perfectly well-formed — so an
 * already-paired install asks the radio once, quietly, whether it still works.
 * Only a definite 401 does anything; a timeout or any other answer stays silent,
 * because being offline must never cost you your pairing.
 */
async function radioStillWorks(status) {
  try {
    const res = await fetch(status.sharing.bridge_url + '/nudges', {
      headers: { 'Authorization': `Bearer ${status.sharing.install_token}` },
      signal: AbortSignal.timeout(4000),
    });
    return res.status !== 401;
  } catch {
    return true;
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
    case 'codex':
      say('Open a terminal in this folder (tip: you\'re in one right now), start Codex');
      say('by typing  codex  and pressing Enter, then paste this prompt:');
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
      say('Open the Claude app and click Code (near the top of the sidebar), then open');
      say('THIS folder with its folder picker — the one you gave Orion as its home in');
      say('README Step 2. Then paste this prompt:');
      box(prompt);
      say('');
      say('(No Code tab in your Claude app? Create a Project instead — a chat space');
      say('with its own memory — add the file AGENTS.md from this folder to it, and');
      say('paste the same prompt. Both roads lead to the same place.)');
      break;
    case 'chatgpt-app':
      say('Open ChatGPT and attach the file AGENTS.md from this folder to a new chat');
      say('(or add it to a Project/GPT if your plan has those), then paste this');
      say('prompt:');
      box(promptChat);
      break;
    default:
      say('Go to your AI\'s website (claude.ai, chatgpt.com, or Copilot), follow');
      say('README.md Step 4 to hand it the file AGENTS.md, then paste this prompt:');
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
