#!/usr/bin/env node
/** Press Start: resumable setup; only fresh, accepted pairing permits handoff. */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join, delimiter } from 'node:path';
import os from 'node:os';
import { reportSignal, validateOutbox } from './status/report.mjs';
import { checkWork } from './status/guard.mjs';
import { withStatusLock, changeStatus, createStatus, statusTemplate } from './status/store.mjs';
import {
  bridgeBase,
  normalizePairingCode,
  pairingCodeProblem,
  radioConfigured,
  radioKey,
  readRadioKeyFile,
  keyHeader,
  homeOn,
  INSTALL_TOKEN_RE, RADIO_URL_RE, HARNESS_ID_RE,
} from './status/shapes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = join(__dirname, 'status', 'status.json');

/**
 * Where the radio key may be besides the bookmark file (status/shapes.mjs,
 * radioKey). A folder that has a home keeps its key in status/radio.key, so
 * every check here has to look there too.
 */
const keyPlaces = () => ({ keyFile: readRadioKeyFile(join(__dirname, 'status'), { readFileSync }) });

/** Bound setup network waits; a timeout leaves setup unfinished. */
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
  process.exit(2);
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
    say(isTTY ? '' : id === 'code' ? '→ (hidden)' : `→ ${value || '(Enter)'}`);
    return Promise.resolve(value);
  }

  // 2. Otherwise the next positional line — skipping anything addressed to a
  //    different question, which stays put for its own turn.
  const posAt = pendingLines.findIndex((l) => parseKeyedLine(l) === null);
  if (posAt !== -1) {
    const v = pendingLines.splice(posAt, 1)[0].trim();
    say(isTTY ? '' : id === 'code' ? '→ (hidden)' : `→ ${v || '(Enter)'}`);
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
  say("    Unused answers are hidden; rerun with the named answers you intended.");
  say('    If you are driving this from a script, answer by name instead — the');
  say(`    order then stops mattering:  ${ANSWER_KEYS.map((k) => `${k}=…`).join('  ')}`);
}


// ── The bookmark file ───────────────────────────────────────────────────────

function loadStatus() {
  return {status:JSON.parse(readFileSync(STATUS_PATH,'utf8'))};
}

/**
 * Files written under older schemas simply lack the newer regions — add, never error.
 * 1.2.0 (002a reconciliation) also removed the legacy unauthenticated webhook field;
 * delete it if an old bookmark still carries it.
 */
let levelWrittenThisRun = false;

function migrate(status, { firstRun = false } = {}) {
  if (!('machine_profile' in status)) status.machine_profile = null;
  if (!status.packages || typeof status.packages !== 'object') status.packages = {};
  status.sharing = status.sharing || {};
  for (const key of ['radio_choice', 'bridge_url', 'harness_id', 'install_token', 'paired_at', 'radio_seen_through']) {
    if (!(key in status.sharing)) status.sharing[key] = null;
  }
  delete status.sharing.status_signal_endpoint;
  // 1.3.0 adds sharing.paired_at — when the pairing code was exchanged for the
  // key. A bookmark written before pairing existed simply carries null.
  // 1.4.0 adds sharing.radio_seen_through: the newest message the radio has read
  // out, so nothing is repeated. Null means the radio has not read one out yet.
  // 1.6.0 retires the n8n lane: its two checklist keys describe steps that no
  // longer exist. Never resurrect them; drop them from older bookmarks.
  if (status.checklist) {
    delete status.checklist.n8n_wf01_imported;
    delete status.checklist.n8n_wf02_imported;
  }
  // 1.7.0 adds the home block (status/home.mjs): whether this folder lives in a
  // private repository its owner controls. Off until they ask for one.
  if (!status.home || typeof status.home !== 'object') {
    status.home = { enabled: false, branch: 'main' };
  }
  // 1.8.0 adds the standing scopes block. crm_write is on: CRM writes (notes,
  // tasks, properties, meeting outcomes) are done and reported, never staged
  // (K18).
  if (!status.scopes || typeof status.scopes !== 'object') {
    status.scopes = { crm_write: true };
  }
  if (typeof status.scopes.crm_write !== 'boolean') status.scopes.crm_write = true;
  // 1.9.0 adds the send level (spec 007, K16): the one knob the client moves.
  // A fresh install starts at low; a folder with no level gains low. A folder
  // that has one is left exactly as it is.
  if (!['off', 'low', 'medium', 'high'].includes(status.scopes.send_risk)) {
    status.scopes.send_risk = 'low';
    status.scopes.send_risk_set_by = firstRun ? 'install' : 'update';
    status.scopes.send_risk_set_on = null;
  }
  // The template ships the level with no date: the first run that sees that
  // is the install, and it tells the client once. Local date, as send.mjs writes it.
  if (!status.scopes.send_risk_set_on) {
    const d = new Date();
    status.scopes.send_risk_set_on = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    levelWrittenThisRun = true;
  }
  if (status.checklist && !('vt09_send_gate' in status.checklist)) status.checklist.vt09_send_gate = false;
  // The plugin region (spec 008): the Orion plugin's catalog identity and setup
  // progress. Missing fields gain the template's defaults (the same region as
  // update/plugin-package.mjs defaultPluginRegion); an identity is never made
  // here — only update/plugin-package.mjs creates it, once.
  if (!status.plugin || typeof status.plugin !== 'object' || Array.isArray(status.plugin)) status.plugin = {};
  for (const [key, value] of Object.entries(statusTemplate(__dirname).plugin)) {
    if (!(key in status.plugin)) status.plugin[key] = value;
  }
  return status;
}

