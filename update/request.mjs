#!/usr/bin/env node
/** Deployed entry point. Pairing is separate from the pinned release update. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  bridgeBase,
  HARNESS_ID_RE,
  homeOn,
  INSTALL_TOKEN_RE,
  keyHeader,
  normalizePairingCode,
  pairingCodeProblem,
  radioKey,
  radioOn,
} from '../status/shapes.mjs';
import { safePath } from './destination-resolver.mjs';
import {
  removeReviewPairing,
  resumeReviewPairing,
} from './published-conflicts.mjs';
import {
  createReleaseClient,
  discoverRelease,
  pinRelease,
} from './published-release.mjs';
import {
  assertPublishedUpdateNotBlocked,
  withUpdateLock,
} from './published-transaction.mjs';

const statusFile = 'status/status.json';
const keyFile = 'status/radio.key';
const networkTimeout = 10000;
const pairingOffer =
  'Published updates require a working radio so Orion can receive release and withdrawal notices. ' +
  'Turning it on enables the check-ins described in docs/radio.md.';
const pairingContinuation =
  'To opt in and continue this update, add --pair-radio to the same command. ' +
  'Use a pairing code from Daily Practice. Without an interactive terminal, supply it locally as ORION_PAIRING_CODE.';

function readLocalFile(root, relative, { optional = false } = {}) {
  const path = safePath(root, relative);
  try {
    if (!lstatSync(path).isFile())
      throw new Error(`Expected a regular file: ${relative}`);
    return readFileSync(path);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  }
}

function sameBytes(first, second) {
  return first === null ? second === null : first.equals(second);
}

function openLegacyLayout(root) {
  const manifest = readLocalFile(root, 'update/manifest.json', {
    optional: true,
  });
  if (!manifest) return false;
  const metadata = JSON.parse(manifest);
  return Boolean(metadata.template_version && !metadata.deployment);
}

async function offerPairing(explicit, code) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    if (!explicit)
      throw new Error(`Update paused. ${pairingOffer}\n${pairingContinuation}`);
    return code;
  }
  console.error(pairingOffer);
  let hideInput = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (hideInput) callback();
      else process.stderr.write(chunk, encoding, callback);
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    if (!explicit) {
      const choice = await terminal.question(
        'Turn on check-ins and continue your update? [y/N] ',
      );
      if (!/^y(?:es)?$/i.test(choice.trim())) return null;
    }
    if (code) return code;
    console.error(
      'Enter your Daily Practice pairing code, or press Enter to skip.',
    );
    hideInput = true;
    const entered = await terminal.question('');
    console.error();
    return entered.trim() || null;
  } finally {
    terminal.close();
  }
}

function pairingAddress(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error('Invalid radio address.');
  return url;
}

async function exchangePairingCode(status, savedKey, code) {
  const problem = pairingCodeProblem(code);
  if (problem) throw new Error(`Update paused. Pairing failed. ${problem}`);
  if (
    radioKey(status, { keyFile: savedKey?.toString() }).source === 'environment'
  ) {
    throw new Error(
      'Update paused. Pair from a session without the ORION_INSTALL_TOKEN override.',
    );
  }
  const base = bridgeBase();
  try {
    const origin = pairingAddress(base).origin;
    const response = await fetch(`${base}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalizePairingCode(code) }),
      redirect: 'error',
      signal: AbortSignal.timeout(networkTimeout),
    });
    if (!response.ok) throw new Error();
    const pair = await response.json();
    const bridgeUrl = (pair?.bridge_url || base).replace(/\/+$/, '');
    const previousId = status.sharing?.harness_id;
    if (
      typeof pair?.install_token !== 'string' ||
      !INSTALL_TOKEN_RE.test(pair.install_token) ||
      typeof pair.harness_id !== 'string' ||
      !HARNESS_ID_RE.test(pair.harness_id) ||
      (HARNESS_ID_RE.test(previousId || '') &&
        pair.harness_id !== previousId) ||
      pairingAddress(bridgeUrl).origin !== origin
    ) {
      throw new Error();
    }
    const probe = await fetch(`${bridgeUrl}/library`, {
      method: 'GET',
      headers: keyHeader({ token: pair.install_token }),
      redirect: 'error',
      signal: AbortSignal.timeout(networkTimeout),
    });
    if (!probe.ok || !Array.isArray((await probe.json())?.assets))
      throw new Error();
    const keyApart = homeOn(status) || savedKey !== null;
    return {
      sharing: {
        ...status.sharing,
        status_signal_enabled: true,
        radio_choice: 'accepted',
        bridge_url: bridgeUrl,
        harness_id: pair.harness_id,
        install_token: keyApart ? null : pair.install_token,
        paired_at: new Date().toISOString(),
      },
      ...(keyApart ? { key_file: pair.install_token } : {}),
    };
  } catch {
    throw new Error(
      'Update paused. Pairing failed or the radio could not be confirmed. ' +
        'Check the connection and ask Daily Practice for a fresh pairing code to continue.',
    );
  }
}

function persistPairing(root, status, before, savedKey, pairing) {
  const statusPath = safePath(root, statusFile);
  const keyPath = safePath(root, keyFile);
  // Stage beside the harness files on the same filesystem. This directory
  // is ignored by home saves, including if the pairing process is interrupted.
  const privateDir = safePath(root, '.update-backup');
  const staging = mkdtempSync(join(privateDir, 'radio-pairing-'));
  try {
    const nextStatus = join(staging, 'status.json');
    const nextKey = join(staging, 'radio.key');
    const priorKey = join(staging, 'previous.key');
    const privateFile = { mode: 0o600, flag: 'wx' };
    writeFileSync(
      nextStatus,
      JSON.stringify({ ...status, sharing: pairing.sharing }, null, 2) + '\n',
      privateFile,
    );
    if (pairing.key_file) {
      writeFileSync(nextKey, pairing.key_file + '\n', privateFile);
      if (savedKey) writeFileSync(priorKey, savedKey, privateFile);
    }
    if (
      !sameBytes(before, readLocalFile(root, statusFile)) ||
      !sameBytes(savedKey, readLocalFile(root, keyFile, { optional: true }))
    ) {
      throw new Error(
        'The harness radio settings changed during pairing. Check the radio and continue the update.',
      );
    }
    if (pairing.key_file) renameSync(nextKey, keyPath);
    try {
      renameSync(nextStatus, statusPath);
    } catch (error) {
      if (pairing.key_file) {
        if (savedKey) renameSync(priorKey, keyPath);
        else rmSync(keyPath);
      }
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function requestPublishedUpdate({
  root = process.cwd(),
  repository,
  apiBase,
  sourceUrl,
  migrateTo,
  reviewDir,
  pairRadio = false,
  pairingCode = process.env.ORION_PAIRING_CODE,
} = {}) {
  root = resolve(root);
  if (!lstatSync(root).isDirectory())
    throw new Error('Expected a deployed harness directory.');
  assertPublishedUpdateNotBlocked(root);
  const before = readLocalFile(root, statusFile);
  const status = JSON.parse(before);
  const savedKey = readLocalFile(root, keyFile, { optional: true });
  const client = createReleaseClient({ repository, apiBase, sourceUrl });
  const needsPairing =
    pairRadio || !radioOn(status, { keyFile: savedKey?.toString() });
  const legacyMigration = needsPairing && (migrateTo || openLegacyLayout(root));
  const digest = (content) =>
    content && createHash('sha256').update(content).digest('hex');
  const source = realpathSync(root);
  const binding = {
    source,
    target: resolve(
      migrateTo ?? join(dirname(source), `${basename(source)}-deployed`),
    ),
    status: digest(before),
    key: digest(savedKey),
  };
  const temporary = mkdtempSync(join(tmpdir(), 'orion-update-source-'));
  const checkout = join(temporary, 'source');
  let migrationPairing;
  function stageMigrationPairing(pairing) {
    migrationPairing = join(temporary, 'migration-pairing.json');
    writeFileSync(migrationPairing, JSON.stringify({ ...pairing, binding }), {
      mode: 0o600,
      flag: 'wx',
    });
  }
  try {
    const savedPairing =
      reviewDir && legacyMigration && !pairRadio
        ? resumeReviewPairing(resolve(reviewDir), binding)
        : null;
    if (savedPairing) stageMigrationPairing(savedPairing);
    else if (needsPairing) {
      const code = await offerPairing(pairRadio, pairingCode);
      if (code === null) {
        console.error('Update paused. Your radio choice was kept.');
        return 2;
      }
      assertPublishedUpdateNotBlocked(root, { includePending: true });
      const pairing = await exchangePairingCode(status, savedKey, code);
      if (legacyMigration) {
        // Pairing for a same-folder migration is promoted only to the new harness.
        stageMigrationPairing(pairing);
      } else {
        withUpdateLock(root, () => {
          assertPublishedUpdateNotBlocked(root, { includePending: true });
          persistPairing(root, status, before, savedKey, pairing);
        });
      }
      console.error('Radio pairing confirmed. Continuing your update.');
    }
    const pin = await pinRelease(
      client,
      await discoverRelease(client),
      checkout,
    );
    const env = { ...process.env };
    delete env.ORION_PAIRING_CODE;
    const result = await new Promise((complete, reject) => {
      const updater = spawn(
        process.execPath,
        [
          ...process.execArgv,
          join(checkout, 'update/apply.mjs'),
          'update-published',
          '--root',
          root,
          '--commit',
          pin.commit,
          '--tag',
          pin.tag,
          '--release-id',
          String(pin.release_id),
          '--repository',
          client.repository,
          '--api-base',
          client.apiBase,
          '--source-url',
          client.sourceUrl,
          ...(migrateTo ? ['--migrate-to', resolve(migrateTo)] : []),
          ...(reviewDir ? ['--resolve-required', resolve(reviewDir)] : []),
          ...(migrationPairing
            ? ['--migration-pairing', migrationPairing]
            : []),
        ],
        { stdio: 'inherit', env },
      );
      updater.once('error', reject);
      updater.once('close', (code) => complete(code ?? 2));
    });
    if (result === 0 && savedPairing) removeReviewPairing(resolve(reviewDir));
    return result;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  try {
    process.exitCode = await requestPublishedUpdate({
      root: resolve(arg('--root') || process.cwd()),
      repository: arg('--repository'),
      apiBase: arg('--api-base'),
      sourceUrl: arg('--source-url'),
      migrateTo: arg('--migrate-to'),
      reviewDir: arg('--resolve-required'),
      pairRadio: process.argv.includes('--pair-radio'),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
