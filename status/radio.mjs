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
 *       write its folder to .claude/skills/<slug>/, and report it to the shelf.
 *       What the skill lists under "Fill at install" is filled from status.json
 *       as it lands (the business name, the agent's name); the rest is printed
 *       for the assistant to ask. Never overwrites a skill already there. Their
 *       yes first, always.
 *
 *   node status/radio.mjs contribute --slug <slug> --yes
 *       Offer a skill this machine runs back up to the library (POST /contributions).
 *       Sends the whole skill folder, text files only (SKILL.md plus references,
 *       templates), for a curator to read; scripts and binaries never travel.
 *       Nothing is published by sending it. Same rule as send and reply: their
 *       yes first.
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
 *                             The five approval moments, unchanged.
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
 *       machine, in the memory log and, for a shift, in status/shift-log.md.
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

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, lstatSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  radioOn as radioIsOn, parseInstallDirective, isWorkTag, workTagMenu, labelProblem, countProblem,
  packSkillFolder, skillBundleProblem, fillBundle, SKILL_ENTRY_FILE,
} from './shapes.mjs';

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
  console.log('The radio answered "that key isn\'t valid" (401). The key may have been revoked —');
  console.log('ask support@dailypractice.world for a fresh pairing code. Nothing else is affected.');
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
  // A skill arrives as its whole folder when the library has one; an older
  // library sends just the SKILL.md. Either way the other end is data: every
  // path is checked here before a single byte is written.
  const bundle = Array.isArray(asset?.files) && asset.files.length > 0 ? asset.files : null;
  if (bundle) {
    const problem = skillBundleProblem(bundle);
    if (problem) {
      console.log(`"${slug}" arrived in a shape this harness will not write (${problem}). Nothing written. Tell Daily Practice.`);
      process.exit(0);
    }
  }
  const content = bundle
    ? bundle.find((f) => f.path === SKILL_ENTRY_FILE).content
    : (typeof asset?.content === 'string' ? asset.content : '');
  if (!content.trim()) {
    console.log(`"${slug}" arrived empty — nothing written. Tell Daily Practice.`);
    process.exit(0);
  }
  const arrived = bundle || [{ path: SKILL_ENTRY_FILE, content }];
  const incoming = arrived.map((f) => f.path);

  // A library skill is written for any business, and lists in its own SKILL.md
  // what gets filled as it lands. What this harness already knows goes in here;
  // what it does not is asked by the assistant once the skill is on disk. A
  // skill that lists nothing lands exactly as it arrived.
  const fill = fillBundle(arrived, { business_name: status.business_name, agent_name: status.agent_name });
  if (fill.problem) {
    console.log(`"${slug}" arrived in a shape this harness will not write (${fill.problem}). Nothing written. Tell Daily Practice.`);
    process.exit(0);
  }
  const toWrite = fill.files;
  const landing = toWrite.find((f) => f.path === SKILL_ENTRY_FILE).content;

  const dir = join(__dirname, '..', '.claude', 'skills', slug);

  // Their skill, their machine. A skill they have already taught or edited is
  // never overwritten by something arriving over the radio — the whole folder
  // is theirs, so an existing folder means hands off.
  if (existsSync(dir)) {
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
    console.log(`It would be written to .claude/skills/${slug}/ as ${incoming.length} file${incoming.length === 1 ? '' : 's'}:`);
    for (const p of incoming) console.log(`  ${p}`);
    console.log('');
    if (fill.filled.length > 0) {
      console.log('Filled in as it lands, so it reads as yours:');
      for (const f of fill.filled) console.log(`  ${f.question}: ${f.value}`);
      console.log('');
    }
    if (fill.open.length > 0) {
      console.log('Your AI will ask you, before the skill is used:');
      for (const o of fill.open) console.log(`  ${o.question}`);
      console.log('');
    }
    console.log('The first lines of SKILL.md:');
    for (const line of landing.split('\n').slice(0, 12)) console.log(`  ${line}`);
    console.log('');
    console.log('--- for the assistant, not to be read aloud ---');
    console.log('Show the client what this is, in your own plain words. On their yes:');
    console.log(`  node status/radio.mjs library --install ${slug} --yes`);
    process.exit(0);
  }

  // All or nothing: the folder is built beside its final name and moved into
  // place only once every file has landed, so a failure half-way never leaves
  // a broken skill that the "already have it" rule would then protect forever.
  const staging = join(dirname(dir), `.${slug}.installing-${process.pid}`);
  try {
    mkdirSync(staging, { recursive: true });
    for (const f of toWrite) {
      const target = join(staging, ...f.path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.content, 'utf8');
    }
    renameSync(staging, dir);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    console.log(`Could not write "${slug}" (${err?.code || err?.message || 'unknown'}). Nothing was changed on this machine.`);
    process.exit(0);
  }
  console.log(`Written: ${incoming.length} file${incoming.length === 1 ? '' : 's'} to .claude/skills/${slug}/`);
  for (const f of fill.filled) console.log(`Filled in: ${f.question} (${f.value})`);

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
  if (fill.open.length > 0) {
    console.log('This skill is not ready until these are filled. Ask the client, one at a time:');
    for (const o of fill.open) console.log(`  {{${o.token}}}: ${o.question}`);
    console.log('The answer is the client\'s, in their words: never take one from status.json or any other file.');
    console.log(`Write each answer in place of its token in every file under .claude/skills/${slug}/,`);
    console.log('and change its line under "Fill at install" in SKILL.md to "- TOKEN: answer".');
  }
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

  const dir = join(__dirname, '..', '.claude', 'skills', slug);
  if (!existsSync(join(dir, SKILL_ENTRY_FILE))) {
    console.log(`No skill called "${slug}" on this machine (looked for .claude/skills/${slug}/SKILL.md).`);
    process.exit(0);
  }
  // The whole folder travels: SKILL.md plus its references and templates, text
  // files only. Scripts and binaries stay behind, and the person is told so.
  const { files, skipped } = packSkillFolder(dir, { readdirSync, lstatSync, readFileSync });
  // The shape first: a folder whose file is named "skill.md" passes the look
  // above on a Mac, and it has no SKILL.md, which is not the same as empty.
  const problem = skillBundleProblem(files);
  if (problem) {
    console.log(`"${slug}" cannot be sent as it is (${problem}). Nothing sent.`);
    console.log('Tell Daily Practice and we will sort the shape.');
    process.exit(0);
  }
  const content = files.find((f) => f.path === SKILL_ENTRY_FILE).content;
  if (!content.trim()) {
    console.log(`"${slug}" is empty — nothing to offer.`);
    process.exit(0);
  }
  const total = files.reduce((n, f) => n + f.content.length, 0);

  if (flags.yes === undefined) {
    console.log(`You would offer "${slug}" to the Daily Practice library — ${files.length} file${files.length === 1 ? '' : 's'}, ${total} characters.`);
    console.log('A curator reads it and decides; nothing is published by sending it.');
    console.log('');
    console.log('What would be sent:');
    for (const f of files) console.log(`  ${f.path}`);
    if (skipped.length > 0) {
      console.log('Staying behind (the radio carries plain text files only, in names every computer can write):');
      for (const s of skipped) console.log(`  ${s}`);
    }
    console.log('');
    console.log('The first lines of SKILL.md:');
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
    // The SKILL.md on its own, for a library that only knows one file; and the
    // whole folder, for one that knows a skill is a folder.
    content,
    files,
  });
  if (res.status === 401) reportAuthProblem();
  if (res.status === 404 || res.status === 405) {
    console.log('This Daily Practice address cannot take a skill offer yet. Nothing was sent.');
    process.exit(0);
  }
  console.log(res.ok
    ? `Offered "${slug}" to the Daily Practice library (${files.length} file${files.length === 1 ? '' : 's'}). A curator will look at it; nothing is published yet.`
    : `The offer answered ${res.status} — not retried; nothing was lost locally.`);
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
  // on this machine, in the memory log and status/shift-log.md. The radio carries
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
  resultLine(res.ok ? 'sent' : `refused ${res.status}`);
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
  if (flags.kind === 'agent' && (!role || !purpose)) {
    // Warn, never block: an older folder's PACKAGE.md may predate 0.8.0, and a
    // late report is better than none. But say it loudly — a roleless hire is
    // invisible to the role bank's evidence loop (spec 005).
    console.log('Heads up: an agent hire should carry --role and --purpose (library/ROLES.md).');
    console.log('Sending without them — this hire will be untyped on the shelf.');
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
