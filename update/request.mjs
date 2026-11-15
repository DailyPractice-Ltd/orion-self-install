#!/usr/bin/env node
/** Deployed entry point. Pairing is separate from the pinned release update. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  rmdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  bridgeBase,
  exchangeRadioCode,
  homeOn,
  pairingCodeProblem,
  probeReleaseRadio,
  radioKey,
  radioOn,
} from '../status/shapes.mjs';
import { safePath } from './destination-resolver.mjs';
import {
  removeReviewPairing,
  resumeReviewPairing,
  savePairingContinuation,
} from './published-conflicts.mjs';
import {
  createReleaseClient,
  discoverRelease,
  pinRelease,
  verifyReleaseWithdrawal,
} from './published-release.mjs';
import {
  assertPublishedUpdateNotBlocked,
  preflightWithdrawnUpdate,
  restoreCompletedPublishedUpdate,
} from './published-transaction.mjs';

const statusFile = 'status/status.json';
const keyFile = 'status/radio.key';
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

async function exchangePairingCode(status, savedKey, code) {
  const problem = pairingCodeProblem(code);
  if (problem) throw new Error(`Update paused. Pairing failed. ${problem}`);
  const base = bridgeBase();
  try {
    const pair = await exchangeRadioCode(base, code, status.sharing?.harness_id);
    const keyApart = homeOn(status) || savedKey !== null;
    return {
      sharing: {
        ...status.sharing,
        status_signal_enabled: true,
        radio_choice: 'accepted',
        bridge_url: pair.bridge_url,
        harness_id: pair.harness_id,
        install_token: keyApart ? null : pair.install_token,
        paired_at: pair.paired_at,
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

export async function requestPublishedUpdate({
  root = process.cwd(),
  repository,
  apiBase,
  sourceUrl,
  tag,
  migrateTo,
  reviewDir,
  pairRadio = false,
  resumePairing,
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
  if (pairRadio && resumePairing)
    throw new Error('Choose either a new pairing code or a saved pairing.');
  const localKey = { keyFile: savedKey?.toString() };
  const needsPairing = pairRadio || Boolean(resumePairing) || !radioOn(status, localKey);
  if (needsPairing && radioKey(status, localKey).source === 'environment')
    throw new Error(
      'Update paused. Pair from a session without the ORION_INSTALL_TOKEN override.',
    );
  const legacyMigration = needsPairing && (migrateTo || openLegacyLayout(root));
  const digest = (content) =>
    content && createHash('sha256').update(content).digest('hex');
  const source = realpathSync(root);
  const requestedTarget = migrateTo && resolve(migrateTo);
  const binding = {
    source,
    target: !legacyMigration ? source : requestedTarget
      ? join(realpathSync(dirname(requestedTarget)), basename(requestedTarget))
      : join(dirname(source), `${basename(source)}-deployed`),
    status: digest(before),
    key: digest(savedKey),
  };
  const temporary = mkdtempSync(join(tmpdir(), 'orion-update-source-'));
  const checkout = join(temporary, 'source');
  let continuation;
  let stagedPairing;
  let result;
  try {
    let pin;
    const pinCandidate = async () =>
      pinRelease(client, await discoverRelease(client, { tag }), checkout);
    if (
      needsPairing &&
      status.applied_release &&
      (await verifyReleaseWithdrawal(client, status.applied_release).catch(
        () => false,
      ))
    ) {
      pin = await pinCandidate();
      await preflightWithdrawnUpdate({ root, checkout, pin, client });
    }
    const savedFrom = resumePairing ?? (needsPairing && !pairRadio ? reviewDir : null);
    if (savedFrom) {
      continuation = resolve(savedFrom);
      stagedPairing = resumeReviewPairing(continuation, binding);
      if (resumePairing && !stagedPairing)
        throw new Error('No saved radio pairing found in that folder.');
    }
    if (needsPairing && !stagedPairing) {
      const code = await offerPairing(pairRadio, pairingCode);
      if (code === null) {
        console.error('Update paused. Your radio choice was kept.');
        return 2;
      }
      assertPublishedUpdateNotBlocked(root, { includePending: true });
      const pairing = await exchangePairingCode(status, savedKey, code);
      continuation = savePairingContinuation({ ...pairing, binding });
      stagedPairing = resumeReviewPairing(continuation, binding);
    }
    if (stagedPairing) {
      const { sharing, key_file } = stagedPairing.record;
      try {
        await probeReleaseRadio(sharing.bridge_url, { token: key_file ?? sharing.install_token }, bridgeBase());
      } catch {
        throw new Error('Update paused. The pairing succeeded, but the radio could not be confirmed.');
      }
      console.error('Radio pairing confirmed. Continuing your update.');
    }
    pin ??= await pinCandidate();
    const env = { ...process.env };
    delete env.ORION_PAIRING_CODE;
    result = await new Promise((complete, reject) => {
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
          ...(stagedPairing
            ? ['--staged-pairing', stagedPairing.path]
            : []),
        ],
        { stdio: 'inherit', env },
      );
      updater.once('error', reject);
      updater.once('close', (code) => complete(code ?? 2));
    });
    return result;
  } finally {
    if (stagedPairing) {
      if (result === 0) removeReviewPairing(continuation);
      if (!existsSync(stagedPairing.path)) {
        if (/^orion-radio-pairing-[\w]+$/.test(basename(continuation))) {
          try { rmdirSync(continuation); } catch { /* Keep other files. */ }
        }
      } else if (!reviewDir || resolve(reviewDir) !== continuation) {
        console.error(`Radio pairing is saved privately. Retry the update with --resume-pairing "${continuation}".`);
      }
    }
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
    const tag = arg('--tag');
    if (process.argv.includes('--tag') && !tag)
      throw new Error('--tag requires a published release tag.');
    const options = {
      root: resolve(arg('--root') || process.cwd()),
      repository: arg('--repository'),
      apiBase: arg('--api-base'),
      sourceUrl: arg('--source-url'),
    };
    if (process.argv.includes('--restore-backup')) {
      if (
        ['--tag', '--pair-radio', '--resume-pairing', '--migrate-to', '--resolve-required'].some(
          (flag) => process.argv.includes(flag),
        )
      )
        throw new Error('Run backup restoration as a separate request.');
      const confirm = arg('--confirm-restore');
      if (
        process.argv.includes('--confirm-restore') &&
        !/^[a-f0-9]{64}$/.test(confirm ?? '')
      )
        throw new Error('Enter the confirmation from the restore preview.');
      const result = await restoreCompletedPublishedUpdate({
        root: options.root,
        client: createReleaseClient(options),
        backupRel: arg('--restore-backup'),
        confirm,
      });
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (process.argv.includes('--confirm-restore'))
        throw new Error(
          'Specify --restore-backup when confirming restoration.',
        );
      const resumePairing = arg('--resume-pairing');
      if (process.argv.includes('--resume-pairing') && !resumePairing)
        throw new Error('--resume-pairing requires the private pairing folder.');
      process.exitCode = await requestPublishedUpdate({
        ...options,
        tag,
        migrateTo: arg('--migrate-to'),
        reviewDir: arg('--resolve-required'),
        pairRadio: process.argv.includes('--pair-radio'),
        resumePairing,
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
