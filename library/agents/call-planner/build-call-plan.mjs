#!/usr/bin/env node
/**
 * Call-Planner Control Tower — day-sheet generator.
 *
 *   node library/agents/call-planner/build-call-plan.mjs [--data <path>] [--out <dir>]
 *
 * Reads call-data.json (by default the one next to this script) and writes three files
 * into the data file's folder (or --out): a readable markdown day-sheet plus two CSVs
 * you can open in any spreadsheet tool. Re-run it as often as you like — it only ever
 * reads the data file and rewrites its own three outputs.
 *
 * The data shape is the contract in PACKAGE.md (today / history / enrichment / lists) —
 * extracted, with its triage rules, from a live operating harness's daily calling
 * command center. The rules it preserves exactly:
 *   • Overdue callbacks outrank everything, then priority (P0 first), then owner.
 *   • A contact whose role, route, angle or lifecycle isn't safe enough to present as
 *     call-ready stays OUT of today's list, on the enrichment sheet, with the reason
 *     and a safe next step — an honest "not yet" beats a bad call.
 *   • Dials, connects and connect-rate are counted from the sheet itself.
 *
 * Dependency-free: node:fs only. No package.json, no npm install.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const flags = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] ?? '';
}

const DATA_PATH = flags.data || join(__dirname, 'call-data.json');
let raw;
try {
  raw = readFileSync(DATA_PATH, 'utf8');
} catch {
  console.log(`No call data found at ${DATA_PATH}.`);
  console.log('Your agent builds that file from your CRM each morning — the shape is in');
  console.log('PACKAGE.md, and call-data.template.json is the empty starting point.');
  process.exit(1);
}
const data = JSON.parse(raw);
for (const key of ['today', 'enrichment', 'lists']) {
  if (!(key in data)) {
    console.log(`call-data.json is missing "${key}" — see the data contract in PACKAGE.md.`);
    process.exit(1);
  }
}

const OUT_DIR = flags.out || dirname(DATA_PATH);
const now = new Date();
const stamp = now.toISOString().slice(0, 10);

// ── Triage (the extracted ordering rules) ───────────────────────────────────

const overdue = (r) => Boolean(r.callback_at) && new Date(r.callback_at) < now && !r.connected;
const dueToday = (r) => Boolean(r.callback_at) && new Date(r.callback_at).toDateString() === now.toDateString() && !r.connected;
const parked = (r) => r.dialled && !r.connected && ['No answer', 'Voicemail', 'Gatekeeper'].includes(r.outcome || '');

const prioRank = (p) => {
  const i = (data.lists.priorities || []).indexOf(p);
  return i === -1 ? 99 : i;
};

const todayRows = [...data.today].sort((a, b) =>
  (overdue(b) - overdue(a)) ||
  (prioRank(a.priority) - prioRank(b.priority)) ||
  String(a.owner || '').localeCompare(String(b.owner || '')));

const dials = todayRows.filter((r) => r.dialled).length;
const connects = todayRows.filter((r) => r.connected).length;
const rate = dials ? Math.round((connects / dials) * 100) : 0;
const dueCount = todayRows.filter(dueToday).length;

const statusFlag = (r) =>
  r.connected ? '✅ connected' :
  overdue(r) ? '🔴 callback overdue' :
  dueToday(r) ? '🟡 callback due today' :
  parked(r) ? `⚪ tried — ${r.outcome.toLowerCase()}` : '';

// ── The day-sheet (markdown) ────────────────────────────────────────────────

const md = [];
md.push(`# Today's call plan — ${stamp}`);
md.push('');
md.push(`Dials so far: **${dials}** · Connected: **${connects}** · Connect rate: **${rate}%** · Callbacks due today: **${dueCount}**`);
md.push('');
md.push('Order: overdue callbacks first, then priority, then owner. Work top to bottom.');
md.push('');

if (todayRows.length === 0) {
  md.push('_No call-ready contacts today. Check the enrichment sheet below — that\'s where the next calls come from._');
}
todayRows.forEach((r, i) => {
  const flag = statusFlag(r);
  md.push(`## ${i + 1}. [${r.priority}] ${r.company} — ${r.name}${r.position ? `, ${r.position}` : ''}${flag ? `  (${flag})` : ''}`);
  const phones = [r.direct && `direct ${r.direct}`, r.fallback && `fallback ${r.fallback}`].filter(Boolean).join(' · ');
  if (phones) md.push(`- **Call**: ${phones}`);
  md.push(`- **Owner**: ${r.owner || '—'} · **Stage**: ${r.stage || '—'}`);
  if (r.angle) md.push(`- **Angle**: ${r.angle}`);
  if (r.callback_at) md.push(`- **Callback agreed**: ${r.callback_at}`);
  if (r.call_note) md.push(`- **Last note**: ${r.call_note}`);
  md.push('');
});

md.push('---');
md.push('');
md.push(`## Held out — needs enrichment first (${data.enrichment.length})`);
md.push('');
md.push('These stay off the call sheet on purpose: something about the role, route,');
md.push('angle or lifecycle isn\'t safe enough yet to present as call-ready.');
md.push('');
if (data.enrichment.length) {
  md.push('| Priority | Company | Who | Why held out | Safe next step | Owner |');
  md.push('|---|---|---|---|---|---|');
  for (const r of data.enrichment) {
    md.push(`| ${r.priority || ''} | ${r.company || ''} | ${r.name || ''} | ${r.reason || ''} | ${r.safe_next_step || ''} | ${r.owner || ''} |`);
  }
} else {
  md.push('_Nothing waiting — every known contact is either call-ready or done._');
}
md.push('');
md.push('## Vocabulary (keep entries consistent)');
md.push('');
md.push(`- **Priorities**: ${(data.lists.priorities || []).join(' · ') || '—'}`);
md.push(`- **Stages**: ${(data.lists.stages || []).join(' · ') || '—'}`);
md.push(`- **Outcomes**: ${(data.lists.outcomes || []).join(' · ') || '—'}`);
md.push('');
md.push(`_Generated ${now.toISOString()} from ${DATA_PATH.split('/').pop()}. Rebuild anytime: node library/agents/call-planner/build-call-plan.mjs_`);

// ── CSVs (open in any spreadsheet tool) ─────────────────────────────────────

const csvEscape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const toCsv = (headers, rows, pick) =>
  [headers.map(csvEscape).join(','), ...rows.map((r) => pick(r).map(csvEscape).join(','))].join('\n') + '\n';

const todayCsv = toCsv(
  ['Priority', 'Company', 'Name', 'Position', 'Direct', 'Fallback', 'Angle', 'Owner', 'Stage', 'Dialled', 'Connected', 'Outcome', 'Callback at', 'Call note', 'Status'],
  todayRows,
  (r) => [r.priority, r.company, r.name, r.position, r.direct, r.fallback, r.angle, r.owner, r.stage, r.dialled ? 'yes' : 'no', r.connected ? 'yes' : 'no', r.outcome, r.callback_at, r.call_note, statusFlag(r)],
);
const enrichmentCsv = toCsv(
  ['Priority', 'Company', 'Name', 'Position', 'Stage', 'Why held out', 'Direct', 'Fallback', 'Owner', 'Safe next step'],
  data.enrichment,
  (r) => [r.priority, r.company, r.name, r.position, r.stage, r.reason, r.direct, r.fallback, r.owner, r.safe_next_step],
);

const mdPath = join(OUT_DIR, `call-plan-${stamp}.md`);
writeFileSync(mdPath, md.join('\n') + '\n');
writeFileSync(join(OUT_DIR, `call-plan-${stamp}-today.csv`), todayCsv);
writeFileSync(join(OUT_DIR, `call-plan-${stamp}-enrichment.csv`), enrichmentCsv);

console.log(`Day sheet written: ${mdPath}`);
console.log(`Plus two CSVs alongside it. ${todayRows.length} call-ready, ${data.enrichment.length} held for enrichment.`);
console.log(`Dials ${dials} · connects ${connects} · rate ${rate}% · due today ${dueCount}.`);
