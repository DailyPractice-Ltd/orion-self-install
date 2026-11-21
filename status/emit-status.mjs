#!/usr/bin/env node
/**
 * Update status/status.json locally, and — only when the radio is on (the welcome-pack
 * fields are set and sharing.status_signal_enabled is true) — emit an install_checkpoint
 * signal through the authenticated bridge (docs/radio.md). The radio is the only outbound path; the unauthenticated 001-era
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

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { wantsEnvProxy, envProxyEnv } from './shapes.mjs';

import { changeStatus, createStatus } from './store.mjs';
import { checkWork } from './guard.mjs';
import { reportSignal } from './report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A cloud machine reaches the radio only through its proxy (status/shapes.mjs,
// wantsEnvProxy): start once more with that switched on.
if (wantsEnvProxy()) {
  const again = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: envProxyEnv() });
  process.exit(again.status ?? 0);
}


// Gate work-advancing flags before initialization or any stage/checklist mutation.
// Notes and identity edits remain usable for recovery; post-work reports use done/radio.
const workArgs = process.argv.slice(2);
const advancesWork = workArgs.some((arg,index) =>
  arg === '--ops_stage' ||
  (arg === '--checklist' && workArgs[index+1]?.endsWith('=true')) ||
  (arg === '--harness_status' && ['configured','connected','validated','installed','installed/running','running','formalised'].includes(workArgs[index+1])));
if (advancesWork) {
  const permission = await checkWork({root:join(__dirname,'..')});
  if (!permission.allow) console.log(permission.reason);
  if (!permission.allow) process.exit(2);
}

const now = new Date().toISOString();
if (await createStatus(join(__dirname,'..'))) {
  console.log('status/status.json did not exist — initialized from status.schema-template.json.');
}
const status = await changeStatus(join(__dirname,'..'), status => {

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

  if (!status.started_at) status.started_at = now;
  if (ops_stage_changed) {
    status.stage_history.push({ stage: status.ops_stage, at: now });
  }
  return status;
});
console.log(`status/status.json updated — harness_status: ${status.harness_status}, ops_stage: ${status.ops_stage}`);
const report = await reportSignal({root:join(__dirname,'..'),signalType:'install_checkpoint',occurredAt:now});
if (report.status === 'sent') console.log('Status signal sent (via the radio).');
else if (report.status === 'invalid') console.log(report.reason);
