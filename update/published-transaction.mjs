/** Transaction for updating an already deployed harness from a verified publication. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  destinationState,
  fingerprint,
  planForTool,
  safePath,
} from './destination-resolver.mjs';
import { compareVersions, verifyPinnedRelease } from './published-release.mjs';
import {
  keyHeader,
  radioKey,
  radioOn,
  readRadioKeyFile,
} from '../status/shapes.mjs';
import {
  cleanInstall,
  preflightSteps,
  runSteps,
  selectPath,
  statusFile,
  versionPattern,
} from './published-migrations.mjs';

const backups = '.update-backup';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const serialized = (value) => JSON.stringify(value, null, 2) + '\n';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function file(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`Expected regular file: ${path}`);
    return { bytes: readFileSync(path), mode: stat.mode & 0o777 };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function write(path, bytes, mode) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { mode });
  chmodSync(path, mode);
}

function saveEvidence(backup, name, value) {
  const path = safePath(backup, name);
  const temporary = safePath(backup, `${name}.tmp`);
  write(temporary, serialized(value), 0o600);
  renameSync(temporary, path);
}

function saveJournal(backup, journal) {
  saveEvidence(backup, 'journal.json', journal);
}

function runtimePairing(root, status, overrideKey) {
  const where = {
    keyFile:
      overrideKey ??
      readRadioKeyFile(dirname(safePath(root, 'status/radio.key')), {
        readFileSync,
      }),
  };
  if (!radioOn(status, where))
    throw new Error('Updating requires an enabled, paired radio.');
  return {
    url: status.sharing.bridge_url.replace(/\/$/, ''),
    key: radioKey(status, where),
  };
}

async function requireWorkingRadio(root, status, overrideKey) {
  const { url, key } = runtimePairing(root, status, overrideKey);
  try {
    const response = await fetch(`${url}/library`, {
      headers: keyHeader(key),
      signal: AbortSignal.timeout(10000),
    });
    const body = response.ok && (await response.json());
    if (Array.isArray(body?.assets)) return;
  } catch {
    // A working radio is required before any update writes.
  }
  throw new Error(
    'Updating requires a working paired radio. Try again when it can connect.',
  );
}

function recordedRelease(status) {
  const version = status.template_version;
  const prior = status.applied_release;
  if (prior == null) return null;
  if (
    !versionPattern.test(version) ||
    prior?.tag !== `v${version}` ||
    prior.manifest_version !== version ||
    !/^[a-f0-9]{40}$/.test(prior.commit) ||
    !Number.isSafeInteger(prior.release_id) ||
    prior.release_id < 1 ||
    !Number.isFinite(Date.parse(prior.applied_at))
  ) {
    throw new Error(
      'Starting release identity needs a declared verification migration. Install into a separate folder if no supported migration is available.',
    );
  }
  return prior;
}

function validateChecks(path, deployed) {
  if (
    !Array.isArray(path.required_destinations) ||
    new Set(path.required_destinations).size !==
      path.required_destinations.length ||
    path.required_destinations.some(
      (destination) => deployed.get(destination)?.ownership !== 'release',
    )
  ) {
    throw new Error('Invalid required destination declarations.');
  }
  if (
    !Array.isArray(path.checks) ||
    !path.checks.some((check) => check?.kind === 'deployed-layout') ||
    path.checks.some(
      (check) =>
        !check ||
        (check.kind !== 'deployed-layout' &&
          (check.kind !== 'node-syntax' ||
            typeof check.path !== 'string' ||
            !check.path.endsWith('.mjs') ||
            !deployed.has(check.path))),
    )
  ) {
    throw new Error('Missing or invalid required post-apply checks.');
  }
  return path;
}

function syntaxCheck(path, displayPath) {
  const result = spawnSync(process.execPath, ['--check', path], {
    encoding: 'utf8',
  });
  if (result.status !== 0)
    throw new Error(
      `Invalid script ${displayPath}: ${result.stderr?.trim() || result.error?.message}`,
    );
}

function validateDeploymentPath(path) {
  const segments = typeof path === 'string' ? path.split('/') : [];
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[\\:]/.test(segment),
    ) ||
    segments[0].toLowerCase() === '.git' ||
    segments[0].toLowerCase() === backups ||
    path.toLowerCase() === statusFile
  )
    throw new Error(`Invalid or reserved update destination: ${path}`);
}

function updatePath({ root, checkout, manifest, path }) {
  const entries = planForTool(manifest.deployment, path.tool, {
    releaseRoot: checkout,
    root,
  });
  const deployed = new Map(entries.map((entry) => [entry.destination, entry]));
  validateChecks(path, deployed);
  return {
    entries,
    deployed,
    steps: preflightSteps(checkout, path, manifest.template_version),
  };
}

function planUpdate({
  root,
  checkout,
  manifest,
  path,
  stage,
  backfill,
  pairing,
  declared,
}) {
  const tool = path.tool;
  const { entries, deployed, steps } = declared;
  const { files, migrations } = runSteps({
    steps,
    read: (destination) => file(safePath(root, destination)),
    defaults: json(safePath(checkout, 'status/status.schema-template.json')),
  });
  let nextStatus = files.get(statusFile);
  files.delete(statusFile);
  if (pairing) {
    if (!nextStatus)
      throw new Error('Separate migration must declare its status changes.');
    const status = JSON.parse(nextStatus.bytes);
    status.sharing = pairing.sharing;
    nextStatus = { ...nextStatus, bytes: Buffer.from(serialized(status)) };
  }
  const required = new Set(path.required_destinations);
  const pristine = json(join(checkout, 'update/pristine.json'));
  const actions = [];
  const report = {
    refreshed: [],
    added: [],
    retired: [],
    kept: [],
    collisions: [],
    ...(migrations.length && { migrations }),
  };

  const allowedEdits = path.verification?.allow_client_edits ?? [];
  if (
    backfill &&
    (!Array.isArray(allowedEdits) ||
      allowedEdits.some(
        (destination) =>
          deployed.get(destination)?.ownership !== 'release' ||
          required.has(destination) ||
          path.verification.anchors.some(
            (anchor) => anchor.path === destination,
          ),
      ))
  ) {
    throw new Error('Invalid same-version client edit exceptions.');
  }

  function stageAction(destination, prior, incoming) {
    if (incoming) {
      const staged = safePath(stage, destination);
      write(staged, incoming.bytes, incoming.mode);
      if (destination.endsWith('.mjs')) syntaxCheck(staged, destination);
    }
    actions.push({
      destination,
      kind: !prior ? 'add' : incoming ? 'replace' : 'retire',
      prior_hash: prior && digest(prior.bytes),
      prior_mode: prior?.mode,
      installed_hash: incoming && digest(incoming.bytes),
      installed_mode: incoming?.mode,
    });
    report[!prior ? 'added' : incoming ? 'refreshed' : 'retired'].push(
      destination,
    );
  }

  for (const entry of entries) {
    const { destination, source } = entry;
    validateDeploymentPath(destination);
    const incoming = file(safePath(checkout, source));
    if (!incoming) throw new Error(`Missing release source: ${source}`);
    if (backfill) {
      const prior = file(safePath(root, destination));
      if (
        !prior ||
        (entry.ownership === 'release' &&
          !prior.bytes.equals(incoming.bytes) &&
          !allowedEdits.includes(destination))
      ) {
        throw new Error(
          `Cannot verify the exact installed publication at ${destination}. ${cleanInstall}`,
        );
      }
      if (entry.ownership === 'release' && !prior.bytes.equals(incoming.bytes))
        report.kept.push(destination);
      continue;
    }
    if (files.has(destination)) {
      const migrated = files.get(destination);
      if (!migrated)
        throw new Error(`Migration retired deployed file: ${destination}`);
      stageAction(destination, file(safePath(root, destination)), migrated);
      files.delete(destination);
      continue;
    }
    const state = destinationState(root, entry, pristine);
    if (state === 'client-owned') {
      report.collisions.push(destination);
      continue;
    }
    if (state === 'absent') {
      stageAction(destination, null, incoming);
      continue;
    }
    const installed = safePath(root, destination);
    if (!lstatSync(installed).isFile())
      throw new Error(
        `Deployment destination is not a regular file: ${destination}`,
      );
    const prior = file(installed);
    if (fingerprint(prior.bytes) === fingerprint(incoming.bytes)) continue;
    if (state === 'preserve') {
      if (required.has(destination))
        throw new Error(
          `Required update is blocked by a local edit: ${destination}`,
        );
      report.kept.push(destination);
      continue;
    }
    stageAction(destination, prior, incoming);
  }

  const retired = [
    ...(manifest.remove || []).map((destination) => ({
      destination,
      fingerprint_key: destination,
    })),
    ...(manifest.deployment.retired || []).map((entry) => ({
      destination: entry.destinations?.[tool] || entry.destination,
      fingerprint_key:
        entry.sources?.[tool] || entry.fingerprint_key || entry.source,
    })),
  ];
  const retiredPaths = new Set();
  for (const entry of backfill ? [] : retired) {
    const { destination } = entry;
    validateDeploymentPath(destination);
    if (deployed.has(destination) || retiredPaths.has(destination))
      throw new Error(`Conflicting retired destination: ${destination}`);
    retiredPaths.add(destination);
    if (files.has(destination)) {
      stageAction(
        destination,
        file(safePath(root, destination)),
        files.get(destination),
      );
      files.delete(destination);
      continue;
    }
    const state = destinationState(
      root,
      { ...entry, ownership: 'release' },
      pristine,
    );
    if (state === 'owned')
      stageAction(destination, file(safePath(root, destination)), null);
    if (state === 'preserve') report.kept.push(destination);
  }

  for (const [destination, incoming] of files) {
    validateDeploymentPath(destination);
    stageAction(destination, file(safePath(root, destination)), incoming);
  }

  if (pairing?.key_file) {
    stageAction('status/radio.key', file(safePath(root, 'status/radio.key')), {
      bytes: Buffer.from(`${pairing.key_file}\n`),
      mode: 0o600,
    });
  }

  const stagedPaths = new Set(
    actions
      .filter((action) => action.installed_hash)
      .map((action) => action.destination),
  );
  for (const check of path.checks) {
    if (check.kind === 'node-syntax') {
      syntaxCheck(
        safePath(stagedPaths.has(check.path) ? stage : root, check.path),
        check.path,
      );
    }
  }
  const removeChecklistKeys = manifest.remove_status_checklist_keys ?? [];
  if (
    !Array.isArray(removeChecklistKeys) ||
    removeChecklistKeys.some((key) => typeof key !== 'string' || !key)
  )
    throw new Error('Invalid retired checklist key declarations.');
  return {
    actions,
    entries,
    checks: path.checks,
    removeChecklistKeys,
    report,
    nextStatus,
    tool,
  };
}

function missingDirectories(root, actions) {
  const missing = new Set();
  for (const { destination, kind } of actions) {
    if (kind !== 'add') continue;
    for (
      let parent = dirname(destination);
      parent !== '.';
      parent = dirname(parent)
    ) {
      if (existsSync(safePath(root, parent))) break;
      missing.add(parent);
    }
  }
  return [...missing].sort((a, b) => b.length - a.length);
}

function currentHash(root, path) {
  const current = file(safePath(root, path));
  return current && digest(current.bytes);
}

function currentMode(root, path) {
  return file(safePath(root, path))?.mode;
}

function postApplyChecks(root, plan) {
  for (const action of plan.actions) {
    if (
      currentHash(root, action.destination) !== action.installed_hash ||
      currentMode(root, action.destination) !== action.installed_mode
    ) {
      throw new Error(
        `Promoted file does not match staged contents: ${action.destination}`,
      );
    }
  }
  for (const check of plan.checks) {
    if (check.kind === 'node-syntax') {
      syntaxCheck(safePath(root, check.path), check.path);
    } else {
      for (const entry of plan.entries) {
        if (!file(safePath(root, entry.destination)))
          throw new Error(`Missing deployed file: ${entry.destination}`);
      }
    }
  }
  if (process.env.ORION_UPDATE_SMOKE_FAIL === '1')
    throw new Error('Injected update smoke-check failure');
}

function replaceFromBackup(backup, path, source, mode) {
  const temporary = safePath(backup, 'promote.tmp');
  copyFileSync(source, temporary);
  chmodSync(temporary, mode);
  mkdirSync(dirname(path), { recursive: true });
  renameSync(temporary, path);
}

function sameFile(snapshot, hash, mode) {
  return (
    (snapshot && digest(snapshot.bytes)) === hash && snapshot?.mode === mode
  );
}

function matchesPriorOrInstalled(root, action) {
  const target = file(safePath(root, action.destination));
  if (sameFile(target, action.prior_hash, action.prior_mode)) return 'prior';
  if (sameFile(target, action.installed_hash, action.installed_mode))
    return 'installed';
  return 'collision';
}

function validateRollbackJournal(journal) {
  const hashes = /^[a-f0-9]{64}$/;
  const validState = (hash, mode) =>
    hash == null
      ? mode == null
      : hashes.test(hash) &&
        Number.isInteger(mode) &&
        mode >= 0 &&
        mode <= 0o777;
  const affected = [...journal.actions, journal.status];
  const added = journal.actions.filter((action) => action.prior_hash === null);
  if (
    journal.status.destination !== statusFile ||
    !hashes.test(journal.status.prior_hash) ||
    new Set(affected.map((action) => action.destination.toLowerCase())).size !==
      affected.length ||
    affected.some(
      (action) =>
        !validState(action.prior_hash, action.prior_mode) ||
        !validState(action.installed_hash, action.installed_mode),
    )
  )
    throw new Error('Invalid published update journal.');
  for (const { destination } of journal.actions)
    validateDeploymentPath(destination);
  for (const directory of journal.created_directories) {
    validateDeploymentPath(directory);
    if (
      !added.some(({ destination }) => destination.startsWith(`${directory}/`))
    )
      throw new Error(`Invalid recovery directory: ${directory}`);
  }
}

function rollback(root, backup, journal, { automatic = false } = {}) {
  validateRollbackJournal(journal);
  if (automatic && process.env.ORION_UPDATE_RESTORE_FAIL === '1')
    throw new Error('Injected restoration failure');
  const affected = [...journal.actions, journal.status];
  const collisions = affected.filter((action) => {
    try {
      return matchesPriorOrInstalled(root, action) === 'collision';
    } catch {
      return true;
    }
  });
  if (collisions.length)
    throw new Error(
      `Update recovery collisions: ${collisions.map((action) => action.destination).join(', ')}`,
    );

  for (const action of affected.filter((action) => action.prior_hash)) {
    const original = file(safePath(backup, `files/${action.destination}`));
    if (!sameFile(original, action.prior_hash, action.prior_mode))
      throw new Error(`Backup verification failed: ${action.destination}`);
  }
  for (const action of affected.reverse()) {
    const target = safePath(root, action.destination);
    const match = matchesPriorOrInstalled(root, action);
    if (match === 'prior') continue;
    if (match === 'collision')
      throw new Error(`Update recovery collisions: ${action.destination}`);
    if (action.prior_hash) {
      replaceFromBackup(
        backup,
        target,
        safePath(backup, `files/${action.destination}`),
        action.prior_mode,
      );
    } else unlinkSync(target);
  }
  for (const directory of journal.created_directories) {
    try {
      rmdirSync(safePath(root, directory));
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
  }
  rmSync(join(backup, 'stage'), { recursive: true, force: true });
}

function recordFailure(backup, journal, failure, restoration) {
  saveEvidence(backup, 'failure.json', {
    failure,
    restoration: restoration || 'restored',
    affected_files: [...journal.actions.map((a) => a.destination), statusFile],
  });
}

function restoreInterrupted(root, backup, journal, failure) {
  const backupRel = `${backups}/${basename(backup)}`;
  journal.state = 'recovery-required';
  saveJournal(backup, journal);
  recordFailure(backup, journal, failure, 'restoration started');
  try {
    rollback(root, backup, journal, { automatic: true });
  } catch (error) {
    recordFailure(backup, journal, failure, error.message);
    throw new Error(
      `Update requires recovery from a separate pinned source. Evidence: ${backupRel}\n${error.message}`,
    );
  }
  recordFailure(backup, journal, failure);
  journal.state = 'recovered';
  saveJournal(backup, journal);
}

function pendingTransactions(root) {
  const directory = safePath(root, backups);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const backup = safePath(root, `${backups}/${entry.name}`);
      const path = safePath(backup, 'journal.json');
      if (!existsSync(path)) return [];
      const journal = json(path);
      if (
        journal.kind !== 'published-update' ||
        !['pending', 'verified', 'recovery-required'].includes(journal.state)
      )
        return [];
      return [{ backup, journal }];
    });
}

function requireRecoveryMessage(backup) {
  return `Update requires recovery from a separate pinned source. Evidence: ${backups}/${basename(backup)}`;
}

export function assertPublishedUpdateNotBlocked(
  root,
  { includePending = false } = {},
) {
  const blocked = pendingTransactions(root).find(
    ({ journal }) => includePending || journal.state === 'recovery-required',
  );
  if (blocked) throw new Error(requireRecoveryMessage(blocked.backup));
}

function withUpdateLock(root, operation) {
  const directory = safePath(root, backups);
  mkdirSync(directory, { mode: 0o700, recursive: true });
  // Claim before inspecting other claims. Simultaneous contenders may both
  // stop, but a later contender must see any process already promoting files.
  const claim = mkdtempSync(join(directory, `claim-${process.pid}-`));
  try {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const other = join(directory, entry.name);
      if (!entry.isDirectory() || other === claim) continue;
      const owner = /^claim-([1-9]\d*)-[\w]+$/.exec(entry.name);
      if (!owner) continue;
      try {
        process.kill(Number(owner[1]), 0);
      } catch (error) {
        if (error.code === 'ESRCH') continue;
        if (error.code !== 'EPERM') throw error;
      }
      throw new Error('Another Orion update is running.');
    }
    return operation();
  } finally {
    rmdirSync(claim);
  }
}

function assertPriorFile(root, action) {
  const prior = file(safePath(root, action.destination));
  if (
    (prior && digest(prior.bytes)) !== action.prior_hash ||
    prior?.mode !== action.prior_mode
  )
    throw new Error(
      `Local file changed during update preflight: ${action.destination}`,
    );
  return prior;
}

function releaseOrigin(client) {
  const { repository, apiBase, sourceUrl } = client;
  return { repository, apiBase, sourceUrl };
}

function sameTransactionSource(journal, client, pin) {
  return (
    ['tag', 'commit', 'release_id', 'manifest_version'].every(
      (key) => journal.release?.[key] === pin[key],
    ) &&
    Object.entries(releaseOrigin(client)).every(
      ([key, value]) => journal.source?.[key] === value,
    )
  );
}

function promote(root, stage, priorStatus, plan, pin, client) {
  const backup = mkdtempSync(join(safePath(root, backups), `${pin.tag}-`));
  const backupRel = `${backups}/${basename(backup)}`;
  const journal = {
    kind: 'published-update',
    state: 'pending',
    release: pin,
    source: releaseOrigin(client),
    actions: plan.actions,
    created_directories: missingDirectories(root, plan.actions),
    status: {
      destination: statusFile,
      prior_mode: priorStatus.mode,
      prior_hash: digest(priorStatus.bytes),
    },
  };
  for (const action of [...plan.actions, journal.status]) {
    const prior = assertPriorFile(root, action);
    if (prior)
      write(
        safePath(backup, `files/${action.destination}`),
        prior.bytes,
        prior.mode,
      );
  }
  for (const action of plan.actions.filter((a) => a.installed_hash)) {
    const staged = file(safePath(stage, action.destination));
    write(
      safePath(backup, `stage/${action.destination}`),
      staged.bytes,
      staged.mode,
    );
  }
  saveJournal(backup, journal);
  try {
    let count = 0;
    for (const action of plan.actions) {
      assertPriorFile(root, action);
      const target = safePath(root, action.destination);
      if (action.kind === 'retire') unlinkSync(target);
      else
        replaceFromBackup(
          backup,
          target,
          safePath(backup, `stage/${action.destination}`),
          action.installed_mode,
        );
      count++;
      if (count === Number(process.env.ORION_UPDATE_FAIL_AFTER))
        throw new Error('Injected update interruption');
      if (count === Number(process.env.ORION_UPDATE_INTERRUPT_AFTER))
        process.exit(2);
    }
    postApplyChecks(root, plan);
    if (
      currentHash(root, statusFile) !== journal.status.prior_hash ||
      currentMode(root, statusFile) !== journal.status.prior_mode
    )
      throw new Error('Harness status changed during the update.');
    const status = JSON.parse(plan.nextStatus?.bytes ?? priorStatus.bytes);
    status.selected_tool = plan.tool;
    for (const key of plan.removeChecklistKeys) delete status.checklist?.[key];
    status.template_version = pin.manifest_version;
    status.applied_release = { ...pin, applied_at: new Date().toISOString() };
    status.notes = [
      status.notes,
      `updated to ${pin.tag}; backup in ${backupRel}`,
    ]
      .filter(Boolean)
      .join('\n');
    const next = serialized(status);
    journal.status.installed_hash = digest(next);
    journal.status.installed_mode = priorStatus.mode;
    journal.state = 'verified';
    const stagedStatus = safePath(backup, `stage/${statusFile}`);
    write(stagedStatus, next, priorStatus.mode);
    saveJournal(backup, journal);
    renameSync(stagedStatus, safePath(root, statusFile));
  } catch (error) {
    restoreInterrupted(root, backup, journal, error.message);
    throw new Error(
      `${error.message}. The prior release was restored. Report: ${backupRel}/failure.json`,
    );
  }
  journal.state = 'complete';
  saveJournal(backup, journal);
  rmSync(join(backup, 'stage'), { recursive: true, force: true });
  return {
    ...plan.report,
    applied_release: json(safePath(root, statusFile)).applied_release,
    backup: backupRel,
  };
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function separateTarget(root, migrateTo) {
  const parent = dirname(realpathSync(root));
  const requested = resolve(
    migrateTo ?? join(parent, `${basename(root)}-deployed`),
  );
  if (realpathSync(dirname(requested)) !== parent)
    throw new Error(
      'Choose a new deployed folder alongside the original harness.',
    );
  return join(parent, basename(requested));
}

function copyLegacyHarness(source, destination, path, manifest) {
  if (!Array.isArray(path.copy_exclude))
    throw new Error('Missing separate-folder migration copy exclusions.');
  const excluded = [
    '.git',
    '.update-backup',
    '.orion-migration.json',
    'status/shifts',
    ...manifest.deployment.release_only,
    ...path.copy_exclude,
  ].map((value) => value.replace(/\/$/, ''));
  for (const value of excluded)
    validateDeploymentPath(
      value === '.git' || value === backups ? `excluded/${value}` : value,
    );
  function copy(relativePath) {
    if (excluded.includes(relativePath)) return;
    const original = safePath(source, relativePath);
    const stat = lstatSync(original);
    if (stat.isDirectory()) {
      mkdirSync(safePath(destination, relativePath), { mode: 0o700 });
      for (const name of readdirSync(original)) copy(`${relativePath}/${name}`);
    } else {
      const prior = file(original);
      write(safePath(destination, relativePath), prior.bytes, prior.mode);
    }
  }
  for (const name of readdirSync(source)) copy(name);
}

function stageSeparateHarness(root, target) {
  if (pathExists(target))
    throw new Error('The new deployed folder must not exist.');
  const prefix = `.${basename(target)}-migration-`;
  const stage = mkdtempSync(join(dirname(target), `${prefix}${process.pid}-`));
  try {
    for (const entry of readdirSync(dirname(target), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
      const candidate = join(dirname(target), entry.name);
      if (candidate === stage) continue;
      const owner = /^([1-9]\d*)-[a-zA-Z0-9]+$/.exec(
        entry.name.slice(prefix.length),
      );
      if (!owner) continue;
      try {
        process.kill(Number(owner[1]), 0);
      } catch (error) {
        if (error.code === 'ESRCH') {
          const marker = safePath(candidate, '.orion-migration.json');
          if (pathExists(marker) && json(marker).source === root)
            rmSync(candidate, { recursive: true, force: true });
          continue;
        }
        if (error.code !== 'EPERM') throw error;
      }
      throw new Error('Another migration is staging this deployed folder.');
    }
    write(
      join(stage, '.orion-migration.json'),
      serialized({ source: root }),
      0o600,
    );
    return stage;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

async function applySeparateMigration({
  root,
  priorStatus,
  checkout,
  client,
  pin,
  manifest,
  path,
  stage,
  migrateTo,
  pairing,
  declared,
}) {
  const target = separateTarget(root, migrateTo);
  const destination = stageSeparateHarness(root, target);
  try {
    copyLegacyHarness(root, destination, path, manifest);
    selectPath({
      root: destination,
      manifest,
      status: JSON.parse(priorStatus.bytes),
      previous: null,
      read: (directory, relativePath) =>
        file(safePath(directory, relativePath)),
    });
    const copy = file(safePath(destination, statusFile));
    if (!copy.bytes.equals(priorStatus.bytes) || copy.mode !== priorStatus.mode)
      throw new Error(
        'Original harness status changed during migration preflight.',
      );
    const plan = planUpdate({
      root: destination,
      checkout,
      manifest,
      path,
      stage,
      pairing,
      declared,
    });
    if (!plan.nextStatus)
      throw new Error('Separate migration must declare its status changes.');
    const init = spawnSync(
      'git',
      ['-C', destination, 'init', '-q', '-b', 'main'],
      { encoding: 'utf8' },
    );
    if (init.status !== 0)
      throw new Error('Could not create the local deployed repository.');
    await verifyPinnedRelease(client, pin, checkout);
    assertPriorFile(root, {
      destination: statusFile,
      prior_hash: digest(priorStatus.bytes),
      prior_mode: priorStatus.mode,
    });
    mkdirSync(safePath(destination, backups), { mode: 0o700 });
    const result = promote(destination, stage, copy, plan, pin, client);
    if (pathExists(target))
      throw new Error('The new deployed folder must not exist.');
    assertPriorFile(root, {
      destination: statusFile,
      prior_hash: digest(priorStatus.bytes),
      prior_mode: priorStatus.mode,
    });
    unlinkSync(join(destination, '.orion-migration.json'));
    renameSync(destination, target);
    return { ...result, deployed_folder: target };
  } catch (error) {
    throw new Error(
      `Migration stopped. The original folder is unchanged. ${error.message.replace(/ Report: \.update-backup\/\S+$/, '')}`,
    );
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

function requireDeployedRoot(root) {
  root = resolve(root);
  if (!lstatSync(root).isDirectory())
    throw new Error('Expected a deployed harness directory.');
  return root;
}

function requireReleasePin(pin) {
  if (
    typeof pin?.tag !== 'string' ||
    !/^v/.test(pin.tag) ||
    !versionPattern.test(pin.manifest_version) ||
    pin.tag !== `v${pin.manifest_version}` ||
    !/^[a-f0-9]{40}$/.test(pin.commit) ||
    !Number.isSafeInteger(pin.release_id) ||
    pin.release_id < 1
  )
    throw new Error('A full published release identity is required.');
}

export async function recoverPublishedUpdate({
  root,
  checkout,
  client,
  pin,
  backupRel,
}) {
  root = requireDeployedRoot(root);
  requireReleasePin(pin);
  const separation = relative(realpathSync(root), realpathSync(checkout));
  if (
    !separation ||
    !(
      separation === '..' ||
      separation.startsWith(`..${sep}`) ||
      isAbsolute(separation)
    )
  )
    throw new Error(
      'Recovery requires a separate checkout outside the deployed harness.',
    );
  const entry = pendingTransactions(root).find(
    ({ backup }) => backupRel === `${backups}/${basename(backup)}`,
  );
  if (!entry)
    throw new Error('Choose the backup for an unfinished published update.');
  const { backup, journal } = entry;
  if (!sameTransactionSource(journal, client, pin))
    throw new Error(
      'Recovery requires the original transaction release and source recorded in its journal.',
    );
  await verifyPinnedRelease(client, pin, checkout, { rollbackOnly: true });

  return withUpdateLock(root, () => {
    const latest = pendingTransactions(root).find(
      (entry) => entry.backup === backup,
    );
    if (!latest || serialized(latest.journal) !== serialized(journal))
      throw new Error('The transaction changed during recovery verification.');
    journal.state = 'recovery-required';
    saveJournal(backup, journal);
    const report = {
      backup: backupRel,
      release: pin,
      affected_files: [
        ...journal.actions.map((action) => action.destination),
        statusFile,
      ],
      attempted_at: new Date().toISOString(),
    };
    saveEvidence(backup, 'recovery.json', {
      ...report,
      restoration: 'started',
    });
    try {
      rollback(root, backup, journal);
    } catch (error) {
      saveEvidence(backup, 'recovery.json', {
        ...report,
        restoration: error.message,
      });
      throw new Error(`${requireRecoveryMessage(backup)}\n${error.message}`);
    }
    const result = { ...report, restoration: 'restored' };
    saveEvidence(backup, 'recovery.json', result);
    journal.state = 'recovered';
    saveJournal(backup, journal);
    return result;
  });
}

export async function applyPublishedUpdate({
  root,
  checkout,
  client,
  pin,
  migrateTo,
  migrationPairing,
}) {
  root = realpathSync(requireDeployedRoot(root));
  requireReleasePin(pin);
  assertPublishedUpdateNotBlocked(root);
  const pending = pendingTransactions(root);
  if (pending.length) {
    const requireOriginalSource = ({ backup, journal }) => {
      if (
        journal.state === 'recovery-required' ||
        !sameTransactionSource(journal, client, pin)
      )
        throw new Error(requireRecoveryMessage(backup));
    };
    for (const entry of pending) requireOriginalSource(entry);
    await verifyPinnedRelease(client, pin, checkout);
    withUpdateLock(root, () => {
      const unfinished = pendingTransactions(root);
      for (const entry of unfinished) requireOriginalSource(entry);
      for (const { backup, journal } of unfinished) {
        validateRollbackJournal(journal);
        if (
          journal.state === 'verified' &&
          sameFile(
            file(safePath(root, statusFile)),
            journal.status.installed_hash,
            journal.status.installed_mode,
          ) &&
          journal.actions.every((action) =>
            sameFile(
              file(safePath(root, action.destination)),
              action.installed_hash,
              action.installed_mode,
            ),
          )
        ) {
          journal.state = 'complete';
          saveJournal(backup, journal);
          rmSync(join(backup, 'stage'), { recursive: true, force: true });
        } else {
          restoreInterrupted(
            root,
            backup,
            journal,
            'Previous update interrupted',
          );
        }
      }
    });
  }
  const statusPath = safePath(root, statusFile);
  const priorStatus = file(statusPath);
  if (!priorStatus) throw new Error('Harness status file is missing.');
  const status = JSON.parse(priorStatus.bytes);
  const pairing = migrationPairing ? json(migrationPairing) : null;
  if (
    pairing &&
    (!pairing.sharing ||
      pairing.sharing.radio_choice !== 'accepted' ||
      (pairing.key_file !== undefined && typeof pairing.key_file !== 'string'))
  )
    throw new Error('Invalid pairing staged for the separate migration.');

  const previous = recordedRelease(status);
  if (!versionPattern.test(status.template_version))
    throw new Error(`Starting release identity is invalid. ${cleanInstall}`);
  const priorTag = `v${status.template_version}`;
  const order = compareVersions(pin.tag, priorTag);
  if (order < 0)
    throw new Error(`Refusing downgrade from ${priorTag} to ${pin.tag}.`);
  if (order === 0 && previous) {
    await requireWorkingRadio(root, status);
    await verifyPinnedRelease(client, pin, checkout);
    if (
      previous.commit !== pin.commit ||
      previous.release_id !== pin.release_id
    )
      throw new Error(`Release integrity conflict for ${pin.tag}.`);
    if (currentHash(root, statusFile) !== digest(priorStatus.bytes))
      throw new Error('Harness status changed during the request.');
    if (status.selected_tool != null) {
      if (migrateTo || pairing)
        throw new Error(
          'The selected release is already deployed in this folder.',
        );
      if (!['claude-code', 'codex'].includes(status.selected_tool))
        throw new Error(`Unknown recorded tool. ${cleanInstall}`);
      return {
        message: `${pin.tag} already applied.`,
        applied_release: previous,
      };
    }
  }

  const manifest = json(safePath(checkout, 'update/manifest.json'));
  if (manifest.template_version !== pin.manifest_version)
    throw new Error('Pinned manifest identity changed.');
  const stage = mkdtempSync(join(dirname(checkout), 'orion-update-stage-'));
  try {
    const path = selectPath({
      root,
      manifest,
      status,
      previous,
      read: (directory, destination) => file(safePath(directory, destination)),
    });
    const changingFolder = path.starting_layout === 'legacy-same-folder';
    if (!changingFolder && (migrateTo || pairing))
      throw new Error(
        'The selected migration path applies to your existing deployed folder.',
      );
    if (changingFolder && order === 0)
      throw new Error(
        `A same-folder harness cannot verify this exact deployed release. ${cleanInstall}`,
      );
    await requireWorkingRadio(
      root,
      pairing ? { ...status, sharing: pairing.sharing } : status,
      pairing?.key_file,
    );
    const declared = updatePath({ root, checkout, manifest, path });
    if (changingFolder) {
      await verifyPinnedRelease(client, pin, checkout);
      return await applySeparateMigration({
        root,
        priorStatus,
        checkout,
        client,
        pin,
        manifest,
        path,
        stage,
        migrateTo,
        pairing,
        declared,
      });
    }
    const plan = planUpdate({
      root,
      checkout,
      manifest,
      path,
      stage,
      backfill: order === 0,
      declared,
    });
    await verifyPinnedRelease(client, pin, checkout);
    return withUpdateLock(root, () => {
      if (pendingTransactions(root).length)
        throw new Error(
          'An interrupted update is pending. Retry your request to recover it.',
        );
      return promote(root, stage, priorStatus, plan, pin, client);
    });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
