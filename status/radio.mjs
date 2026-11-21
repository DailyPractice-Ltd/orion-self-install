#!/usr/bin/env node
/**
 * The radio, client side — talks to Daily Practice's bridge doors when (and only when)
 * the radio is on. Contract: docs/radio.md.
 *
 *   node status/radio.mjs check
 *       Read the radio (GET /nudges). Run at session start. An empty radio is the
 *       normal, silent case.
 *       Each message is read out once: sharing.radio_seen_through in status.json
 *       remembers the newest one already heard, and nothing before it is repeated.
 *
 *   node status/radio.mjs reply --nudge <id> --message "the client's reply"
 *       Send a reply back (POST /nudges/<id>/reply). Only ever run after the client's
 *       explicit yes in this session — the reply is theirs, not yours.
 *
 *   node status/radio.mjs send --message "what the client wants to say" --yes
 *       Start a conversation (POST /nudges). For when the client has something to say
 *       and there is nothing to reply to. Same rule as reply: their words, their yes.
 *
 *   node status/radio.mjs signal --type <type> [--tag <tag>] [--count <n>] [--routine <name>]
 *                                [--asset <slug> --outcome <o> [--surface <s>] [--asset-kind <k>]]
 *       Report finished work (POST /signals). Most finished work does not call
 *       this directly: status/done.mjs is the everyday command, and it calls this
 *       one. The types:
 *         task_completed      A task the human set is finished. Requires --tag and
 *                             --count, and the count is at least 1.
 *         routine_completed   A hired agent's shift ended. A shift is work done on
 *                             a schedule, and "routine" is only its name on the
 *                             wire. Requires --routine (the agent's roster name)
 *                             and --count. A count of 0 is allowed here: the
 *                             shift ran and found nothing to do.
 *         outreach_approved, outreach_rejected, debrief_completed, crm_updated,
 *         workflow_execution_completed
 *                             The five named moments, unchanged. Two of them
 *                             (debrief_completed, crm_updated) follow a write
 *                             under the standing crm_write scope, not a yes.
 *         install_checkpoint  The install journey. It is not work, so it carries
 *                             no tag and names nothing that ran.
 *       Any work type may carry --tag: the kind of work, from the menu in
 *       status/shapes.mjs. A tag that is not on the menu is refused, and the menu
 *       is printed. Any work type may also name what ran: --routine for a hired
 *       agent, and --asset <slug> --outcome <rep_logged|run_completed|skipped>
 *       [--surface agent|routine] [--asset-kind skill|agent|workflow|program] for
 *       a skill or another installed capability. One signal per piece of work,
 *       never two: a shift that used a skill is the same report, now naming the
 *       skill. Labels, a count, and a timestamp. Never content: there is no flag
 *       for a note or a description, and the story of the work stays on this
 *       machine, in status/work-log.md or, for a shift, in status/shift-log.md.
 *
 * Radio-on means ALL of: sharing.status_signal_enabled is true, bridge_url and
 * harness_id are set (the welcome pack), and there is a key. Anything less → every
 * command prints one plain line, sends nothing, and exits 0. Network trouble never
 * retries and never blocks local work — same posture as emit-status.mjs since feature 001.
 *
 * The key is looked for in this order (status/shapes.mjs, radioKey): the machine's
 * environment (ORION_INSTALL_TOKEN), then status/radio.key, then sharing.install_token
 * in status.json. A cloud run that finds none sends its calls without one, because
 * there the environment adds the key after the call has left the machine.
 *
 * Dependency-free: node:fs and global fetch only. No package.json, no npm install.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reportSignal } from './report.mjs';
import {
  radioOn as radioIsOn, radioKey, readRadioKeyFile, keyHeader, wantsEnvProxy, envProxyEnv, isCloudRun,
  isWorkTag, workTagMenu, labelProblem, countProblem,
} from './shapes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = join(__dirname, 'status.json');
const ROOT = join(__dirname, '..');

// A cloud machine reaches the radio only through its proxy, and Node has to be
// started knowing that (status/shapes.mjs, wantsEnvProxy). So this script starts
// itself once more with that switched on, and hands back whatever that run says.
if (wantsEnvProxy()) {
  const again = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: envProxyEnv() });
  process.exit(again.status ?? 0);
}

const SIGNAL_TYPES = [
  'install_checkpoint',
  'workflow_execution_completed',
  'outreach_approved',
  'outreach_rejected',
  'debrief_completed',
  'crm_updated',
  // A hired agent's scheduled shift completed — standing yes given at hire on
  // the job sheet (contracts/agent-anatomy.md). Carries --routine and --count.
  'routine_completed',
  // A task the human set in a session is finished: they have the thing they
  // asked for, or the action is taken (1.1.0). Carries --tag and --count.
  // status/done.mjs sends it as the last step of the task.
  'task_completed',
];
const PACKAGE_KINDS = ['agent', 'skill', 'workflow', 'program'];
// How the capability was used. run_completed: it finished its run. rep_logged:
// the human said they did the hard action themselves, asked and never assumed.
// skipped: offered and declined. A skip counts nowhere. It keeps the story honest.
const ASSET_OUTCOMES = ['rep_logged', 'run_completed', 'skipped'];
// Where it was used: in a session (agent), or on a hired agent's shift (routine).
const ASSET_SURFACES = ['agent', 'routine'];

// ── Arguments ───────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? '';
}

function usage() {
  console.log('Usage: node status/radio.mjs <check | reply | send | signal> [--flags]');
  console.log('Details in the header of this file, or docs/radio.md.');
}

if (!command || !['check', 'reply', 'send', 'signal'].includes(command)) {
  usage();
  process.exit(command ? 1 : 0);
}

// Reporting follows completed work; reading support messages remains a recovery path.
if (['send','reply'].includes(command)) {
  const {checkWork} = await import('./guard.mjs');
  const permission = await checkWork({root:ROOT});
  if (!permission.allow) console.log(permission.reason);
  if (!permission.allow) process.exit(2);
}

// ── The radio-on gate ───────────────────────────────────────────────────────

if (!existsSync(STATUS_PATH)) {
  console.log('No status/status.json yet — nothing to do. Run  node start.mjs  first.');
  process.exit(0);
}
const status = JSON.parse(readFileSync(STATUS_PATH, 'utf8'));
const sharing = status.sharing || {};
// Shape, not mere presence (status/shapes.mjs). A settings file poisoned by a
// misaligned scripted run — a stray "y" where the address belongs — used to
// pass this gate and then fail every single call.
const keyPlaces = { keyFile: readRadioKeyFile(__dirname, { readFileSync }) };
const key = radioKey(status, keyPlaces);
const radioOn = radioIsOn(status, keyPlaces);

if (!radioOn && command !== 'signal') {
  console.log('Radio is off (or not configured) — nothing sent, nothing checked. Local work is unaffected.');
  process.exit(0);
}

const base = String(sharing.bridge_url).replace(/\/+$/, '');
// The version this harness is on, stated on every call rather than only when a
// signal fires. A signal needs real work to complete; a check happens at every
// session start. Reporting it only on the former meant a machine could update
// and still read as its old version for a week, and Daily Practice could not
// tell whether a release had landed anywhere. It is a label about this folder,
// never anything about the client's work.
const headers = {
  'Content-Type': 'application/json',
  ...keyHeader(key),
  ...(status.template_version ? { 'x-orion-template-version': String(status.template_version) } : {}),
};

/** One try, one plain line on failure, exit 0 — the radio never blocks local work. */
async function call(method, path, body) {
  try {
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return res;
  } catch (err) {
    const code = err?.cause?.code || err.code || err.message;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      // The name could not even be looked up: on a laptop that is no network at
      // all, and in an assistant's sandbox it is the sandbox. Same next step
      // either way, said plainly (K15).
      console.log(`This assistant's sandbox is blocking the network, or this machine is offline (${code}). The radio is fine; ask for network approval for this command and run it again. Nothing lost locally.`);
    } else {
      console.log(`The radio address didn't answer (${code}) — not retried, nothing lost locally.`);
    }
    if (isCloudRun()) {
      // A cloud machine may only reach the addresses its environment allows, and
      // a refusal looks exactly like no answer at all.
      console.log(`On a cloud run this usually means the cloud environment may not reach ${new URL(base).host}.`);
      console.log('A secret for that address, added to the environment, both allows it and carries the key.');
    }
    resultLine('unreachable');
    process.exit(0);
  }
}