/** Write after every completed unit, never batched to the end (Article II). */
async function save(status, { chosenSurface = false } = {}) {
  await changeStatus(__dirname, fresh => {
    const current = migrate(fresh, {
      firstRun: status.scopes.send_risk_set_by === 'install',
    });
    if (chosenSurface) {
      current.machine_profile.chosen_surface = status.machine_profile.chosen_surface;
    } else {
      current.machine_profile = {
        ...current.machine_profile,
        ...status.machine_profile,
        chosen_surface: current.machine_profile?.chosen_surface ?? null,
      };
    }
    current.started_at ??= new Date().toISOString();
    // Later setup decisions must use the latest credential and saved answers.
    Object.assign(status, current);
  });
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
  seven_day_checkin: 'driving it solo, with your AI on standby for questions',
  formalised: 'complete — Orion is installed and confirmed stable',
};

// ── The wizard, step by step ────────────────────────────────────────────────

async function main() {
  if (existsSync(join(__dirname, 'install.mjs'))) {
    say('This is the Orion release folder. Create a separate client repository first:');
    say('  node install.mjs --tool codex --target <your-client-folder>');
    say('  node install.mjs --tool claude-code --target <your-client-folder>');
    say('Then run node start.mjs inside that new folder.');
    process.exitCode = 2;
    return;
  }
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    say('Press Start — the Orion setup wizard. Run it with:  node start.mjs');
    say('Safe to re-run anytime: it resumes from status/status.json, your bookmark file.');
    say('');
    say('  --code BCDF-GHJK-LMNP   pair without being asked (also ORION_PAIRING_CODE)');
    say('  --repair-radio          forget the current radio settings and pair again');
    say('  Pairing is required; legacy --checkins/skip flags cannot finish setup.');
    say('');
    say('Driving this from a script? Answer by name, in any order:');
    say('  printf \'code=BCDF-GHJK-LMNP\\ncheckins=y\\n\' | node start.mjs');
    process.exit(0);
  }

  rule();
  say('  Orion — Press Start');
  rule();

  // Step 0 — the bookmark: read it before saying anything (AGENTS.md rule 1).
  const firstRun = await createStatus(__dirname);
  // Validate and upgrade pairing state before setup writes.
  const initial = await checkWork({root:__dirname, replay:false});
  if (initial.reason.includes('could not safely')) { pauseSetup(initial.reason); return; }
  const status = migrate(loadStatus().status, { firstRun });

  if (cliFlags['repair-radio']) {
    await withStatusLock(__dirname, async store => {
      const current = await store.readStatus();
      for (const field of ['bridge_url','harness_id','install_token','paired_at']) current.sharing[field] = null;
      current.sharing.pairing.state = 'unpaired';
      current.sharing.pairing.last_check = 'invalid';
      current.sharing.pairing.last_connected_at = null;
      await store.removeKey();
      await store.writeStatus(current);
      Object.assign(status.sharing,current.sharing);
    });
    say('Radio settings cleared. Your saved answers and progress are intact.');
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
    say('and finish setup once the pairing is verified.');
  } else {
    say('');
    say("Hi. I'm the setup wizard — a small program that looks at this computer, works");
    say('out what\'s already here, and gets you to the point where your own AI assistant');
    say('takes over the install. Two promises before I start:');
    say('');
    say('  • I save your setup progress and pairing securely in this folder. Your bookmark');
    say('    (status/status.json) belongs to you. A homed folder keeps its key separately.');
    say('  • I never ask you for a password or a key. The only thing you might type is');
    say('    a short pairing code from your Daily Practice account — and it stops');
    say('    working the moment it\'s used.');
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
    say("  • I didn't find an AI app installed here.");
    say('    Install Codex or Claude Code, then open this folder there.');
    say('    See docs/install.md for the supported installation route.');
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
  await save(status);
  say('');
  say('  ✓ Saved to your bookmark — none of this will ever be asked of you.');

  // Step 1b — the one fork only a human can pick (US1 edge case: ask exactly one
  // question, and only when there genuinely is a choice).
  const mp = status.machine_profile;
  // A new deployed harness has already made the one tool choice at install.
  // Keep the wizard's handoff aligned with the recorded runtime layout.
  const { ai_assistant } = status;
  if (mp.chosen_surface !== ai_assistant && ['claude-code', 'codex'].includes(ai_assistant)) {
    mp.chosen_surface = ai_assistant;
    await save(status, { chosenSurface: true });
  }
  if (!['claude-code', 'codex'].includes(mp.chosen_surface)) {
    const supported = surfaces.filter(surface => ['claude-code', 'codex'].includes(surface));
    const choices = supported.length ? supported : ['codex', 'claude-code'];
    if (mp.chosen_surface) say('Your previous surface cannot run the required checks. Choose Codex or Claude Code to continue in this folder.');
    if (choices.length === 1) {
      mp.chosen_surface = choices[0];
      say(`  ✓ Your lane: ${SURFACE_WORDS[choices[0]]} — the supported AI tool found.`);
    } else {
      say('');
      say('One question — the only one this machine can\'t answer for you:');
      say('');
      say('  Which of these should run Orion day to day?');
      choices.forEach((s, i) => say(`    ${i + 1}) ${SURFACE_WORDS[s]}`));
      say('');
      const answer = await ask('surface', '  Type a number and press Enter (or just Enter for 1): ', '1');
      const idx = Math.min(Math.max(parseInt(answer || '1', 10) || 1, 1), choices.length) - 1;
      mp.chosen_surface = choices[idx];
      say(`  ✓ Noted: ${SURFACE_WORDS[mp.chosen_surface]}.`);
    }
    await save(status, { chosenSurface: true });
  } else {
    say(`  ✓ Your chosen lane (from last time): ${SURFACE_WORDS[mp.chosen_surface] || mp.chosen_surface}.`);
  }

  say(''); rule(); say('  Step 2 of 3 — pair Orion'); rule();
  say('Pair Orion with Daily Practice to finish setup. This lets us support your harness, deliver updates, and see when it is running. Sign in to Daily Practice to get your one-time code.');
  say('https://www.dailypractice.world/home/pair');
  const explicitCode = typeof cliFlags.code === 'string' || !!process.env.ORION_PAIRING_CODE || pendingLines.some(line => parseKeyedLine(line)?.key === 'code');
  if (explicitCode || !radioConfigured(status,keyPlaces()) || status.sharing.radio_choice === 'declined') {
    if (!(await pairingStep(status))) { pauseSetup('Get or renew your code at https://www.dailypractice.world/home/pair, then run node start.mjs --code <code>.'); return; }
  }
  const verified = await checkWork({root:__dirname,scope:false});
  const checked = loadStatus().status;
  if (!verified.allow || verified.allowance || checked.sharing.pairing.state !== 'verified' || checked.sharing.pairing.last_check !== 'accepted') {
    pauseSetup(verified.reason + ' Run node start.mjs again to resume your saved setup.'); return;
  }
  Object.assign(status.sharing, checked.sharing);
  if (!(await sendFirstSignal())) return;

  // Step 3 — hand off to the client's own AI (FR-003).
  say('');
  rule();
  say('  Step 3 of 3 — your AI takes it from here');
  rule();
  printHandoff(mp.chosen_surface);

  // Plugin readiness is separate from pairing: surface its one owed step, never block on it.
  const pluginStep = loadStatus().status.plugin;
  if (pluginStep?.setup_state !== 'complete') {
    say(`Pairing is done. The Orion plugin (your shipped skills) still needs one step: ${pluginStep?.remaining_action || 'connect the Orion skills to your AI tool by running node update/plugin-setup.mjs resume in this folder.'}`);
    say('');
  } else {
    say('You\'ll know this whole setup worked when: your AI introduces itself and asks');
    say('about your business — not about your computer. See you on the other side.');
  }
  reportLeftoverAnswers();
  say('');
  rl.close();
}

