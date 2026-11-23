#!/usr/bin/env node
/**
 * Switch this Orion folder between Codex and Claude Code, entirely on this machine.
 *
 *   node switch_ai.mjs                    switch to the other AI assistant
 *   node switch_ai.mjs --to claude-code   or name the one you want
 *   node switch_ai.mjs --to codex
 *
 * It moves every client skill from one assistant's skills folder to the other's and records
 * the new assistant in status/status.json. No release, git or internet is needed.
 * It refuses to overwrite anything, and keeps a copy of the old skills and status in
 * .update-backup/ first. To undo a switch, run it again.
 *
 * In a folder with the Orion plugin (plugins/orion), the plugin moves too, and the selected
 * assistant changes only once the other assistant can use Orion:
 *   1. the target assistant's catalog is written from the same catalog identity and the
 *      target is set up through its own program (update/plugin-setup.mjs nativeStep);
 *   2. only the same discovery evidence as plugin setup commits the switch. Until then the
 *      switch waits in status.json `plugin.pending_switch` with the one step owed; running
 *      this again finishes it, and `--to <current assistant>` cancels it;
 *   3. a failed target setup or an interrupted commit puts the folder back and removes only
 *      Orion's own registration with the target;
 *   4. after the commit, the previous assistant's Orion (its install and its catalog) is
 *      retired last. Nothing else in either assistant's settings is touched.
 *
 * The installed-file receipt (update/receipt.mjs, status/installed-files.json) moves with
 * the switch: the commit records the target's generated plugin manifest and catalog and the
 * new assistant, and the receipt drops the previous assistant's manifest and catalog only
 * once they are removed. Every other baseline stays as it was, and client skills are never
 * in it. The receipt is backed up with status.json and put back if the commit fails; a
 * waiting, cancelled or rolled-back switch never changes it. A folder without a receipt
 * gets none here, and one that cannot be trusted stops the switch before anything changes.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withStatusLock } from './status/store.mjs';
import { TOOL_LAYOUT, fingerprint, safePath, toolEntries } from './update/destination-resolver.mjs';
import { RECEIPT_PATH, readReceipt, receiptText } from './update/receipt.mjs';

const SKILLS = { codex: '.agents/skills', 'claude-code': '.claude/skills' };
const TOP = { codex: '.agents', 'claude-code': '.claude' };
const NAME = { codex: 'Codex', 'claude-code': 'Claude Code' };
const TOOLS = Object.keys(SKILLS);
const PACKAGE = 'plugins/orion';

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const isSymlink = (path) => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } };
const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };
const injected = (name) => { if (process.env[name]) throw new Error('Injected switch interruption'); };

/** Every file under dir, as paths relative to it. Refuses symlinks and special files. */
function filesUnder(dir, label, prefix = '') {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) files.push(...filesUnder(join(dir, item.name), label, rel));
    else if (item.isFile()) files.push(rel);
    else throw new Error(`${label}/${rel} is a link or special file. Move it out of the way, then run this again.`);
  }
  return files;
}

function pruneEmpty(path) {
  if (!existsSync(path) || !lstatSync(path).isDirectory()) return;
  for (const item of readdirSync(path)) pruneEmpty(join(path, item));
  if (readdirSync(path).length === 0) rmdirSync(path);
}

/** Remove the now-empty folders above a removed file, never above the folder root. */
function pruneParents(root, rel) {
  for (let parent = dirname(rel); parent !== '.'; parent = dirname(parent)) {
    const dir = join(root, parent);
    if (!existsSync(dir)) continue;
    if (readdirSync(dir).length > 0) break;
    rmdirSync(dir);
  }
}

/** The assistant this folder uses now: recorded in status, or read from the folder layout. */
function currentTool(root, status) {
  if (status.ai_assistant != null) {
    if (!TOOLS.includes(status.ai_assistant)) throw new Error(`status/status.json names an unknown AI assistant: ${status.ai_assistant}`);
    return status.ai_assistant;
  }
  const present = TOOLS.filter((tool) => existsSync(join(root, SKILLS[tool])));
  if (present.length !== 1) throw new Error('status/status.json does not say which AI assistant this folder uses, and the skills folders do not show it either.');
  return present[0];
}

