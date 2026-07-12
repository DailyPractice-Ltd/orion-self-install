#!/usr/bin/env node
/**
 * Update status/status.json locally, and — only if sharing.status_signal_enabled is
 * true and sharing.status_signal_endpoint is set — emit the minimal status signal
 * (specs/001-self-install/contracts/status-signal.schema.json) to that endpoint.
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

// Emit the minimal status signal only when explicitly enabled AND an endpoint is set.
if (status.sharing.status_signal_enabled && status.sharing.status_signal_endpoint) {
  const payload = {
    client_id: status.client_id,
    business_name: status.business_name,
    harness_status: status.harness_status,
    ops_stage: status.ops_stage,
    template_version: status.template_version,
    timestamp: now,
  };
  try {
    const res = await fetch(status.sharing.status_signal_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(res.ok ? 'Status signal sent.' : `Status signal endpoint responded ${res.status} — not retried.`);
  } catch (err) {
    console.log(`Status signal endpoint unreachable (${err.message}) — not retried. Local status was still saved.`);
  }
} else {
  console.log('Status signal disabled or no endpoint configured — nothing sent outward.');
}
