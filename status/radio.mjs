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
 *   node status/radio.mjs signal --type <type> [--routine <name> --count <n>]
 *                                [--asset <slug> --outcome <o> [--surface <s>]]
 *       Report "real work happened" (POST /signals). Types: install_checkpoint,
 *       workflow_execution_completed, outreach_approved, outreach_rejected,
 *       debrief_completed, crm_updated, routine_completed (which requires
 *       --routine and --count), asset_used (which requires --asset and
 *       --outcome). A label, a count, and a timestamp — never content: the
 *       story of a shift stays local, in status/shift-log.md. Since 0.6.0 any
 *       signal MAY also name the Library capability that did the work
 *       (--asset meeting-sizing --outcome run_completed) — still a label,
 *       never content, and one signal per moment, never two: a shift that
 *       used a skill is the SAME routine_completed report, now carrying the
 *       asset fields.
 *
 *   node status/radio.mjs report-use --slug <slug> --outcome <o> [--surface agent|routine]
 *                                    [--version <v>] [--kind <k>]
 *       Tell the library an installed capability was USED here, when no other
 *       completion moment exists (sugar for signal --type asset_used).
 *       Outcomes: rep_logged — the human's own yes, "I did the hard action",
 *       asked and never assumed; run_completed — automation finished;
 *       skipped — offered, declined. Skips count nowhere; they just keep the
 *       story honest.
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
  // A hired agent's scheduled shift completed — standing yes given at hire on
  // the job sheet (contracts/agent-anatomy.md). Carries --routine and --count.
  'routine_completed',
  // A Library capability was used where NO other completion moment exists (a
  // skill applied in conversation). Every other type may also carry the asset
  // fields — one signal per moment, never two (radio v2, 0.6.0).
  'asset_used',
];
const PACKAGE_KINDS = ['agent', 'skill', 'workflow', 'program'];
// rep_logged is the human's own yes — asked, never assumed. run_completed is
// automation finishing. skipped is an honest no; it counts nowhere.
const ASSET_OUTCOMES = ['rep_logged', 'run_completed', 'skipped'];
// This script IS the agent/routine surface; n8n nodes name their own.
const ASSET_SURFACES = ['agent', 'routine'];

// ── Arguments ───────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? '';
}

function usage() {
  console.log('Usage: node status/radio.mjs <check | reply | signal | report-use | report-install> [--flags]');
  console.log('Details in the header of this file, or specs/002-production-line/contracts/bridge-radio.md.');
}

if (!command || !['check', 'reply', 'signal', 'report-use', 'report-install'].includes(command)) {
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
  if (!res.ok) { console.log(`Radio check answered ${res.status} — skipped, will try next session.`); process.exit(0); }
  // The server wraps the list: { "nudges": [...] } (bridge contract, BridgeNudgesResponse).
  const data = await res.json().catch(() => null);
  const nudges = Array.isArray(data?.nudges) ? data.nudges : [];
  if (nudges.length === 0) {
    console.log('Radio quiet — no messages from Daily Practice.');
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
  // Radio v2 (0.6.0): any signal MAY name the Library capability that did the
  // work. The fields travel together, the slug is a label (never content),
  // and an empty slug is refused rather than normalised — the server's replay
  // key treats '' and absent identically, so '' must never leave here.
  const asset = typeof flags.asset === 'string' ? flags.asset.trim().slice(0, 200) : '';
  if (!asset && ['outcome', 'surface', 'asset-version', 'asset-kind'].some((k) => flags[k] !== undefined)) {
    console.log('Asset fields travel together — add --asset <slug> (which capability did the work).');
    process.exit(1);
  }
  if (flags.type === 'asset_used' && !asset) {
    console.log('asset_used needs --asset <slug> and --outcome — or use the sugar: node status/radio.mjs report-use --slug <slug> --outcome <o>.');
    process.exit(1);
  }
  if (asset) {
    if (!ASSET_OUTCOMES.includes(flags.outcome)) {
      console.log(`--asset needs --outcome, one of: ${ASSET_OUTCOMES.join(', ')} — rep_logged is the human's own yes, never assumed.`);
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
    if (flags['asset-version'] !== undefined) work.asset_version = String(flags['asset-version']).trim().slice(0, 50);
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
  process.exit(0);
}

if (command === 'report-use') {
  if (!flags.slug || !String(flags.slug).trim() || !ASSET_OUTCOMES.includes(flags.outcome)) {
    console.log(`report-use needs --slug <slug> and --outcome <${ASSET_OUTCOMES.join('|')}>.`);
    console.log("rep_logged is the human's own yes — ask, never assume. skipped is an honest no; it counts nowhere.");
    process.exit(1);
  }
  const surface = flags.surface ?? 'agent';
  if (!ASSET_SURFACES.includes(surface)) {
    console.log(`--surface must be one of: ${ASSET_SURFACES.join(', ')}.`);
    process.exit(1);
  }
  const payload = {
    ops_stage: status.ops_stage,
    harness_status: status.harness_status,
    template_version: status.template_version,
    asset: String(flags.slug).trim().slice(0, 200),
    outcome: flags.outcome,
    surface,
  };
  if (flags.version) payload.asset_version = String(flags.version).trim().slice(0, 50);
  if (flags.kind !== undefined) {
    if (!PACKAGE_KINDS.includes(flags.kind)) {
      console.log(`--kind must be one of: ${PACKAGE_KINDS.join(', ')}.`);
      process.exit(1);
    }
    payload.asset_kind = flags.kind;
  }
  const res = await call('POST', '/signals', {
    harness_id: sharing.harness_id,
    signal_type: 'asset_used',
    occurred_at: new Date().toISOString(),
    payload,
  });
  if (res.status === 401) reportAuthProblem();
  console.log(res.ok
    ? (flags.outcome === 'rep_logged'
        ? `Rep logged — ${payload.asset} counts in the library's totals. The content of the work stayed here.`
        : `Use reported (${flags.outcome}) for ${payload.asset}. Labels only, as always.`)
    : `Use report answered ${res.status} — not retried; the work itself is unaffected.`);
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
