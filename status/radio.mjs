#!/usr/bin/env node
/**
 * The radio, client side — talks to Daily Practice's bridge doors when (and only when)
 * the radio is on. Contract: specs/002-production-line/contracts/bridge-radio.md.
 *
 *   node status/radio.mjs check
 *       Read the radio (GET /nudges). Run at session start. An empty radio is the
 *       normal, silent case.
 *
 *   node status/radio.mjs reply --nudge <id> --message "the client's reply"
 *       Send a reply back (POST /nudges/<id>/reply). Only ever run after the client's
 *       explicit yes in this session — the reply is theirs, not yours.
 *
 *   node status/radio.mjs send --message "what the client wants to say" --yes
 *       Start a conversation (POST /nudges). For when the client has something to say
 *       and there is nothing to reply to. Same rule as reply: their words, their yes.
 *
 *   node status/radio.mjs library --install <slug> --yes
 *       Collect a skill Daily Practice has put on the radio (GET /library/<slug>),
 *       write it to .claude/skills/<slug>/SKILL.md, and report it to the shelf.
 *       Never overwrites a skill already there. Their yes first, always.
 *
 *   node status/radio.mjs signal --type <type> [--routine <name> --count <n>]
 *       Report "real work happened" (POST /signals). Types: install_checkpoint,
 *       workflow_execution_completed, outreach_approved, outreach_rejected,
 *       debrief_completed, crm_updated, routine_completed (which requires
 *       --routine and --count). A label, a count, and a timestamp — never content:
 *       the story of a shift stays local, in status/shift-log.md.
 *
 *   node status/radio.mjs report-install --slug <slug> --kind <kind> --version <v>
 *       Tell the shelf a Library package was installed here (POST /assets), after its
 *       smoke test passed.
 *
 * Radio-on means ALL of: sharing.status_signal_enabled is true, and bridge_url,
 * harness_id, install_token are set (the welcome pack). Anything less → every command
 * prints one plain line, sends nothing, and exits 0. Network trouble never retries and
 * never blocks local work — same posture as emit-status.mjs since feature 001.
 *
 * Dependency-free: node:fs and global fetch only. No package.json, no npm install.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { radioOn as radioIsOn } from './shapes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = join(__dirname, 'status.json');

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
];
const PACKAGE_KINDS = ['agent', 'skill', 'workflow', 'program'];

// ── Arguments ───────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? '';
}

function usage() {
  console.log('Usage: node status/radio.mjs <check | reply | send | library | signal | report-install> [--flags]');
  console.log('Details in the header of this file, or specs/002-production-line/contracts/bridge-radio.md.');
}

if (!command || !['check', 'reply', 'send', 'library', 'signal', 'report-install'].includes(command)) {
  usage();
  process.exit(command ? 1 : 0);
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
const radioOn = radioIsOn(status);

if (!radioOn) {
  console.log('Radio is off (or not configured) — nothing sent, nothing checked. Local work is unaffected.');
  process.exit(0);
}

const base = String(sharing.bridge_url).replace(/\/+$/, '');
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${sharing.install_token}`,
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
    console.log(`The radio address didn't answer (${err?.cause?.code || err.code || err.message}) — not retried, nothing lost locally.`);
    process.exit(0);
  }
}

function reportAuthProblem() {
  console.log('The radio answered "that key isn\'t valid" (401). The key may have been revoked —');
  console.log('ask support@dailypractice.world for a fresh welcome pack. Nothing else is affected.');
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

  const waiting = messages.filter((m) => m.from === 'daily_practice');
  if (waiting.length === 0) {
    console.log('Radio quiet — nothing waiting.');
    process.exit(0);
  }

  // What follows is for the client's ears. Read it to them as it is written:
  // it is a person talking to them, not a status report about a channel.
  const newest = waiting[waiting.length - 1];
  for (const m of waiting) {
    console.log('');
    console.log(`From ${m.from_name || 'Daily Practice'}, ${whenWords(m.at)}:`);
    console.log('');
    for (const line of String(m.body).split('\n')) console.log(`  ${line}`);
  }
  console.log('');
  console.log('--- for the assistant, not to be read aloud ---');
  console.log('Read the message above to the client in full. If they want to answer,');
  console.log('take their words and run this, replacing only the message:');
  console.log(`  node status/radio.mjs reply --nudge ${newest.key} --message "their words" --yes`);
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
  // Server field is `body` (bridge contract, BridgeNudgeReplyRequest); the CLI flag
  // stays --message because that's what it is to the client.
  const res = await call('POST', `/nudges/${encodeURIComponent(flags.nudge)}/reply`, {
    body: flags.message,
  });
  if (res.status === 401) reportAuthProblem();
  console.log(res.ok ? 'Reply sent — it\'s with Daily Practice.' : `Reply answered ${res.status} — not retried; try again next session.`);
  process.exit(0);
}

if (command === 'library') {
  const slug = flags.install;
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    console.log('library needs --install <slug>, in lower-case words joined by hyphens.');
    process.exit(1);
  }

  const res = await call('GET', `/library/${slug}`);
  if (res.status === 401) reportAuthProblem();
  if (res.status === 404) {
    console.log(`Daily Practice has no published skill called "${slug}".`);
    process.exit(0);
  }
  if (!res.ok) { console.log(`The library answered ${res.status} — nothing written, try next session.`); process.exit(0); }

  const asset = await res.json().catch(() => null);
  const content = typeof asset?.content === 'string' ? asset.content : '';
  if (!content.trim()) {
    console.log(`"${slug}" arrived empty — nothing written. Tell Daily Practice.`);
    process.exit(0);
  }

  const dir = join(__dirname, '..', '.claude', 'skills', slug);
  const file = join(dir, 'SKILL.md');

  // Their skill, their machine. A skill they have already taught or edited is
  // never overwritten by something arriving over the radio.
  if (existsSync(file)) {
    console.log(`You already have a skill called "${slug}". Nothing was touched.`);
    console.log('If you want the Daily Practice version instead, rename or delete yours first.');
    process.exit(0);
  }

  if (flags.yes === undefined) {
    // Show it before it lands. The client decides with the thing in front of them.
    console.log(`${asset.name || slug} — from the Daily Practice library, version ${asset.version || '?'}`);
    if (asset.one_liner) console.log(asset.one_liner);
    if (Array.isArray(asset.tools_required) && asset.tools_required.length > 0) {
      console.log(`Needs: ${asset.tools_required.join(', ')}`);
    }
    console.log('');
    console.log('It would be written to:');
    console.log(`  .claude/skills/${slug}/SKILL.md`);
    console.log('');
    console.log('The first lines of it:');
    for (const line of content.split('\n').slice(0, 12)) console.log(`  ${line}`);
    console.log('');
    console.log('--- for the assistant, not to be read aloud ---');
    console.log('Show the client what this is, in your own plain words. On their yes:');
    console.log(`  node status/radio.mjs library --install ${slug} --yes`);
    process.exit(0);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, content, 'utf8');
  console.log(`Written: .claude/skills/${slug}/SKILL.md`);

  // The shelf is how Daily Practice knows who is affected when this improves.
  const report = await call('POST', '/assets', {
    harness_id: sharing.harness_id,
    slug,
    kind: asset.kind || 'skill',
    version: asset.version || '0.0.0',
    installed_at: new Date().toISOString(),
  });
  console.log(report.ok
    ? `Daily Practice knows this machine now runs ${slug}.`
    : 'Written locally; the shelf report did not go through, which changes nothing here.');
  console.log('');
  console.log('--- for the assistant, not to be read aloud ---');
  console.log('Record it under packages in status/status.json, then try it on something real');
  console.log('before telling the client it works.');
  process.exit(0);
}

if (command === 'signal') {
  if (!SIGNAL_TYPES.includes(flags.type)) {
    console.log(`signal needs --type, one of: ${SIGNAL_TYPES.join(', ')}`);
    process.exit(1);
  }
  // How much work, and which routine did it. Without these a signal says only that
  // something of this type happened — never that it was 236 contacts, which is the
  // number the client and the coach actually care about.
  //   --count   how many things (plain digits only; rejected rather than sent
  //             otherwise — Number() exotica like 0x12 or 1e3 don't belong on a wire)
  //   --routine which named routine ran, e.g. "prospecting"
  // There is deliberately no free-text field. The one-line story of a shift lives in
  // status/shift-log.md, locally — the radio carries a label, a count, and a time,
  // never content (constitution Article V; docs/radio.md).
  const work = {};
  if (flags.count !== undefined) {
    if (!/^\d{1,9}$/.test(String(flags.count))) {
      console.log('signal --count must be a whole number in plain digits (how many things the routine did).');
      process.exit(1);
    }
    work.count = Number(flags.count);
  }
  const routine = typeof flags.routine === 'string' ? flags.routine.trim().slice(0, 60) : '';
  if (routine) work.routine = routine;
  if (flags.note !== undefined) {
    console.log('Note stays local: write it in status/shift-log.md — the radio never carries content. Sending without it.');
  }
  if (flags.type === 'routine_completed' && (!work.routine || work.count === undefined)) {
    console.log('routine_completed needs both --routine <name> and --count <n> — a shift report must say who and how many.');
    process.exit(1);
  }

  const res = await call('POST', '/signals', {
    harness_id: sharing.harness_id,
    signal_type: flags.type,
    // Server name for the client-clock timestamp; it anchors replay idempotence.
    occurred_at: new Date().toISOString(),
    payload: {
      ops_stage: status.ops_stage,
      harness_status: status.harness_status,
      template_version: status.template_version,
      ...work,
    },
  });
  if (res.status === 401) reportAuthProblem();
  console.log(res.ok ? `Signal sent (${flags.type}).` : `Signal answered ${res.status} — not retried.`);
  process.exit(0);
}

if (command === 'report-install') {
  if (!flags.slug || !PACKAGE_KINDS.includes(flags.kind) || !flags.version) {
    console.log(`report-install needs --slug <slug>, --kind <${PACKAGE_KINDS.join('|')}>, --version <v>.`);
    process.exit(1);
  }
  const res = await call('POST', '/assets', {
    harness_id: sharing.harness_id,
    slug: flags.slug,
    kind: flags.kind,
    version: flags.version,
    installed_at: new Date().toISOString(),
  });
  if (res.status === 401) reportAuthProblem();
  console.log(res.ok
    ? `Shelf updated — Daily Practice knows this machine runs ${flags.slug} v${flags.version}.`
    : `Shelf report answered ${res.status} — not retried; the install itself is unaffected.`);
  process.exit(0);
}