function pauseSetup(reason) {
  say('Setup is saved but unfinished.'); say(reason);
  process.exitCode = 2; rl.close();
}

async function pairingStep(status) {
  const fromFlag = typeof cliFlags.code === 'string' ? cliFlags.code : process.env.ORION_PAIRING_CODE;
  const entered = fromFlag !== undefined ? fromFlag : await ask('code','  Pairing code: ','');
  const problem = pairingCodeProblem(entered);
  if (problem) { say(problem); return false; }
  const base = bridgeBase();
  if (!RADIO_URL_RE.test(base)) { say('The radio address needs recovery. Check ORION_BRIDGE_URL.'); return false; }
  let response;
  try {
    response = await fetch(`${base}/pair`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:normalizePairingCode(entered)}),signal:AbortSignal.timeout(NETWORK_TIMEOUT_MS)});
  } catch {
    say('Daily Practice could not be reached. Check your connection. If the code was used before the reply arrived, renew it on the pairing page.'); return false;
  }
  if (response.status !== 200) {
    say(response.status === 404 ? 'That code is expired, used, or unavailable. Renew it on the pairing page.' : response.status === 429 ? 'Too many attempts. Wait five minutes and renew your code.' : response.status === 400 ? 'That code was not accepted. Copy a fresh code from the pairing page.' : 'Daily Practice could not exchange the code. Try again shortly; renew the code if needed.'); return false;
  }
  const pack = await response.json().catch(() => null);
  const address = typeof pack?.bridge_url === 'string' ? pack.bridge_url.replace(/\/+$/,'') : '';
  if (!INSTALL_TOKEN_RE.test(pack?.install_token || '') || !HARNESS_ID_RE.test(pack?.harness_id || '') || !RADIO_URL_RE.test(address)) {
    say('The pairing reply was incomplete. Renew your code on the pairing page.'); return false;
  }
  await withStatusLock(__dirname, async store => {
    const current = await store.readStatus();
    const sharing = current.sharing;
    if (homeOn(current)) {
      await store.writeKey(pack.install_token);
      sharing.install_token = null;
    } else sharing.install_token = pack.install_token;
    sharing.bridge_url = address; sharing.harness_id = pack.harness_id;
    sharing.radio_choice = 'accepted'; sharing.status_signal_enabled = true;
    sharing.paired_at = new Date().toISOString();
    sharing.pairing.state = 'exchanged'; sharing.pairing.last_check = null; sharing.pairing.last_connected_at = null;
    await store.writeStatus(current); Object.assign(status.sharing,sharing);
  });
  say('Pairing saved securely. Checking the connection before finishing setup…');
  return true;
}