/**
 * The outcome of a `signal`, as one line a script can read, printed only when the
 * caller asks for it (--result-line). status/done.mjs asks, so it never has to
 * guess what happened from the sentences above, which are written for people and
 * may be reworded. One of: "sent", "unreachable", "refused <status>". The exit code
 * stays 0 either way: the radio never blocks local work.
 */
function resultLine(outcome) {
  if (command === 'signal' && flags['result-line'] !== undefined) {
    console.log(`[radio-result] ${outcome}`);
  }
}

function reportAuthProblem() {
  if (key.source === 'attached') {
    // No key on this machine, by design: the cloud environment was meant to add
    // it. A 401 here means it did not, or the one it holds is out of date.
    console.log('The radio answered "no valid key" (401). This is a cloud run, so the key is meant to');
    console.log(`be added by the cloud environment, as a secret for ${new URL(base).host}. It is missing there,`);
    console.log('or out of date. Nothing else is affected.');
  } else {
    console.log('The radio answered "that key isn\'t valid" (401). The key may have been revoked —');
    console.log('ask support@dailypractice.world for a fresh pairing code. Nothing else is affected.');
  }
  resultLine('refused 401');
  process.exit(0);
}

// ── Commands ────────────────────────────────────────────────────────────────

/** "2 hours ago" beats an ISO timestamp when you are reading it to a person. */
function whenWords(iso) {
  const then = Date.parse(iso || '');
  if (Number.isNaN(then)) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Send and reply carry personal messages; skill files stay on this machine. */
function looksLikeSkillFile(text) {
  const t = String(text ?? '').replace(/^﻿/, '').trimStart();
  return /^---\s*\r?\n[\s\S]{0,300}?\bname:\s*\S/.test(t);
}

/**
 * Which of our messages the client has not heard yet.
 *
 * The v=1 door hands back the recent conversation every time, so a session that
 * dies mid-print cannot lose a message; deciding what is new is this side's job.
 * The mark is sharing.radio_seen_through in status.json: the time of the newest
 * message already read out. Only server timestamps are compared, so a wrong clock
 * on this machine changes nothing. With no mark yet (the first check on this
 * version), the new messages are the ones the server marked delivered in this
 * very request: they share the newest delivery stamp, and one whose receipt failed
 * or whose stamp is missing is still unread. At worst the most recent message is
 * repeated once. Repeating is the safe failure; going quiet is the one that loses a
 * message.
 */
function unheard(fromUs, seenThrough) {
  const mark = Date.parse(seenThrough || '');
  if (!Number.isNaN(mark)) {
    return fromUs.filter((m) => {
      const at = Date.parse(m.at || '');
      return Number.isNaN(at) || at > mark;
    });
  }
  const stamps = fromUs.map((m) => m.state_at).filter((s) => typeof s === 'string').sort();
  const newest = stamps[stamps.length - 1];
  return fromUs.filter((m) => m.state !== 'delivered' || typeof m.state_at !== 'string' || m.state_at === newest);
}

/** Remember the newest message read out, so it is never repeated. Never fatal. */
function rememberHeard(at) {
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return;
  try {
    const fresh = JSON.parse(readFileSync(STATUS_PATH, 'utf8'));
    fresh.sharing = fresh.sharing || {};
    fresh.sharing.radio_seen_through = at;
    writeFileSync(STATUS_PATH, JSON.stringify(fresh, null, 2) + '\n');
  } catch {
    // At-least-once: a failed write only means the message is read again next time.
  }
}

if (command === 'check') {
  // v=1 is the conversation, with state and names; a server that has not got it
  // yet answers the old way and we still print something a person can read.
  const res = await call('GET', '/nudges?v=1');
  if (res.status === 401) reportAuthProblem();
  if (!res.ok) { console.log(`Radio check answered ${res.status} — skipped, will try next session.`); process.exit(0); }
  const data = await res.json().catch(() => null);

  const messages = Array.isArray(data?.messages)
    ? data.messages
    : (Array.isArray(data?.nudges) ? data.nudges : []).map((n) => ({
        key: n.id,
        from: 'daily_practice',
        from_name: n.from || 'Daily Practice',
        body: n.body,
        at: n.created_at,
      }));

  const waiting = unheard(messages.filter((m) => m.from === 'daily_practice'), sharing.radio_seen_through);
  if (waiting.length === 0) {
    console.log('Radio quiet — nothing waiting.');
    process.exit(0);
  }

  // What follows is for the client's ears. Read it to them as it is written:
  // it is a person talking to them, not a status report about a channel.
  const newest = waiting.reduce((a, b) => (Date.parse(b.at || '') > Date.parse(a.at || '') ? b : a));
  for (const m of waiting) {
    console.log('');
    console.log(`From ${m.from_name || 'Daily Practice'}, ${whenWords(m.at)}:`);
    console.log('');
    // Compatibility: hide retired machine directives in old radio messages.
    // Human prose still belongs to the client and is read without offering actions.
    const lines = String(m.body).split('\n').filter(
      (line) => !/^\s*\[library:install\](?:\s|$)/.test(line),
    );
    for (const line of lines) console.log(`  ${line}`);
  }
  console.log('');
  console.log('--- for the assistant, not to be read aloud ---');
  console.log('Read the message above to the client in full. If they want to answer,');
  console.log('take their words and run this, replacing only the message:');
  console.log(`  node status/radio.mjs reply --nudge ${newest.key} --message "their words" --yes`);
  rememberHeard(newest.at);
  process.exit(0);
}

if (command === 'send') {
  if (!flags.message) {
    console.log('send needs --message "what the client wants to say".');
    process.exit(1);
  }
  if (flags.yes === undefined) {
    console.log('send needs --yes, and --yes means the client said yes in this session.');
    console.log('Their words, their decision. Nothing leaves this machine without it.');
    process.exit(1);
  }
  if (looksLikeSkillFile(flags.message)) {
    console.log('That looks like a skill file, not a message — send carries words, not skills.');
    console.log('Nothing was sent.');
    process.exit(0);
  }
  // An id of our own so a retry answers with the original instead of posting twice.
  const clientMsgId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const res = await call('POST', '/nudges', {
    harness_id: sharing.harness_id,
    body: flags.message,
    client_msg_id: clientMsgId,
  });
  if (res.status === 401) reportAuthProblem();
  if (res.status === 404 || res.status === 405) {
    console.log('This Daily Practice address cannot take a message that starts a conversation yet.');
    console.log('Nothing was sent. Replying to a message they send you still works.');
    process.exit(0);
  }
  if (res.status === 429) {
    console.log('That is a lot of messages in one hour — nothing was lost, try again later.');
    process.exit(0);
  }
  console.log(res.ok
    ? 'Sent. Daily Practice has it, and you will see when they read it.'
    : `The message answered ${res.status} — not retried; nothing was lost locally.`);
  process.exit(0);
}

if (command === 'reply') {
  if (!flags.nudge || !flags.message) {
    console.log('reply needs --nudge <id> and --message "text".');
    process.exit(1);
  }
  if (looksLikeSkillFile(flags.message)) {
    console.log('That looks like a skill file, not a reply — reply carries words, not skills.');
    console.log('Nothing was sent.');
    process.exit(0);
  }
  // Server field is `body` (bridge contract, BridgeNudgeReplyRequest); the CLI flag
  // stays --message because that's what it is to the client.
  const res = await call('POST', `/nudges/${encodeURIComponent(flags.nudge)}/reply`, {
    body: flags.message,
  });
  if (res.status === 401) reportAuthProblem();
  console.log(res.ok ? 'Reply sent — it\'s with Daily Practice.' : `Reply answered ${res.status} — not retried; try again next session.`);
  process.exit(0);
}

if (command === 'signal') {
  if (!SIGNAL_TYPES.includes(flags.type)) {
    console.log(`signal needs --type, one of: ${SIGNAL_TYPES.join(', ')}`);
    process.exit(1);
  }
  // How much work, what kind, and what did it. Without these a signal says only
  // that something of this type happened, never that it was 236 contacts, which is
  // the number the client and the coach actually care about.
  //   --count   how many things (plain digits only; anything else is rejected
  //             rather than sent, because Number() exotica like 0x12 or 1e3 don't
  //             belong on a wire)
  //   --routine the roster name of the hired agent that did the work, e.g.
  //             "prospecting" ("routine" is only the wire name)
  //   --tag     the kind of work, from the menu in shapes.mjs
  //   --asset   the slug of the skill, or other installed capability, that ran
  // There is deliberately no free-text field. The one-line story of the work lives
  // on this machine, in status/work-log.md or status/shift-log.md. The radio carries
  // labels, a count, and a time, never content (constitution Article V;
  // docs/radio.md).
  const work = {};
  if (flags.count !== undefined) {
    // One rule for a count, shared with done.mjs (shapes.mjs). Zero is decided per
    // type further down: only a shift may report it.
    const problem = countProblem(flags.count, { allowZero: true });
    if (problem) {
      console.log(`signal --count: ${problem}`);
      process.exit(1);
    }
    work.count = Number(flags.count);
  }
  const routine = typeof flags.routine === 'string' ? flags.routine.trim().slice(0, 60) : '';
  if (routine) work.routine = routine;
  if (flags.note !== undefined) {
    console.log('Note stays local: write it in status/shift-log.md — the radio never carries content. Sending without it.');
  }

  // The install journey is not work. A checkpoint carries no tag and names nothing
  // that ran, so install noise can never be counted as a finished task.
  if (flags.type === 'install_checkpoint' &&
      ['tag', 'asset', 'outcome', 'surface', 'asset-kind'].some((k) => flags[k] !== undefined)) {
    console.log('install_checkpoint is the install journey, not work. It takes no --tag and no --asset.');
    process.exit(1);
  }

  // The kind of work: one tag from the public menu, never one made up on the spot.
  if (flags.tag !== undefined) {
    if (!isWorkTag(flags.tag)) {
      console.log(String(flags.tag).trim()
        ? `"${flags.tag}" is not a tag on the menu. Pick the closest one, or "other" when nothing fits:`
        : '--tag needs a tag from the menu:');
      for (const line of workTagMenu()) console.log(line);
      console.log('Nothing was sent.');
      process.exit(1);
    }
    work.tag = flags.tag;
  }
  if (flags.type === 'task_completed') {
    if (!work.tag || work.count === undefined) {
      console.log('task_completed needs both --tag <kind of work> and --count <n>: a finished task says what kind and how many.');
      if (!work.tag) for (const line of workTagMenu()) console.log(line);
      process.exit(1);
    }
    // A finished task that did zero things is a contradiction, and the server
    // answers it with a 400. Only a shift may report 0: it ran and found nothing.
    if (work.count < 1) {
      console.log('task_completed needs --count of at least 1: a finished task did at least one thing. Only a shift (routine_completed) may report 0.');
      process.exit(1);
    }
    // On this type the agent's name is held to the roster-name rule, so a new
    // kind of signal opens no new way to put words on the wire. The older types
    // keep taking --routine exactly as they always have, so no shift report
    // already in the field starts failing; done.mjs checks the name for those
    // before it ever gets here.
    const routineProblem = work.routine ? labelProblem(work.routine, 'agent') : null;
    if (routineProblem) {
      console.log(`--routine names the hired agent by its roster name, never by a description. ${routineProblem}`);
      process.exit(1);
    }
  }

  if (flags.type === 'routine_completed' && (!work.routine || work.count === undefined)) {
    console.log('routine_completed needs both --routine <name> and --count <n> — a shift report must say who and how many.');
    process.exit(1);
  }
  // What ran, when a skill or another installed capability did the work. The
  // fields travel together, and the slug is a label, never content: an empty or
  // free-text slug is refused here rather than tidied up, so nothing but a label
  // can ever leave in this field. (The server's replay key also treats '' and
  // absent as the same thing, so '' must never be sent.)
  // This block sits exactly where the unmerged radio-v2 branch puts its own asset
  // handling, on purpose. When that branch is rebased, git stops here and asks,
  // instead of quietly keeping both copies. Keep this one, and add to it.
  const asset = typeof flags.asset === 'string' ? flags.asset.trim() : '';
  if (!asset && ['asset', 'outcome', 'surface', 'asset-kind'].some((k) => flags[k] !== undefined)) {
    console.log('Asset fields travel together: add --asset <slug> (which skill or capability did the work).');
    process.exit(1);
  }
  if (asset) {
    const problem = labelProblem(asset, 'skill');
    if (problem) {
      console.log(`--asset names what ran by its slug, never by a description. ${problem}`);
      process.exit(1);
    }
    if (!ASSET_OUTCOMES.includes(flags.outcome)) {
      console.log(`--asset needs --outcome, one of: ${ASSET_OUTCOMES.join(', ')}.`);
      process.exit(1);
    }
    const surface = flags.surface !== undefined
      ? flags.surface
      : (flags.type === 'routine_completed' ? 'routine' : 'agent');
    if (!ASSET_SURFACES.includes(surface)) {
      console.log(`--surface must be one of: ${ASSET_SURFACES.join(', ')}.`);
      process.exit(1);
    }
    work.asset = asset;
    work.outcome = flags.outcome;
    work.surface = surface;
    if (flags['asset-kind'] !== undefined) {
      if (!PACKAGE_KINDS.includes(flags['asset-kind'])) {
        console.log(`--asset-kind must be one of: ${PACKAGE_KINDS.join(', ')}.`);
        process.exit(1);
      }
      work.asset_kind = flags['asset-kind'];
    }
  }

  const report = await reportSignal({root:ROOT,signalType:flags.type,payload:work});
  if (report.result === 'refused 401') reportAuthProblem();
  if (report.status === 'sent') console.log(`Signal sent (${flags.type}).`);
  else if (report.status === 'off') console.log('Radio is off (or not configured) — report saved locally for recovery.');
  else if (report.status === 'invalid') console.log(report.reason);
  resultLine(report.status === 'sent' ? 'sent' : report.result || report.status);
  process.exit(0);
}
