#!/usr/bin/env node
/**
 * The radio, client side — talks to Daily Practice's bridge doors when (and only when)
 * the radio is on. Contract: specs/002-production-line/contracts/bridge-radio.md.
 *
 *   node status/radio.mjs check
 *       Read the radio (GET /nudges). Run at session start. An empty radio is the
 *       normal, silent case. A skill on offer is announced in words, and the exact
 *       library --install command is printed under the fence for the assistant.
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
 *   node status/radio.mjs library --install <slug> --yes
 *       Collect a skill Daily Practice has put on the radio (GET /library/<slug>),
 *       write it to .claude/skills/<slug>/SKILL.md, and report it to the shelf.
 *       Never overwrites a skill already there. Their yes first, always.
 *
 *   node status/radio.mjs contribute --slug <slug> --yes
 *       Offer a skill this machine runs back up to the library (POST /contributions).
 *       Sends .claude/skills/<slug>/SKILL.md for a curator to read; nothing is
 *       published by sending it. Same rule as send and reply: their yes first.
 *
 *   node status/radio.mjs signal --type <type> [--routine <name> --count <n>]
 *       Report "real work happened" (POST /signals). Types: install_checkpoint,
 *       workflow_execution_completed, outreach_approved, outreach_rejected,
 *       debrief_completed, crm_updated, routine_completed (which requires
 *       --routine and --count). A label, a count, and a timestamp — never content:
 *       the story of a shift stays local, in status/shift-log.md.
 *
 *   node status/radio.mjs report-install --slug <slug> --kind <kind> --version <v>
 *                                        [--role <slug|custom> --purpose "<sentence>"]
 *       Tell the shelf a Library package was installed here (POST /assets), after its
 *       smoke test passed. A hired agent adds --role (library/ROLES.md slug, or
 *       custom) and --purpose (≤140 chars, about the agent, never a person/company/
 *       number) — the labels that let the role bank become evidence-based.
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
import { radioOn as radioIsOn, parseInstallDirective } from './shapes.mjs';

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
  console.log('Usage: node status/radio.mjs <check | reply | send | library | contribute | signal | report-install> [--flags]');
  console.log('Details in the header of this file, or specs/002-production-line/contracts/bridge-radio.md.');
}

if (!command || !['check', 'reply', 'send', 'library', 'contribute', 'signal', 'report-install'].includes(command)) {
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
// The version this harness is on, stated on every call rather than only when a
// signal fires. A signal needs real work to complete; a check happens at every
// session start. Reporting it only on the former meant a machine could update
// and still read as its old version for a week, and Daily Practice could not
// tell whether a release had landed anywhere. It is a label about this folder,
// never anything about the client's work.
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${sharing.install_token}`,
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
    console.log(`The radio address didn't answer (${err?.cause?.code || err.code || err.message}) — not retried, nothing lost locally.`);
    process.exit(0);
  }
}

function reportAuthProblem() {
  console.log('The radio answered "that key isn\'t valid" (401). The key may have been revoked —');
  console.log('ask support@dailypractice.world for a fresh pairing code. Nothing else is affected.');
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

/**
 * A backstop against the one mistake that keeps happening: cramming a skill into
 * a message. `send` and `reply` carry a person's words; a skill goes up with
 * `contribute`. A SKILL.md opens with YAML frontmatter naming the skill, so that
 * is what we look for — and refuse to send, pointing at the right command.
 */
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
  const offers = [];
  for (const m of waiting) {
    console.log('');
    console.log(`From ${m.from_name || 'Daily Practice'}, ${whenWords(m.at)}:`);
    console.log('');
    const lines = String(m.body).split('\n');
    // A skill on offer arrives with a machine line first (shapes.mjs). The client
    // hears what it means, never the line itself. The words the coach wrote after
    // it are theirs to hear as written.
    const offer = parseInstallDirective(m.body);
    if (offer) {
      if (!offers.some((o) => o.slug === offer.slug)) offers.push(offer);
      console.log(`  Daily Practice is offering you a skill: ${offer.slug}, version ${offer.version}.`);
      lines.shift();
    }
    for (const line of lines) console.log(`  ${line}`);
  }
  console.log('');
  console.log('--- for the assistant, not to be read aloud ---');
  console.log('Read the message above to the client in full. If they want to answer,');
  console.log('take their words and run this, replacing only the message:');
  console.log(`  node status/radio.mjs reply --nudge ${newest.key} --message "their words" --yes`);
  for (const offer of offers) {
    console.log(`A skill is on offer: ${offer.slug}. To show the client what it is, with nothing written yet:`);
    console.log(`  node status/radio.mjs library --install ${offer.slug}`);
    console.log('Run it again with --yes only when they say yes. Never before.');
  }
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
    console.log('To send a skill up to the library, use:');
    console.log('  node status/radio.mjs contribute --slug <slug>');
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
    console.log('To send a skill up to the library, use:');
    console.log('  node status/radio.mjs contribute --slug <slug>');
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