/** The setup checkpoint has one durable identity, including across lost ACKs. */
async function sendFirstSignal() {
  try {
    const checkpoint = await withStatusLock(__dirname, async store => {
      const current = await store.readStatus();
      current.setup_checkpoint ??= {
        harness_id: current.sharing.harness_id,
        occurred_at: new Date().toISOString(),
        payload: {
          ops_stage: current.ops_stage,
          harness_status: current.harness_status,
          template_version: current.template_version,
        },
        delivered: false,
      };
      const saved = current.setup_checkpoint;
      if (!saved || saved.harness_id !== current.sharing.harness_id || typeof saved.delivered !== 'boolean') throw new Error('Invalid setup checkpoint');
      validateOutbox([{kind:'signal',body:{harness_id:saved.harness_id,signal_type:'install_checkpoint',occurred_at:saved.occurred_at,payload:saved.payload}}]);
      await store.writeStatus(current);
      return saved;
    });
    if (checkpoint.delivered) return true;
    const report = await reportSignal({root:__dirname,signalType:'install_checkpoint',occurredAt:checkpoint.occurred_at,payload:checkpoint.payload});
    if (report.status !== 'sent' || report.pending !== 0) {
      pauseSetup((report.reason || 'The first check-in is waiting for recovery.') + ' Run node start.mjs again to resume your saved setup.');
      return false;
    }
    // Preserve the fresh guard decision, but check for any concurrent reporter
    // before completing setup. An unresolved report must suppress the handoff.
    await withStatusLock(__dirname, async store => {
      const current = await store.readStatus();
      const pending = validateOutbox(await store.readOutbox());
      if (pending.length || current.sharing.pairing.last_check !== 'accepted' || current.sharing.harness_id !== checkpoint.harness_id || current.sharing.status_signal_enabled !== true) throw new Error('Report recovery needed');
      current.setup_checkpoint.delivered = true;
      await store.writeStatus(current);
    });
    say('  ✓ The first check-in just landed with Daily Practice. Your system counts');
    say('    as running once it reports its first finished task.');
    return true;
  } catch {
    pauseSetup('The setup check-in needs recovery. Run node start.mjs again after recovering the saved status files or connection.');
    return false;
  }
}

/** The copy-ready prompt that starts the client's AI on the AGENTS.md sequence. */
function printHandoff(surface) {
  const prompt = 'Read AGENTS.md and let\'s get started. Press Start has already run — my machine profile is saved in status/status.json, so don\'t re-ask anything it already answers.';

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
    default:
      say('Open this installed folder in Codex or Claude Code. See docs/install.md.');
  }
  say('');
  say('(That prompt also lives in README.md, so you can copy it later without');
  say('re-running me. And if you ever switch AI tools, just run me again.)');
  say('');
  if (levelWrittenThisRun) {
    say("Your harness sends on its own at low: replies and logistics. Say 'set my risk to medium' to change it, or 'pause sending' to stop it.");
    say('');
  }
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

try { await main(); } catch { pauseSetup('Orion could not safely save setup. Recover the status files or lock, then run node start.mjs again.'); }
