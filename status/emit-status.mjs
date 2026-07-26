#!/usr/bin/env node
/**
 * Update status/status.json locally, and — only when the radio is on (the welcome-pack
 * fields are set and sharing.status_signal_enabled is true) — emit an install_checkpoint
 * signal through the authenticated bridge (specs/002-production-line/contracts/
 * bridge-radio.md). The radio is the only outbound path; the unauthenticated 001-era
 * webhook was removed in the 002a reconciliation.
 *
 *   node status/emit-status.mjs --ops_stage day1_encode --harness_status configured
 *   node status/emit-status.mjs --checklist kb_business_context=true
 *
 * Dependency-free: only node:fs and global fetch. No package.json, no npm install.
 *
 * This is the code-capable-agent path (see agent/adapters/claude-code.md). On a chat-only
 * surface, edit status/status.json directly instead — it's plain JSON, no script needed.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_PATH = join(__dirname, 'status.json');
const TEMPLATE_PATH = join(__dirname, 'status.schema-template.json');

if (!existsSync(STATUS_PATH)) {
  copyFileSync(TEMPLATE_PATH, STATUS_PATH);
  console.log('status/status.json did not exist — initialized from status.schema-template.json.');
}

const status = JSON.parse(readFileSync(STATUS_PATH, 'utf8'));

// Parse --key value and --checklist key=value pairs from argv.
const args = process.argv.slice(2);
let ops_stage_changed = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  if (key === 'checklist') {
    const [ckey, cval] = args[++i].split('=');
    status.checklist[ckey] = cval === 'true';
    continue;
  }
  const value = args[++i];
  if (key === 'client_id') status.client_id = value;
  else if (key === 'business_name') status.business_name = value;
  else if (key === 'agent_name') status.agent_name = value;
  else if (key === 'harness_status') status.harness_status = value;
  else if (key === 'ops_stage') { status.ops_stage = value; ops_stage_changed = true; }
  else if (key === 'notes') status.notes = value;
}

const now = new Date().toISOString();
if (!status.started_at) status.started_at = now;
status.updated_at = now;
if (ops_stage_changed) {
  status.stage_history.push({ stage: status.ops_stage, at: now });
}

writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');
console.log(`status/status.json updated — harness_status: ${status.harness_status}, ops_stage: ${status.ops_stage}`);

// Emit an install_checkpoint through the radio — the one outbound path — only when
// explicitly enabled AND the welcome-pack fields are set (specs/002-production-line/
// contracts/bridge-radio.md). Anything less is a silent local save.
const sharing = status.sharing;
const bridgeConfigured = Boolean(sharing.bridge_url && sharing.harness_id && sharing.install_token);
if (sharing.status_signal_enabled && bridgeConfigured) {
  try {
    const res = await fetch(String(sharing.bridge_url).replace(/\/+$/, '') + '/signals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sharing.install_token}`,
      },
      body: JSON.stringify({
        harness_id: sharing.harness_id,
        signal_type: 'install_checkpoint',
        occurred_at: now,
        payload: {
          ops_stage: status.ops_stage,
          harness_status: status.harness_status,
          template_version: status.template_version,
        },
      }),
    });
    console.log(res.ok ? 'Status signal sent (via the radio).' : `Radio answered ${res.status} — not retried.`);
  } catch (err) {
    console.log(`Radio address unreachable (${err?.cause?.code || err.message}) — not retried. Local status was still saved.`);
  }
} else {
  console.log('Radio off or not configured — nothing sent outward. Local status was saved.');
}
