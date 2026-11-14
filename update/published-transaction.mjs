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
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  destinationState,
  fingerprint,
  planForTool,
  safePath,
  selectedTool,
} from './destination-resolver.mjs';
import { compareVersions, verifyPinnedRelease } from './published-release.mjs';
import {
  keyHeader,
  radioKey,
  radioOn,
  readRadioKeyFile,
} from '../status/shapes.mjs';

const statusFile = 'status/status.json';
const backups = '.update-backup';
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
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

function saveJournal(backup, journal) {
  const path = join(backup, 'journal.json');
  const temporary = `${path}.tmp`;
  write(temporary, serialized(journal), 0o600);
  renameSync(temporary, path);
}

function runtimePairing(root, status) {
  const where = {
    keyFile: readRadioKeyFile(dirname(safePath(root, 'status/radio.key')), {
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

async function requireWorkingRadio(root, status) {
  const { url, key } = runtimePairing(root, status);
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

function compatibility(manifest, version, tool, deployed) {
  const matches =
    manifest.update_compatibility?.filter(
      (entry) => entry.from_version === version && entry.tool === tool,
    ) || [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected one supported update path from ${version} for ${tool}. A separate clean install is available when no path is declared.`,
    );
  }
  const path = matches[0];
  if (!Array.isArray(path.steps) || path.steps.length !== 0)
    throw new Error('The declared migration path is unavailable.');
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

function planUpdate({ root, checkout, manifest, status, stage }) {
  const tool = selectedTool(status, manifest.deployment);
  const entries = planForTool(manifest.deployment, tool, {
    releaseRoot: checkout,
    root,
  });
  const deployed = new Map(entries.map((entry) => [entry.destination, entry]));
  const path = compatibility(manifest, status.template_version, tool, deployed);
  const required = new Set(path.required_destinations);
  const pristine = json(join(checkout, 'update/pristine.json'));
  const actions = [];
  const report = {
    refreshed: [],
    added: [],
    retired: [],
    kept: [],
    collisions: [],
  };

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
  for (const entry of retired) {
    const { destination } = entry;
    validateDeploymentPath(destination);
    if (deployed.has(destination) || retiredPaths.has(destination))
      throw new Error(`Conflicting retired destination: ${destination}`);
    retiredPaths.add(destination);
    const state = destinationState(
      root,
      { ...entry, ownership: 'release' },
      pristine,
    );
    if (state === 'owned')
      stageAction(destination, file(safePath(root, destination)), null);
    if (state === 'preserve') report.kept.push(destination);
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
  return { actions, entries, checks: path.checks, removeChecklistKeys, report };
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
  const temporary = join(backup, 'promote.tmp');
  copyFileSync(source, temporary);
  chmodSync(temporary, mode);
  mkdirSync(dirname(path), { recursive: true });
  renameSync(temporary, path);
}

function rollback(root, backup, journal) {
  const affected = [...journal.actions, journal.status];
  const collisions = affected.filter((action) => {
    try {
      const now = currentHash(root, action.destination);
      const mode = currentMode(root, action.destination);
      return (
        !(now === action.prior_hash && mode === action.prior_mode) &&
        !(now === action.installed_hash && mode === action.installed_mode)
      );
    } catch {
      return true;
    }
  });
  if (collisions.length)
    throw new Error(
      `Update recovery collisions: ${collisions.map((action) => action.destination).join(', ')}`,
    );

  for (const action of affected.reverse()) {
    const target = safePath(root, action.destination);
    if (
      action.prior_hash === currentHash(root, action.destination) &&
      action.prior_mode === currentMode(root, action.destination)
    )
      continue;
    if (action.prior_hash) {
      const source = safePath(backup, `files/${action.destination}`);
      if (digest(readFileSync(source)) !== action.prior_hash)
        throw new Error(`Backup verification failed: ${action.destination}`);
      replaceFromBackup(backup, target, source, action.prior_mode);
    } else {
      unlinkSync(target);
    }
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
  write(
    join(backup, 'failure.json'),
    serialized({
      failure,
      restoration: restoration || 'restored',
      affected_files: [
        ...journal.actions.map((a) => a.destination),
        statusFile,
      ],
    }),
    0o600,
  );
}

function restoreInterrupted(root, backup, journal, failure) {
  try {
    rollback(root, backup, journal);
  } catch (error) {
    recordFailure(backup, journal, failure, error.message);
    journal.state = 'recovery-required';
    saveJournal(backup, journal);
    throw new Error(
      `Update requires recovery. Evidence: ${backup}. ${error.message}`,
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

function promote(root, stage, priorStatus, plan, pin) {
  const backup = mkdtempSync(join(safePath(root, backups), `${pin.tag}-`));
  const backupRel = `${backups}/${basename(backup)}`;
  const journal = {
    kind: 'published-update',
    state: 'pending',
    release: pin,
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
    const status = JSON.parse(priorStatus.bytes);
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

export async function applyPublishedUpdate({ root, checkout, client, pin }) {
  root = resolve(root);
  if (!lstatSync(root).isDirectory())
    throw new Error('Expected a deployed harness directory.');
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
  const statusPath = safePath(root, statusFile);
  const priorStatus = file(statusPath);
  if (!priorStatus) throw new Error('Harness status file is missing.');
  const status = JSON.parse(priorStatus.bytes);
  await requireWorkingRadio(root, status);
  const pending = pendingTransactions(root);
  if (pending.some(({ journal }) => journal.state === 'recovery-required'))
    throw new Error('Update requires recovery from a separate pinned source.');
  if (pending.length) {
    await verifyPinnedRelease(client, pin, checkout);
    withUpdateLock(root, () => {
      for (const { backup, journal } of pendingTransactions(root)) {
        if (journal.state === 'recovery-required')
          throw new Error(`Update requires recovery. Evidence: ${backup}`);
        if (
          journal.state === 'verified' &&
          currentHash(root, statusFile) === journal.status.installed_hash
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
    return applyPublishedUpdate({ root, checkout, client, pin });
  }

  const previous = recordedRelease(status);
  const order = compareVersions(pin.tag, previous.tag);
  if (order < 0)
    throw new Error(`Refusing downgrade from ${previous.tag} to ${pin.tag}.`);
  if (order === 0) {
    await verifyPinnedRelease(client, pin, checkout);
    if (
      previous.commit !== pin.commit ||
      previous.release_id !== pin.release_id
    )
      throw new Error(`Release integrity conflict for ${pin.tag}.`);
    if (currentHash(root, statusFile) !== digest(priorStatus.bytes))
      throw new Error('Harness status changed during the request.');
    return {
      message: `${pin.tag} already applied.`,
      applied_release: previous,
    };
  }

  const manifest = json(safePath(checkout, 'update/manifest.json'));
  if (manifest.template_version !== pin.manifest_version)
    throw new Error('Pinned manifest identity changed.');
  const stage = mkdtempSync(join(dirname(checkout), 'orion-update-stage-'));
  try {
    const plan = planUpdate({ root, checkout, manifest, status, stage });
    await verifyPinnedRelease(client, pin, checkout);
    return withUpdateLock(root, () => {
      if (pendingTransactions(root).length)
        throw new Error(
          'An interrupted update is pending. Retry your request to recover it.',
        );
      return promote(root, stage, priorStatus, plan, pin);
    });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