/** The plugin helpers, loaded only in a folder that carries the Orion plugin package. */
async function pluginKit(root) {
  if (!existsSync(join(root, PACKAGE))) return null;
  const [resolver, pkg, native, setup, registration] = await Promise.all([
    import('./update/destination-resolver.mjs'), import('./update/plugin-package.mjs'),
    import('./update/plugin-native.mjs'), import('./update/plugin-setup.mjs'), import('./update/plugin-registration.mjs'),
  ]);
  return { ...resolver, ...pkg, ...native, ...setup, ...registration };
}

/**
 * The whole switch holds the status lock, from reading status.json to the last
 * restore on failure, so no other Orion command's change is lost to it.
 */
export async function switchAi(root, to) {
  const statusPath = join(root, 'status/status.json');
  if (!existsSync(statusPath)) throw new Error('No status/status.json here. Run this from inside your Orion folder.');
  const kit = await pluginKit(root);
  return withStatusLock(root, (store) => switchLocked(store, root, statusPath, to, kit));
}

async function switchLocked(store, root, statusPath, to, kit) {
  const status = await store.readStatus();
  const from = currentTool(root, status);
  const waiting = kit ? status.plugin?.pending_switch : null;
  if (waiting) {
    to ??= waiting.to;
    if (to === from) return cancelWaiting(store, root, status, from, waiting, kit);
    if (to !== waiting.to) throw new Error(`A switch to ${NAME[waiting.to]} has started but is not finished, and only one switch can run at a time. Run "node switch_ai.mjs" to finish it, or "node switch_ai.mjs --to ${from}" to cancel it.`);
  }
  to ??= TOOLS.find((tool) => tool !== from);
  if (!TOOLS.includes(to)) throw new Error(`Choose --to claude-code or --to codex (not ${to}).`);
  if (to === from) throw new Error(`This folder already uses ${NAME[from]}.`);

  for (const path of [TOP[from], SKILLS[from], TOP[to], SKILLS[to]]) {
    if (isSymlink(join(root, path))) throw new Error(`${path} is a link. Move it out of the way, then run this again.`);
  }
  const files = filesUnder(join(root, SKILLS[from]), SKILLS[from]);
  // Spec Kit skills were maintainer tooling and are not carried to the new assistant.
  const dropped = files.filter((rel) => rel.split('/')[0].startsWith('speckit-'));
  const moving = files.filter((rel) => !dropped.includes(rel));
  const collisions = moving.filter((rel) => existsSync(join(root, SKILLS[to], rel)) || isSymlink(join(root, SKILLS[to], rel)));
  if (collisions.length) {
    throw new Error(`Nothing was changed, because these files already exist in ${SKILLS[to]}:\n${collisions.map((rel) => `  ${SKILLS[to]}/${rel}`).join('\n')}`);
  }
  let receipt;
  try { receipt = readReceipt(root); }
  catch (error) { throw new Error(`${error.message}. Orion cannot tell its own files from yours without it, so nothing was changed. Put back ${RECEIPT_PATH} as it was (your folder's home repository or an earlier copy of the folder has it), then run this again. If you cannot, ask Daily Practice for help.`); }

  // The plugin: set the target up from the same identity before anything else moves.
  let plugin = null;
  if (kit) {
    const identity = kit.ensurePluginRegion(status, { create: true }).catalog_identity;
    const catalogPath = kit.TOOL_LAYOUT[to].catalogPath, text = kit.catalogText(to, identity);
    const existing = existsSync(join(root, catalogPath)) ? readFileSync(join(root, catalogPath), 'utf8') : null;
    if (existing !== null && existing !== text) throw new Error(`Nothing was changed, because ${catalogPath} already exists and is not this folder's Orion catalog. Move it out of the way, then run this again.`);
    const manifestPath = kit.MANIFEST_PATHS[to];
    const manifestFile = kit.safePath(root, manifestPath);
    const metadataBefore = waiting?.metadata_before ?? {
      [manifestPath]: existsSync(manifestFile) ? readFileSync(manifestFile, 'utf8') : null,
      [catalogPath]: existing,
    };
    const registrationBefore = waiting?.registration_before ?? kit.captureRegistration(root, to, kit.catalogName(identity));
    plugin = { registrationBefore, metadataBefore, identity, catalogName: kit.catalogName(identity), version: status.template_version, oldCatalog: kit.TOOL_LAYOUT[from].catalogPath };
    // Journal before creating metadata: resuming after a stopped process or cancelling
    // can always distinguish the original files from this switch's additions.
    status.plugin.pending_switch = { to, registration_before: registrationBefore, metadata_before: metadataBefore };
    await store.writeStatus(status);
    let target;
    try {
      mkdirSync(dirname(manifestFile), { recursive: true });
      writeFileSync(manifestFile, JSON.stringify(kit.pluginManifests(plugin.version)[manifestPath], null, 2) + '\n');
      target = kit.nativeStep(root, { tool: to, identity, version: plugin.version, mode: 'setup' });
    } catch (error) {
      undoTarget(root, to, plugin, kit);
      status.plugin.pending_switch = null;
      await store.writeStatus(status);
      throw error;
    }
    if (target.state === 'failed') {
      undoTarget(root, to, plugin, kit);
      status.plugin.pending_switch = null;
      await store.writeStatus(status);
      process.exitCode = 3;
      return { state: 'rolled_back', from, to, selected: from, reason: target.details?.reason, errors: target.details?.errors || [] };
    }
    if (target.state === 'pending') {
      status.plugin.pending_switch = { to, registration_before: registrationBefore, metadata_before: metadataBefore, remaining_action: target.remaining_action };
      await store.writeStatus(status);
      return { state: 'pending_switch', from, to, selected: from, remaining_action: `${target.remaining_action} Then run "node switch_ai.mjs" again to finish the switch.` };
    }
    plugin.next = target.details?.next;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `.update-backup/switch-${from}-to-${to}-${stamp}`;
  const backup = join(root, backupRel);
  if (existsSync(backup)) throw new Error(`${backupRel} already exists. Wait a moment and run this again.`);
  for (const rel of files) copy(join(root, SKILLS[from], rel), join(backup, SKILLS[from], rel));
  copy(statusPath, join(backup, 'status/status.json'));
  if (receipt) copy(join(root, RECEIPT_PATH), join(backup, RECEIPT_PATH));
  if (plugin) {
    for (const path of Object.values(kit.MANIFEST_PATHS)) {
      if (existsSync(kit.safePath(root, path))) copy(join(root, path), join(backup, path));
    }
    writeFileSync(join(backup, 'registration-before.json'), JSON.stringify(plugin.registrationBefore, null, 2) + '\n');
    writeFileSync(join(backup, 'metadata-before.json'), JSON.stringify(plugin.metadataBefore, null, 2) + '\n');
  }

  const created = [];
  try {
    let count = 0;
    for (const rel of moving) {
      const target = join(root, SKILLS[to], rel);
      copy(join(root, SKILLS[from], rel), target);
      created.push(target);
      if (process.env.ORION_SWITCH_FAIL_AFTER && ++count === Number(process.env.ORION_SWITCH_FAIL_AFTER)) throw new Error('Injected switch interruption');
    }
    for (const rel of files) rmSync(join(root, SKILLS[from], rel));
    pruneEmpty(join(root, SKILLS[from]));
    pruneEmpty(join(root, TOP[from]));
    // The receipt is written under the lock just before status.json, and the catch below
    // puts the backed-up copy back, so it names the new assistant only once the switch commits.
    if (receipt) {
      receipt = switchedReceipt(root, receipt, to, plugin && kit);
      await store.writeReceiptText(receiptText(receipt));
    }
    injected('ORION_SWITCH_FAIL_BEFORE_COMMIT');
    status.ai_assistant = to;
    if (status.machine_profile && typeof status.machine_profile === 'object') status.machine_profile.chosen_surface = to;
    if (plugin) {
      Object.assign(status.plugin, {
        pending_switch: null, setup_state: 'registered', pending_version: plugin.version,
        remaining_action: `${plugin.next || ''} Then ask your assistant to confirm it sees the Orion skills (it runs "${kit.VERIFY_COMMAND}").`.trim(),
      });
    }
    status.notes = [status.notes || '', `switched from ${from} to ${to}; backup in ${backupRel}`].filter(Boolean).join('\n');
    await store.writeStatus(status);
  } catch (error) {
    // Put the folder back as it was: remove what was added, restore from the backup.
    for (const target of created) rmSync(target, { force: true });
    pruneEmpty(join(root, SKILLS[to]));
    pruneEmpty(join(root, TOP[to]));
    for (const rel of files) {
      const source = join(root, SKILLS[from], rel);
      if (!existsSync(source)) copy(join(backup, SKILLS[from], rel), source);
    }
    if (receipt) await store.writeReceiptText(readFileSync(join(backup, RECEIPT_PATH), 'utf8'));
    const before = JSON.parse(readFileSync(join(backup, 'status/status.json'), 'utf8'));
    if (plugin) {
      // The previous assistant was never touched; only Orion's registration with the target goes.
      undoTarget(root, to, plugin, kit);
      kit.ensurePluginRegion(before).pending_switch = null;
      await store.writeStatus(before);
    } else await store.writeStatusText(readFileSync(join(backup, 'status/status.json'), 'utf8'));
    throw error;
  }
  const result = { state: 'switched', from, to, selected: to, moved: moving.map((rel) => `${SKILLS[to]}/${rel}`), dropped: dropped.map((rel) => `${SKILLS[from]}/${rel}`), backup: backupRel };
  if (plugin) {
    // Committed. Only now does the previous assistant's Orion go, and its catalog after it.
    result.active = false;
    result.remaining_action = status.plugin.remaining_action;
    const retired = kit.retirePlugin({ root, tool: from, catalogName: plugin.catalogName });
    if (retired.state === 'complete') {
      removeCatalog(root, plugin.oldCatalog, kit.catalogText(from, plugin.identity));
      rmSync(kit.safePath(root, kit.MANIFEST_PATHS[from]), { force: true });
      pruneParents(root, kit.MANIFEST_PATHS[from]);
      if (receipt) await store.writeReceiptText(receiptText(withoutRemoved(root, receipt, [kit.MANIFEST_PATHS[from], plugin.oldCatalog])));
    }
    else result.previous_tool_action = `Orion could not remove itself from ${NAME[from]} for this folder (${retired.details?.reason || 'its program was not reachable'}), so ${NAME[from]} may still offer the Orion skills here. Remove Orion there by hand; nothing else in ${NAME[from]} was changed, and ${plugin.oldCatalog} stays until then.`;
  }
  return result;
}

/**
 * The receipt once the switch to `to` commits: the new assistant, and the target's plugin
 * manifest and catalog as this switch generated them, under the identities the deployment
 * map gives them for `to`. Every other entry keeps its installed baseline.
 */
function switchedReceipt(root, receipt, to, kit) {
  const files = { ...receipt.files };
  if (kit) {
    const manifestPath = kit.MANIFEST_PATHS[to], catalogPath = TOOL_LAYOUT[to].catalogPath;
    const manifestFile = join(root, 'update/manifest.json');
    const deployment = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')).deployment : null;
    const mapped = deployment && toolEntries(deployment, to).find((entry) => entry.destination === manifestPath);
    for (const [path, key] of [[manifestPath, mapped?.fingerprint_key || manifestPath], [catalogPath, catalogPath]]) {
      files[path] = { key, hash: fingerprint(readFileSync(safePath(root, path))), origin: 'generated' };
    }
  }
  return { ...receipt, ai_assistant: to, recorded_by: 'switch', recorded_at: new Date().toISOString(), files: sorted(files) };
}

/** The receipt without the claims for those paths that are now gone from the folder. */
function withoutRemoved(root, receipt, paths) {
  const files = { ...receipt.files };
  for (const path of paths) if (!existsSync(join(root, path))) delete files[path];
  return { ...receipt, recorded_at: new Date().toISOString(), files: sorted(files) };
}

const sorted = (files) => Object.fromEntries(Object.keys(files).sort().map((path) => [path, files[path]]));

/** Remove this folder's Orion catalog for one assistant, only when it is exactly Orion's. */
function removeCatalog(root, rel, text) {
  const path = join(root, rel);
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) return;
  rmSync(path);
  pruneParents(root, rel);
}

