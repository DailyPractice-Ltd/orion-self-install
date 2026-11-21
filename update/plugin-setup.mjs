#!/usr/bin/env node
/**
 * Orion plugin setup for this harness folder: the installer's last step, and the
 * repeatable resume command. Run it from the installed Orion folder:
 *
 *   node update/plugin-setup.mjs resume              write and check this folder's catalog, then
 *                                                    register and install Orion with the selected
 *                                                    tool (scoped to this folder); safe to repeat
 *   node update/plugin-setup.mjs verify              inspect only; changes no native setting
 *   node update/plugin-setup.mjs verify --discovered the assistant, in a fresh session in this
 *                                                    folder, sees the Orion skills: confirm it
 *   node update/plugin-setup.mjs status              print where plugin setup stands
 *
 * status.json `plugin.setup_state`:
 *   not_started  nothing tried yet
 *   pending      a step is owed first (install the tool, a native install, enable): remaining_action
 *   failed       a check or native command failed: remaining_action says how to retry
 *   registered   the tool's own inspection shows Orion installed for this folder at this version, but
 *                no fresh session has confirmed it discovers the skills yet: remaining_action
 *   complete     registered, and an assistant in a fresh session here confirmed the skills (--discovered)
 *
 * Native inspection alone, including any stubbed CLI, never earns `complete`: every report names the
 * program that answered. The catalog identity is created once and reused; registration is idempotent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_LAYOUT, safePath } from './destination-resolver.mjs';
import { catalogName, ensurePluginRegion, validateCatalog, validatePackage, writeCatalog } from './plugin-package.mjs';
import { setupPlugin, verifyPlugin } from './plugin-native.mjs';
import { withStatusLock } from '../status/store.mjs';

export const RESUME_COMMAND = 'node update/plugin-setup.mjs resume';
export const VERIFY_COMMAND = 'node update/plugin-setup.mjs verify --discovered';
const PRODUCT = { 'claude-code': 'Claude Code', codex: 'Codex' };

async function update(root, change) {
  return withStatusLock(root, async (store) => {
    const status = await store.readStatus();
    const result = change(status);
    await store.writeStatus(status);
    return result;
  });
}

/** Read the selected tool, version and catalog identity, creating the identity once. */
async function harness(root) {
  return update(root, (status) => {
    const tool = status.ai_assistant;
    if (!Object.hasOwn(TOOL_LAYOUT, tool)) throw new Error(`This folder's AI assistant (${tool ?? 'none'}) has no Orion plugin setup; choose codex or claude-code.`);
    const identity = ensurePluginRegion(status, { create: true }).catalog_identity;
    return { tool, identity, version: status.template_version };
  });
}

/** Errors in this folder's package and selected-tool catalog; with `write`, the catalog is regenerated first. */
export function checkFolder(root, { tool, identity, version, write = false }) {
  if (write) writeCatalog(root, tool, identity);
  const errors = validatePackage(root, { version });
  let catalog;
  try { catalog = JSON.parse(readFileSync(safePath(root, TOOL_LAYOUT[tool].catalogPath), 'utf8')); }
  catch { return [...errors, `${TOOL_LAYOUT[tool].catalogPath}: missing or unreadable; run ${RESUME_COMMAND}`]; }
  return [...errors, ...validateCatalog(tool, catalog, { root, identity })];
}

/**
 * Run plugin setup (`mode: 'setup'`) or inspection (`mode: 'verify'`) for the harness at `root`
 * and record the outcome in its status.json. Returns the recorded plugin region plus `checked_with`.
 */
export async function runPluginSetup(root, { mode = 'setup', discovered = false, env = process.env, home, now = () => new Date() } = {}) {
  const { tool, identity, version } = await harness(root);
  const errors = checkFolder(root, { tool, identity, version, write: mode === 'setup' });
  const native = errors.length
    ? { state: 'failed', details: { reason: 'package_or_catalog_invalid', errors } }
    : (mode === 'setup' ? setupPlugin : verifyPlugin)({ root, tool, catalogName: catalogName(identity), version, env, home });
  const checked_with = native.details?.binary || null;
  return update(root, (status) => {
    const plugin = ensurePluginRegion(status);
    const stillConfirmed = plugin.setup_state === 'complete' && plugin.verified_version === version;
    const confirmedAt = plugin.verified_at;
    plugin.verified_version = null;
    plugin.verified_at = null;
    if (native.state === 'pending') {
      plugin.setup_state = 'pending';
      plugin.remaining_action = native.remaining_action;
    } else if (native.state !== 'complete') {
      plugin.setup_state = 'failed';
      plugin.remaining_action = `Plugin setup failed (${native.details?.reason || 'unknown reason'}); fix that, then run "${RESUME_COMMAND}" from this folder.`;
    } else if (discovered || stillConfirmed) {
      plugin.setup_state = 'complete';
      plugin.remaining_action = null;
      plugin.verified_version = native.details.version;
      plugin.verified_at = discovered ? now().toISOString() : confirmedAt;
    } else {
      plugin.setup_state = 'registered';
      plugin.remaining_action = `${native.details.next} Then ask your assistant to confirm it sees the Orion skills (it runs "${VERIFY_COMMAND}").`;
    }
    return { ...plugin, tool, checked_with, reason: native.details?.reason, errors: native.details?.errors || [] };
  });
}

/** One plain report; "plugin setup complete" only for a confirmed discovery. */
export function describe(result) {
  const product = PRODUCT[result.tool];
  const lines = [];
  const via = result.checked_with ? ` (checked with ${result.checked_with})` : '';
  if (result.setup_state === 'complete') lines.push(`Orion plugin setup complete: ${product} discovers Orion ${result.verified_version} in this folder${via}.`);
  else if (result.setup_state === 'registered') lines.push(`Orion plugin registered with ${product} for this folder${via}; not yet confirmed in a fresh session.`);
  else if (result.setup_state === 'pending') lines.push(`Orion plugin setup is waiting on one step${via}.`);
  else {
    lines.push(`Orion plugin setup failed${result.reason ? ` (${result.reason})` : ''}${via}.`);
    for (const error of result.errors) lines.push(`  - ${error}`);
  }
  if (result.remaining_action) lines.push(`Next for the plugin: ${result.remaining_action}`);
  return lines.join('\n');
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const [command] = process.argv.slice(2);
  if (command === 'status') {
    const status = JSON.parse(readFileSync(join(root, 'status/status.json'), 'utf8'));
    const plugin = ensurePluginRegion(status);
    console.log(describe({ ...plugin, tool: status.ai_assistant, checked_with: null, errors: [] }));
    return;
  }
  if (!['resume', 'verify'].includes(command)) {
    console.log('Usage: node update/plugin-setup.mjs <resume|verify [--discovered]|status>');
    process.exitCode = command ? 2 : 0;
    return;
  }
  const result = await runPluginSetup(root, { mode: command === 'resume' ? 'setup' : 'verify', discovered: process.argv.includes('--discovered') });
  console.log(describe(result));
  if (result.setup_state === 'failed') process.exitCode = 3;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error.message); process.exitCode = 2; });
}
