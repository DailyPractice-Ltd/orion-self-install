#!/usr/bin/env node
/**
 * The radio, client side — talks to Daily Practice's bridge doors when (and only when)
 * the radio is on. Contract: specs/002-production-line/contracts/bridge-radio.md.
 *
 *   node status/radio.mjs check
 *       Read the mailbox (GET /nudges). Run at session start. Empty mailbox is the
 *       normal, silent case.
 *
 *   node status/radio.mjs reply --nudge <id> --message "the client's reply"
 *       Send a reply back (POST /nudges/<id>/reply). Only ever run after the client's
 *       explicit yes in this session — the reply is theirs, not yours.
 *
 *   node status/radio.mjs signal --type <type>
 *       Report "real work happened" (POST /signals). Types: install_checkpoint,
 *       workflow_execution_completed, outreach_approved, outreach_rejected,
 *       debrief_completed, crm_updated. Type + timestamp only — no content, ever.
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

import { readFileSync, existsSync } from 'node:fs';
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
];
const PACKAGE_KINDS = ['agent', 'skill', 'workflow', 'program'];

// ── Arguments ───────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? '';
}

function usage() {
  console.log('Usage: node status/radio.mjs <check | reply | signal | report-install> [--flags]');
  console.log('Details in the header of this file, or specs/002-production-line/contracts/bridge-radio.md.');
}

if (!command || !['check', 'reply', 'signal', 'report-install'].includes(command)) {
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

if (command === 'check') {
  const res = await call('GET', '/nudges');
  if (res.status === 401) reportAuthProblem();
  if (!res.ok) { console.log(`Mailbox check answered ${res.status} — skipped, will try next session.`); process.exit(0); }
  // The server wraps the list: { "nudges": [...] } (bridge contract, BridgeNudgesResponse).
  const data = await res.json().catch(() => null);
  const nudges = Array.isArray(data?.nudges) ? data.nudges : [];
  if (nudges.length === 0) {
    console.log('Mailbox empty — no messages from Daily Practice.');
    process.exit(0);
  }
  console.log(`${nudges.length} message${nudges.length === 1 ? '' : 's'} from Daily Practice:`);
  for (const n of nudges) {
    console.log('');
    console.log(`  [${n.id}] (${n.created_at || 'no date'})`);
    console.log(`  ${n.body}`);
  }
  console.log('');
  console.log('To send a reply (only with the client\'s explicit yes):');
  console.log('  node status/radio.mjs reply --nudge <id> --message "their reply, in their words"');
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

if (command === 'signal') {
  if (!SIGNAL_TYPES.includes(flags.type)) {
    console.log(`signal needs --type, one of: ${SIGNAL_TYPES.join(', ')}`);
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