/** Undo Orion's own registration with a switch target, and its catalog; nothing else. */
function undoTarget(root, to, plugin, kit) {
  kit.retirePlugin({ root, tool: to, catalogName: plugin.catalogName });
  kit.restoreRegistration(root, plugin.registrationBefore);
  removeCatalog(root, kit.TOOL_LAYOUT[to].catalogPath, kit.catalogText(to, plugin.identity));
  for (const [path, before] of Object.entries(plugin.metadataBefore || {})) {
    // Only restore the two known target metadata paths from the switch journal.
    if (![kit.MANIFEST_PATHS[to], kit.TOOL_LAYOUT[to].catalogPath].includes(path)) throw new Error('Invalid switch metadata backup');
    const target = kit.safePath(root, path);
    if (before === null) { rmSync(target, { force: true }); pruneParents(root, path); }
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, before); }
  }
}

/** `--to <current assistant>` while a switch waits: cancel it, leaving the current assistant as it is. */
async function cancelWaiting(store, root, status, from, waiting, kit) {
  const identity = status.plugin.catalog_identity;
  undoTarget(root, waiting.to, { identity, catalogName: kit.catalogName(identity), metadataBefore: waiting.metadata_before, registrationBefore: waiting.registration_before }, kit);
  status.plugin.pending_switch = null;
  status.notes = [status.notes || '', `cancelled the switch to ${waiting.to}`].filter(Boolean).join('\n');
  await store.writeStatus(status);
  return { state: 'cancelled', from, to: waiting.to, selected: from, remaining_action: `The waiting switch to ${NAME[waiting.to]} was cancelled; this folder still uses ${NAME[from]}. If ${NAME[waiting.to]} still lists Orion, remove it there if you no longer use it.` };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const root = arg('--root') || dirname(fileURLToPath(import.meta.url));
    const result = await switchAi(root, arg('--to'));
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else if (result.state === 'switched') {
      console.log(`Switched this Orion folder from ${NAME[result.from]} to ${NAME[result.to]}.`);
      console.log(`Moved ${result.moved.length} skill file(s) to ${SKILLS[result.to]}.`);
      if (result.dropped.length) console.log(`Left out ${result.dropped.length} Spec Kit file(s); they are in the backup.`);
      console.log(`Backup of the old skills and status: ${result.backup}`);
      console.log(`Open this folder in ${NAME[result.to]} to carry on. To switch back, run: node switch_ai.mjs`);
      if (result.remaining_action) console.log(`Next for the Orion plugin: ${result.remaining_action}`);
      if (result.previous_tool_action) console.log(result.previous_tool_action);
    } else if (result.state === 'pending_switch') {
      console.log(`This folder still uses ${NAME[result.from]}: the switch to ${NAME[result.to]} is waiting on one step.`);
      console.log(result.remaining_action);
    } else if (result.state === 'cancelled') console.log(result.remaining_action);
    else {
      console.log(`Nothing was switched: Orion could not be set up in ${NAME[result.to]} (${result.reason || 'unknown reason'}), so this folder still uses ${NAME[result.from]} as before.`);
      for (const error of result.errors) console.log(`  - ${error}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