if (command === 'contribute') {
  // Offer a skill this machine runs back up to the Daily Practice library.
  // The markdown travels; a curator reads it and decides. Nothing is published
  // by this call, and — like send and reply — it only goes on the client's yes.
  const slug = flags.slug;
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    console.log('contribute needs --slug <slug>, the skill to offer, in lower-case words joined by hyphens.');
    process.exit(1);
  }

  const file = join(__dirname, '..', '.claude', 'skills', slug, 'SKILL.md');
  if (!existsSync(file)) {
    console.log(`No skill called "${slug}" on this machine (looked for .claude/skills/${slug}/SKILL.md).`);
    process.exit(0);
  }
  const content = readFileSync(file, 'utf8');
  if (!content.trim()) {
    console.log(`"${slug}" is empty — nothing to offer.`);
    process.exit(0);
  }
  // The library door takes at most 200000 characters. A skill larger than that
  // is not refused quietly — the person is told, and nothing is sent.
  const MAX = 200000;
  if (content.length > MAX) {
    console.log(`"${slug}" is ${content.length} characters; the library takes at most ${MAX}. Nothing sent.`);
    console.log('A skill this large usually means more than one file — tell Daily Practice and we will sort the shape.');
    process.exit(0);
  }

  if (flags.yes === undefined) {
    console.log(`You would offer "${slug}" to the Daily Practice library — ${content.length} characters.`);
    console.log('A curator reads it and decides; nothing is published by sending it.');
    console.log('');
    console.log('The first lines of what would be sent:');
    for (const line of content.split('\n').slice(0, 12)) console.log(`  ${line}`);
    console.log('');
    console.log('--- for the assistant, not to be read aloud ---');
    console.log('Show the client what this offers, in your own plain words. On their yes:');
    console.log(`  node status/radio.mjs contribute --slug ${slug} --yes`);
    process.exit(0);
  }

  const res = await call('POST', '/contributions', {
    harness_id: sharing.harness_id,
    slug,
    kind: 'skill',
    content,
  });
  if (res.status === 401) reportAuthProblem();
  if (res.status === 404 || res.status === 405) {
    console.log('This Daily Practice address cannot take a skill offer yet. Nothing was sent.');
    process.exit(0);
  }
  console.log(res.ok
    ? `Offered "${slug}" to the Daily Practice library. A curator will look at it; nothing is published yet.`
    : `The offer answered ${res.status} — not retried; nothing was lost locally.`);
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
    if (!flags.kind || flags.kind === 'agent') {
      console.log('An agent hire also carries --role <library/ROLES.md slug | custom> and --purpose "<one sentence>".');
    }
    process.exit(1);
  }
  // The role bank's evidence loop (feature 005, Article V Tier 1 + Tier 3): a bank
  // slug or "custom", plus the one purpose sentence the client approved verbatim in
  // the job-sheet readback. Agent hires only; labels never content.
  const role = (flags.role || '').trim();
  const purpose = (flags.purpose || '').trim();
  if ((role || purpose) && flags.kind !== 'agent') {
    console.log('--role and --purpose belong to agent hires only (spec 005). Not sent — retry without them.');
    process.exit(1);
  }
  if (role && role !== 'custom') {
    // The bank is on this disk — check against it, not just the slug shape. If the
    // file is missing (older folder), fall back to shape so the report still lands.
    let bankSlugs = null;
    try {
      const bank = readFileSync(join(__dirname, '..', 'library', 'ROLES.md'), 'utf8');
      bankSlugs = [...bank.matchAll(/^## `([a-z][a-z0-9-]{0,29})`/gm)].map((m) => m[1]);
    } catch { /* no bank file — shape check below still applies */ }
    if (bankSlugs && bankSlugs.length > 0 && !bankSlugs.includes(role)) {
      console.log(`--role "${role}" is not in library/ROLES.md (${bankSlugs.join(', ')}) and is not "custom". Not sent.`);
      process.exit(1);
    }
    if (!/^[a-z][a-z0-9-]{0,29}$/.test(role)) {
      console.log('--role must be a kebab slug from library/ROLES.md, or "custom". Not sent.');
      process.exit(1);
    }
  }
  if (purpose.length > 140) {
    console.log('--purpose is over 140 characters — shorten it to one sentence about the agent. Not sent.');
    process.exit(1);
  }
  // Tier-3 tripwire, same spirit as the shift-log note rule and the send/reply
  // skill-file refusal: the purpose describes the agent, never a person, a company,
  // or a number. Digits and handles are machine-checkable — check them.
  if (/\d/.test(purpose) || /@/.test(purpose)) {
    console.log('--purpose may not carry numbers or handles — it describes the agent, never a person,');
    console.log('a company, or a figure. Reword it (e.g. "warms CRM leads toward booked meetings"). Not sent.');
    process.exit(1);
  }
  const res = await call('POST', '/assets', {
    harness_id: sharing.harness_id,
    slug: flags.slug,
    kind: flags.kind,
    version: flags.version,
    installed_at: new Date().toISOString(),
    ...(role ? { role } : {}),
    ...(purpose ? { purpose } : {}),
  });
  if (res.status === 401) reportAuthProblem();
  console.log(res.ok
    ? `Shelf updated — Daily Practice knows this machine runs ${flags.slug} v${flags.version}.`
    : `Shelf report answered ${res.status} — not retried; the install itself is unaffected.`);
  process.exit(0);
}
