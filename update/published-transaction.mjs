/** Transaction for updating an already deployed harness from a verified publication. */
import { isDeepStrictEqual } from 'node:util';
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
import {
  compareVersions,
  verifyPinnedRelease,
  verifyReleaseWithdrawal,
} from './published-release.mjs';
import {
  historicalFiles,
  reviewRequiredEdits,
} from './published-conflicts.mjs';
import {
  probeReleaseRadio,
  HARNESS_ID_RE,
  INSTALL_TOKEN_RE,
  radioKey,
  radioOn,
  readRadioKeyFile,
} from '../status/shapes.mjs';
import {
  cleanInstall,
  MissingUpdatePath,
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
    await probeReleaseRadio(url, key);
    return;
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
      `Invalid script ${displayPath}. Check it locally for syntax errors.`,
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

async function planUpdate({
  root,
  checkout,
  manifest,
  path,
  stage,
  backfill,
  pairing,
  declared,
  review,
}) {
  const tool = path.tool;
  const { entries, deployed, steps } = declared;
  const required = new Set(path.required_destinations);
  const immutableSources = new Set(
    manifest.deployment.immutable_update_sources,
  );
  const { files, migrations, original, blocked } = runSteps({
    steps,
    read: (destination) => file(safePath(root, destination)),
    defaults: json(safePath(checkout, 'status/status.schema-template.json')),
    reviewable: backfill ? undefined : required,
  });
  let nextStatus = files.get(statusFile);
  files.delete(statusFile);
  if (pairing) {
    if (!nextStatus && path.starting_layout === 'legacy-same-folder')
      throw new Error('Separate migration must declare its status changes.');
    const base = nextStatus ?? file(safePath(root, statusFile));
    const status = JSON.parse(base.bytes);
    status.sharing = { ...status.sharing, ...pairing.sharing };
    nextStatus = { ...base, bytes: Buffer.from(serialized(status)) };
  }
  const conflicts = [];
  let historical;
  const pristine = json(join(checkout, 'update/pristine.json'));
  const actions = [];
  const identityFiles = [];
  const seen = new Set();
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
    const key = destination.toLowerCase();
    if (seen.has(key))
      throw new Error(`Conflicting update destinations: ${destination}`);
    seen.add(key);
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
      identityFiles.push({
        destination,
        prior_hash: digest(prior.bytes),
        prior_mode: prior.mode,
      });
      continue;
    }
    if (files.has(destination)) {
      const migrated = files.get(destination);
      if (!migrated)
        throw new Error(`Migration retired deployed file: ${destination}`);
      files.delete(destination);
      if (
        !immutableSources.has(source) ||
        migrated.bytes.equals(incoming.bytes)
      ) {
        stageAction(destination, original.get(destination), migrated);
        continue;
      }
      if (!required.has(destination))
        throw new Error(
          `Migration changed immutable release source: ${destination}`,
        );
      // A migration cannot substitute other bytes for a pinned update control file.
      for (const migration of migrations) {
        migration.changed = migration.changed.filter(
          (change) => change.path !== destination,
        );
      }
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
    const sameContents = (first, second) =>
      immutableSources.has(source)
        ? first.equals(second)
        : fingerprint(first) === fingerprint(second);
    if (sameContents(prior.bytes, incoming.bytes)) continue;
    if (required.has(destination)) {
      historical ??= await historicalFiles({ ...review, path, stage, file });
      const shipped = historical.at(destination);
      if (!shipped || !sameContents(shipped.bytes, prior.bytes)) {
        conflicts.push({
          destination,
          prior: shipped,
          installed: prior,
          incoming,
          replaceOnly: immutableSources.has(source),
        });
        continue;
      }
      if (blocked.has(destination)) throw blocked.get(destination);
    } else if (state === 'preserve') {
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
  const deployedPaths = new Set(
    [...deployed.keys()].map((destination) => destination.toLowerCase()),
  );
  const retiredPaths = new Set();
  for (const entry of backfill ? [] : retired) {
    const { destination } = entry;
    validateDeploymentPath(destination);
    const canonical = destination.toLowerCase();
    if (deployedPaths.has(canonical) || retiredPaths.has(canonical))
      throw new Error(`Conflicting retired destination: ${destination}`);
    retiredPaths.add(canonical);
    if (files.has(destination)) {
      stageAction(
        destination,
        original.get(destination),
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
    if (
      deployedPaths.has(destination.toLowerCase()) ||
      retiredPaths.has(destination.toLowerCase())
    )
      throw new Error(
        `Migration path spelling differs from the deployment: ${destination}`,
      );
    stageAction(destination, original.get(destination), incoming);
  }

  if (pairing?.key_file) {
    stageAction('status/radio.key', file(safePath(root, 'status/radio.key')), {
      bytes: Buffer.from(`${pairing.key_file}\n`),
      mode: 0o600,
    });
  }

  const resolutions = reviewRequiredEdits({
    ...review,
    path,
    historical,
    conflicts,
  });
  for (const { destination, choice, installed, result } of resolutions) {
    stageAction(destination, installed, result);
    (report.resolved_required ??= []).push({ destination, choice });
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
    identityFiles,
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

export async function withUpdateLock(root, operation) {
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
    return await operation();
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
  for (const identity of plan.identityFiles) assertPriorFile(root, identity);
  const backup = mkdtempSync(join(safePath(root, backups), `${pin.tag}-`));
  const backupRel = `${backups}/${basename(backup)}`;
  const journal = {
    kind: 'published-update',
    state: 'pending',
    release: pin,
    source: releaseOrigin(client),
    actions: plan.actions,
    ...(plan.pairingOnly && { pairing_only: true }),
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
    for (const identity of plan.identityFiles) assertPriorFile(root, identity);
    if (
      currentHash(root, statusFile) !== journal.status.prior_hash ||
      currentMode(root, statusFile) !== journal.status.prior_mode
    )
      throw new Error('Harness status changed during the update.');
    const status = JSON.parse(plan.nextStatus?.bytes ?? priorStatus.bytes);
    status.selected_tool = plan.tool;
    journal.removed_checklist_keys = plan.removeChecklistKeys.filter((key) =>
      Object.hasOwn(status.checklist ?? {}, key),
    );
    for (const key of plan.removeChecklistKeys) delete status.checklist?.[key];
    status.template_version = pin.manifest_version;
    if (!plan.pairingOnly) {
      status.applied_release = { ...pin, applied_at: new Date().toISOString() };
      status.notes = [
        status.notes,
        `updated to ${pin.tag}; backup in ${backupRel}`,
      ].filter(Boolean).join('\n');
    }
    journal.applied_at = status.applied_release.applied_at;
    journal.installed_tool = plan.tool;
    const next = serialized(status);
    journal.status.installed_hash = digest(next);
    journal.status.installed_mode = priorStatus.mode;
    journal.state = 'verified';
    if (!plan.pairingOnly) {
      // Keep the committed side of the three-way restore even after staging
      // cleanup. The journal verifies its bytes before they are used.
      write(safePath(backup, 'installed-status.json'), next, 0o600);
      journal.installed_status_snapshot = true;
    }
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
  review,
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
    const plan = await planUpdate({
      root: destination,
      checkout,
      manifest,
      path,
      stage,
      pairing,
      declared,
      review,
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
    const failure = error.message.match(
      /(?:Report|Evidence): (\.update-backup\/[^\s]+)/,
    )?.[1];
    if (failure) {
      const retained = mkdtempSync(
        join(dirname(target), `.${basename(target)}-migration-failure-`),
      );
      const location = safePath(destination, failure);
      const source = lstatSync(location).isDirectory()
        ? location
        : dirname(location);
      for (const name of ['journal.json', 'failure.json']) {
        const record = file(safePath(source, name));
        if (record) write(join(retained, name), record.bytes, 0o600);
      }
      throw new Error(
        `Migration stopped. The original folder is unchanged. Report: ${join(retained, 'failure.json')}`,
      );
    }
    throw new Error(
      `Migration stopped. The original folder is unchanged. ${error.message}`,
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

function completedBackup(root, backupRel, current, client) {
  if (
    !/^\.update-backup\/[\w.-]+$/.test(backupRel) ||
    /\/\.{1,2}$/.test(backupRel)
  )
    throw new Error(
      'Choose a completed published backup under .update-backup.',
    );
  const backup = safePath(root, backupRel);
  const snapshot = file(safePath(backup, 'journal.json'));
  if (!snapshot) throw new Error('The published backup journal is missing.');
  const journal = JSON.parse(snapshot.bytes);
  if (journal.kind !== 'published-update' || journal.state !== 'complete' || journal.pairing_only)
    throw new Error('Choose the backup for a completed published update.');
  const status = JSON.parse(current.bytes);
  const applied = recordedRelease(status);
  // Older journals have no application timestamp. The saved status hash or
  // the most recent update note still ties them to a single application.
  const lastUpdateNote = String(status.notes ?? '')
    .split('\n')
    .reverse()
    .find((line) => /^updated to v[^ ]+; backup in /.test(line));
  const matchesApplication = journal.applied_at
    ? journal.applied_at === applied?.applied_at
    : sameFile(
        current,
        journal.status?.installed_hash,
        journal.status?.installed_mode,
      ) ||
      lastUpdateNote === `updated to ${applied?.tag}; backup in ${backupRel}`;
  if (
    !applied ||
    !matchesApplication ||
    !sameTransactionSource(journal, client, applied)
  )
    throw new Error(
      'This backup does not match the currently applied release.',
    );
  if (journal.installed_tool && status.selected_tool !== journal.installed_tool)
    throw new Error(
      'The tool layout changed after this update. Keep the backup and contact Daily Practice to recover.',
    );
  validateRollbackJournal(journal);
  if (!journal.status.installed_hash)
    throw new Error('The backup does not record a completed status change.');
  return {
    backup,
    journal,
    status,
    applied,
    journalHash: digest(snapshot.bytes),
  };
}

function originalBackupFile(backup, action) {
  const saved = file(safePath(backup, `files/${action.destination}`));
  if (!sameFile(saved, action.prior_hash, action.prior_mode))
    throw new Error(`Backup verification failed: ${action.destination}`);
  return saved;
}

function reverseStatusFields(before, installed, current, report, prefix = '') {
  const next = { __proto__: null, ...current };
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  for (const key of new Set([...Object.keys(before), ...Object.keys(installed)])) {
    if (!prefix && ['applied_release', 'template_version', 'selected_tool', 'sharing'].includes(key))
      continue;
    const old = Object.hasOwn(before, key) ? before[key] : undefined;
    const applied = Object.hasOwn(installed, key) ? installed[key] : undefined;
    if (isDeepStrictEqual(old, applied)) continue;
    const value = Object.hasOwn(current, key) ? current[key] : undefined;
    const field = /^[A-Za-z0-9_-]+$/.test(key)
      ? [prefix, key].filter(Boolean).join('.')
      : `${prefix}[${JSON.stringify(key)}]`;
    if (isDeepStrictEqual(value, applied)) {
      if (old === undefined) delete next[key];
      else next[key] = old;
      report.restore.push(field);
    } else if ((old === undefined || isObject(old)) && isObject(applied) && isObject(value)) {
      next[key] = reverseStatusFields(old ?? {}, applied, value, report, field);
    } else {
      report.keep.push(field);
    }
  }
  return next;
}

function restorePlan(root, backupRel, current, context) {
  const { backup, journal, status, applied, journalHash } = context;
  const before = JSON.parse(originalBackupFile(backup, journal.status).bytes);
  if (!versionPattern.test(before.template_version))
    throw new Error('Invalid prior release version in the backup.');
  recordedRelease(before);
  const restore = [];
  const remove = [];
  const keep = [];
  const statusChanges = { restore: [], keep: [] };
  let next;
  if (journal.installed_status_snapshot) {
    const saved = file(safePath(backup, 'installed-status.json'));
    if (!saved || digest(saved.bytes) !== journal.status.installed_hash)
      throw new Error('Backup verification failed: installed status snapshot.');
    next = reverseStatusFields(before, JSON.parse(saved.bytes), status, statusChanges);
  } else if (sameFile(current, journal.status.installed_hash, journal.status.installed_mode)) {
    next = reverseStatusFields(before, status, status, statusChanges);
  } else {
    // Earlier backups recorded only a status hash and removed checklist keys.
    next = { ...status };
    for (const key of journal.removed_checklist_keys ?? []) {
      if (!Object.hasOwn(before.checklist ?? {}, key)) continue;
      if (!status.checklist || Object.hasOwn(status.checklist, key)) {
        statusChanges.keep.push(`checklist.${key}`);
        continue;
      }
      next.checklist = { ...next.checklist, [key]: before.checklist[key] };
      statusChanges.restore.push(`checklist.${key}`);
    }
  }
  next.template_version = before.template_version;
  if (Object.hasOwn(before, 'applied_release'))
    next.applied_release = before.applied_release;
  else delete next.applied_release;
  next.notes = [next.notes, `restored from ${backupRel}`]
    .filter(Boolean)
    .join('\n');
  const actions = [];
  const observed = [];
  for (const action of journal.actions) {
    const { destination } = action;
    // A separate-folder migration can stage radio opt-in. Keep the live key.
    if (destination.toLowerCase() === 'status/radio.key') {
      keep.push(destination);
      continue;
    }
    let installed;
    try {
      installed = file(safePath(root, destination));
    } catch (error) {
      if (
        !/^(?:Symlink collision|Expected regular file):/.test(error.message) &&
        error.code !== 'ENOTDIR'
      )
        throw error;
      observed.push([destination, 'non-file']);
      keep.push(destination);
      continue;
    }
    observed.push([
      destination,
      installed && digest(installed.bytes),
      installed?.mode,
    ]);
    if (!sameFile(installed, action.installed_hash, action.installed_mode)) {
      keep.push(destination);
      continue;
    }
    if (action.prior_hash) {
      originalBackupFile(backup, action);
      restore.push(destination);
    } else {
      remove.push(destination);
    }
    actions.push({
      destination,
      kind: !action.installed_hash
        ? 'add'
        : action.prior_hash
          ? 'replace'
          : 'retire',
      prior_hash: action.installed_hash,
      prior_mode: action.installed_mode,
      installed_hash: action.prior_hash,
      installed_mode: action.prior_mode,
    });
  }
  const to = {
    template_version: before.template_version,
    applied_release: before.applied_release ?? null,
  };
  const report = {
    backup: backupRel,
    from: applied,
    to,
    restore,
    remove,
    keep,
    status_restore: statusChanges.restore,
    status_keep: statusChanges.keep,
  };
  const confirm = digest(
    serialized([
      root,
      report,
      journalHash,
      digest(current.bytes),
      current.mode,
      observed,
    ]),
  );
  return { report, confirm, actions, next };
}

function promoteRestore(root, backupRel, context, plan, current) {
  const { actions, report, next } = plan;
  const backup = mkdtempSync(join(safePath(root, backups), 'restore-'));
  const evidence = `${backups}/${basename(backup)}`;
  const nextBytes = serialized(next);
  // A reverse transaction keeps the pre-restore bytes so the established
  // separate recovery command can undo an incomplete elected restoration.
  const journal = {
    kind: 'published-update',
    state: 'recovery-required',
    release: context.journal.release,
    source: context.journal.source,
    restoring: backupRel,
    actions,
    created_directories: missingDirectories(root, actions),
    status: {
      destination: statusFile,
      prior_hash: digest(current.bytes),
      prior_mode: current.mode,
      installed_hash: digest(nextBytes),
      installed_mode: current.mode,
    },
  };
  for (const action of [...actions, journal.status]) {
    const original = assertPriorFile(root, action);
    if (original)
      write(
        safePath(backup, `files/${action.destination}`),
        original.bytes,
        original.mode,
      );
  }
  const stagedStatus = safePath(backup, 'status.next');
  write(stagedStatus, nextBytes, current.mode);
  saveJournal(backup, journal);
  try {
    let count = 0;
    for (const action of actions) {
      assertPriorFile(root, action);
      const target = safePath(root, action.destination);
      if (action.installed_hash) {
        const saved = originalBackupFile(context.backup, {
          destination: action.destination,
          prior_hash: action.installed_hash,
          prior_mode: action.installed_mode,
        });
        const staged = safePath(backup, 'restoring.tmp');
        write(staged, saved.bytes, saved.mode);
        mkdirSync(dirname(target), { recursive: true });
        renameSync(staged, target);
      } else unlinkSync(target);
      count++;
      if (count === Number(process.env.ORION_UPDATE_INTERRUPT_AFTER))
        process.exit(2);
      if (count === Number(process.env.ORION_UPDATE_FAIL_AFTER))
        throw new Error('Injected restore interruption');
    }
    assertPriorFile(root, journal.status);
    renameSync(stagedStatus, safePath(root, statusFile));
    journal.state = 'restore-complete';
    saveJournal(backup, journal);
  } catch (error) {
    restoreInterrupted(root, backup, journal, error.message);
    throw new Error(
      `${error.message}. The pre-restore state was restored. Report: ${evidence}/failure.json`,
    );
  }
  return {
    ...report,
    message: `Restored version ${report.to.template_version}.`,
    evidence,
  };
}

export async function restoreCompletedPublishedUpdate({
  root,
  client,
  backupRel,
  confirm,
}) {
  root = realpathSync(requireDeployedRoot(root));
  assertPublishedUpdateNotBlocked(root, { includePending: true });
  const current = file(safePath(root, statusFile));
  if (!current) throw new Error('Harness status file is missing.');
  const context = completedBackup(root, backupRel, current, client);
  if (!(await verifyReleaseWithdrawal(client, context.applied)))
    throw new Error(`${context.applied.tag} has no verified withdrawal.`);
  const review = () => {
    assertPublishedUpdateNotBlocked(root, { includePending: true });
    const latest = file(safePath(root, statusFile));
    if (!sameFile(latest, digest(current.bytes), current.mode))
      throw new Error(
        'The restore preview changed. Run the preview again before confirming.',
      );
    const open = completedBackup(root, backupRel, latest, client);
    const approved = restorePlan(root, backupRel, latest, open);
    if (confirm === undefined)
      return { ...approved.report, confirm: approved.confirm };
    if (confirm !== approved.confirm)
      throw new Error(
        'The restore preview changed. Run the preview again before confirming.',
      );
    return promoteRestore(root, backupRel, open, approved, latest);
  };
  return confirm === undefined ? review() : withUpdateLock(root, review);
}

function matchingCompletedBackup(root, current, client) {
  const directory = safePath(root, backups);
  if (!existsSync(directory)) return null;
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const backupRel = `${backups}/${entry.name}`;
    try {
      const context = completedBackup(root, backupRel, current, client);
      restorePlan(root, backupRel, current, context);
      matches.push(backupRel);
    } catch {
      // Irrelevant, incomplete, or unverifiable backups are never offered.
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

async function offerCompletedRestore(
  error,
  { root, checkout, pin, client, previous, priorStatus },
) {
  if (
    !(error instanceof MissingUpdatePath) ||
    !previous ||
    compareVersions(pin.tag, previous.tag) <= 0
  )
    return error;
  await verifyPinnedRelease(client, pin, checkout);
  if (!(await verifyReleaseWithdrawal(client, previous).catch(() => false)))
    return error;
  const backup = matchingCompletedBackup(root, priorStatus, client);
  const guidance = backup
    ? `Preview your pre-update backup with node update/request.mjs --restore-backup ${backup}. You can also keep using your current version while you wait for a compatible correction.`
    : 'No matching completed backup could be verified. Keep your current folder and contact Daily Practice.';
  return new Error(
    `${previous.tag} was withdrawn and ${pin.tag} has no supported update path from it. ${guidance}\n${error.message}`,
  );
}

async function requireSupportedPath({
  root,
  checkout,
  pin,
  client,
  previous,
  priorStatus,
  status,
  manifest,
}) {
  try {
    return selectPath({
      root,
      manifest,
      status,
      previous,
      read: (directory, destination) => file(safePath(directory, destination)),
    });
  } catch (error) {
    throw await offerCompletedRestore(error, {
      root,
      checkout,
      pin,
      client,
      previous,
      priorStatus,
    });
  }
}

// The launcher calls this before offering pairing to an affected harness.
// A correction without a direct path should leave radio settings untouched.
export async function preflightWithdrawnUpdate({
  root,
  checkout,
  pin,
  client,
}) {
  const priorStatus = file(safePath(root, statusFile));
  if (!priorStatus) throw new Error('Harness status file is missing.');
  const status = JSON.parse(priorStatus.bytes);
  const previous = recordedRelease(status);
  if (!previous || compareVersions(pin.tag, previous.tag) <= 0) return;
  const manifest = json(safePath(checkout, 'update/manifest.json'));
  await requireSupportedPath({
    root,
    checkout,
    pin,
    client,
    previous,
    priorStatus,
    status,
    manifest,
  });
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
  stagedPairing,
  reviewDir,
}) {
  root = realpathSync(requireDeployedRoot(root));
  requireReleasePin(pin);
  assertPublishedUpdateNotBlocked(root);
  const pending = pendingTransactions(root);
  if (pending.length) {
    if (reviewDir)
      throw new Error(
        'Recover the interrupted update before resolving a required edit.',
      );
    const requireOriginalSource = ({ backup, journal }) => {
      if (
        journal.state === 'recovery-required' ||
        !sameTransactionSource(journal, client, pin)
      )
        throw new Error(requireRecoveryMessage(backup));
    };
    for (const entry of pending) requireOriginalSource(entry);
    await verifyPinnedRelease(client, pin, checkout);
    await withUpdateLock(root, () => {
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
  const pairing = stagedPairing ? json(stagedPairing) : null;
  const keyPath = 'status/radio.key';
  const sharing = pairing?.sharing;
  function assertPairingBinding(target) {
    const savedKey = file(safePath(root, keyPath));
    if (
      !pairing.binding ||
      pairing.binding.source !== root ||
      pairing.binding.target !== target ||
      pairing.binding.status !== digest(priorStatus.bytes) ||
      pairing.binding.key !== (savedKey && digest(savedKey.bytes)) ||
      sharing?.radio_choice !== 'accepted' ||
      sharing?.status_signal_enabled !== true ||
      !HARNESS_ID_RE.test(sharing.harness_id ?? '') ||
      !INSTALL_TOKEN_RE.test(pairing.key_file ?? sharing.install_token ?? '')
    ) throw new Error('Staged radio pairing no longer matches your harness.');
    return savedKey;
  }
  const pairedStatus = pairing ? { ...status, sharing } : status;

  const previous = recordedRelease(status);
  if (!versionPattern.test(status.template_version))
    throw new Error(`Starting release identity is invalid. ${cleanInstall}`);
  const priorTag = `v${status.template_version}`;
  const order = compareVersions(pin.tag, priorTag);
  if (order < 0)
    throw new Error(`Refusing downgrade from ${priorTag} to ${pin.tag}.`);
  if (order === 0 && previous) {
    if (reviewDir)
      throw new Error(
        'This required-edit review is stale. Request the update again.',
      );
    if (pairing) assertPairingBinding(root);
    await requireWorkingRadio(root, pairedStatus, pairing?.key_file);
    await verifyPinnedRelease(client, pin, checkout);
    if (
      previous.commit !== pin.commit ||
      previous.release_id !== pin.release_id
    )
      throw new Error(`Release integrity conflict for ${pin.tag}.`);
    if (currentHash(root, statusFile) !== digest(priorStatus.bytes))
      throw new Error('Harness status changed during the request.');
    if (status.selected_tool != null) {
      if (migrateTo)
        throw new Error(
          'The selected release is already deployed in this folder.',
        );
      if (!['claude-code', 'codex'].includes(status.selected_tool))
        throw new Error(`Unknown recorded tool. ${cleanInstall}`);
      const result = {
        message: `${pin.tag} already applied.`,
        applied_release: previous,
      };
      if (!pairing) return result;
      const stage = mkdtempSync(join(dirname(checkout), 'orion-pairing-stage-'));
      try {
        return await withUpdateLock(root, () => {
          assertPublishedUpdateNotBlocked(root, { includePending: true });
          const savedKey = assertPairingBinding(root);
          const bytes = pairing.key_file && Buffer.from(`${pairing.key_file}\n`);
          const actions = [];
          if (bytes) {
            write(safePath(stage, keyPath), bytes, 0o600);
            actions.push({
              destination: keyPath,
              kind: savedKey ? 'replace' : 'add',
              prior_hash: savedKey && digest(savedKey.bytes),
              prior_mode: savedKey?.mode,
              installed_hash: digest(bytes),
              installed_mode: 0o600,
            });
          }
          return promote(root, stage, priorStatus, {
            pairingOnly: true,
            actions,
            identityFiles: [],
            checks: [],
            removeChecklistKeys: [],
            nextStatus: { ...priorStatus, bytes: Buffer.from(serialized(pairedStatus)) },
            tool: status.selected_tool,
            report: result,
          }, pin, client);
        });
      } finally {
        rmSync(stage, { recursive: true, force: true });
      }
    }
  }

  const manifest = json(safePath(checkout, 'update/manifest.json'));
  if (manifest.template_version !== pin.manifest_version)
    throw new Error('Pinned manifest identity changed.');
  const stage = mkdtempSync(join(dirname(checkout), 'orion-update-stage-'));
  try {
    const path = await requireSupportedPath({
      root,
      checkout,
      pin,
      client,
      previous,
      priorStatus,
      status,
      manifest,
    });
    const changingFolder = path.starting_layout === 'legacy-same-folder';
    if (!changingFolder && migrateTo)
      throw new Error(
        'The selected migration path applies to your existing deployed folder.',
      );
    if (changingFolder && order === 0)
      throw new Error(
        `A same-folder harness cannot verify this exact deployed release. ${cleanInstall}`,
      );
    const pairingTarget = changingFolder ? separateTarget(root, migrateTo) : root;
    if (pairing) assertPairingBinding(pairingTarget);
    await requireWorkingRadio(root, pairedStatus, pairing?.key_file);
    const declared = updatePath({ root, checkout, manifest, path });
    await verifyPinnedRelease(client, pin, checkout);
    const review = {
      root,
      pin,
      client,
      previous,
      priorStatus,
      reviewDir,
      migrateTo,
      pairingFile: stagedPairing,
    };
    if (changingFolder) {
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
        review,
      });
    }
    const plan = await planUpdate({
      root,
      checkout,
      manifest,
      path,
      stage,
      backfill: order === 0,
      pairing,
      declared,
      review,
    });
    await verifyPinnedRelease(client, pin, checkout);
    return withUpdateLock(root, () => {
      if (pairing) assertPairingBinding(root);
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
