/** Private, local review of exact release conflict inputs. */
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { safePath, planForTool } from './destination-resolver.mjs';
import { checkoutHistoricalRelease } from './published-release.mjs';

export async function historicalFiles({ client, previous, path, stage, file }) {
  const history = previous ?? path.verification?.historical_source;
  const checkout = join(stage, 'historical-source');
  let manifest;
  try {
    manifest = await checkoutHistoricalRelease(
      client,
      history,
      checkout,
      path.from_version,
    );
  } catch {
    throw new Error(
      'Cannot verify the exact prior shipped release for required edits. ' +
        'Keep this harness and retry when its historical release is available.',
    );
  }
  const deployed = manifest.deployment
    ? new Map(
        planForTool(manifest.deployment, path.tool, { releaseRoot: checkout })
          .filter((entry) => entry.ownership === 'release')
          .map(({ destination, source }) => [destination, source]),
      )
    : new Map(
        (manifest.refresh ?? []).map((destination) => [
          destination,
          destination,
        ]),
      );
  return {
    identity: {
      tag: history.tag,
      commit: history.commit,
      ...(history.release_id != null ? { release_id: history.release_id } : {}),
    },
    at(destination) {
      const source = deployed.get(destination);
      if (!source) return null;
      const prior = file(safePath(checkout, source));
      if (!prior) throw new Error(`Missing prior shipped file: ${destination}`);
      return prior;
    },
  };
}

const pairingRecord = '.migration-pairing.json';

function preserveReviewPairing(directory, pairing) {
  writeFileSync(join(directory, pairingRecord), JSON.stringify(pairing), {
    mode: 0o600,
    flag: 'wx',
  });
}

export function resumeReviewPairing(directory, binding) {
  try {
    const record = JSON.parse(
      privateReviewFile(directory, pairingRecord, { secret: true }),
    );
    if (!isDeepStrictEqual(record.binding, binding)) {
      throw new Error();
    }
    return record;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(
      'Saved radio pairing belongs to a different migration or the source harness changed. Check the original command before continuing.',
    );
  }
}

export function removeReviewPairing(directory) {
  rmSync(safePath(directory, pairingRecord), { force: true });
}

const identity = ({ tag, commit, release_id }) => ({ tag, commit, release_id });

function stamp(file) {
  return (
    file && {
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      mode: file.mode,
    }
  );
}

function reviewManifest({
  root,
  pin,
  historical,
  path,
  priorStatus,
  conflicts,
  migrateTo,
}) {
  return {
    version: 1,
    harness: root,
    ...(migrateTo && { migration_target: resolve(migrateTo) }),
    tool: path.tool,
    pin: identity(pin),
    historical: historical.identity,
    status: stamp(priorStatus),
    conflicts: conflicts.map(
      ({ destination, installed, incoming, prior, replaceOnly }, index) => {
        const base = `files/${index + 1}`;
        return {
          destination,
          prior: prior ? `${base}/prior` : null,
          edited: `${base}/edited`,
          incoming: `${base}/incoming`,
          merged: replaceOnly ? null : `${base}/merged`,
          versions: {
            prior: stamp(prior),
            edited: stamp(installed),
            incoming: stamp(incoming),
          },
          choice: null,
        };
      },
    ),
  };
}

function saveReview(manifest, conflicts, pairing) {
  const directory = mkdtempSync(join(tmpdir(), 'orion-required-review-'));
  const privateFile = { mode: 0o600, flag: 'wx' };
  try {
    for (const [index, conflict] of manifest.conflicts.entries()) {
      mkdirSync(join(directory, dirname(conflict.edited)), {
        mode: 0o700,
        recursive: true,
      });
      const { prior, installed, incoming } = conflicts[index];
      if (prior)
        writeFileSync(
          join(directory, conflict.prior),
          prior.bytes,
          privateFile,
        );
      writeFileSync(
        join(directory, conflict.edited),
        installed.bytes,
        privateFile,
      );
      writeFileSync(
        join(directory, conflict.incoming),
        incoming.bytes,
        privateFile,
      );
    }
    writeFileSync(
      join(directory, 'review.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      privateFile,
    );
    if (pairing) preserveReviewPairing(directory, pairing);
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function reviewFile(directory, path, { secret = false } = {}) {
  const file = safePath(directory, path);
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    (secret && process.platform !== 'win32' && stat.mode & 0o077)
  ) {
    throw new Error();
  }
  return readFileSync(file);
}

function privateReviewFile(directory, path, options) {
  const stat = lstatSync(directory);
  if (
    !stat.isDirectory() ||
    (process.platform !== 'win32' && stat.mode & 0o077)
  ) {
    throw new Error();
  }
  return reviewFile(directory, path, options);
}

function readReview(directory) {
  try {
    const review = JSON.parse(privateReviewFile(directory, 'review.json'));
    if (!Array.isArray(review?.conflicts)) throw new Error();
    return review;
  } catch {
    throw new Error(
      'Could not read a private required-edit review. Request the update again to make a new review.',
    );
  }
}

export function reviewRequiredEdits({ reviewDir, ...context }) {
  const { conflicts } = context;
  if (!conflicts.length) {
    if (reviewDir)
      throw new Error(
        'This required-edit review is stale. Request the update again.',
      );
    return [];
  }
  const expected = reviewManifest(context);
  const input = reviewDir && readReview(reviewDir);
  const evidence = input && {
    ...input,
    conflicts: input.conflicts.map((entry) => ({ ...entry, choice: null })),
  };
  if (!isDeepStrictEqual(evidence, expected)) {
    const folder = saveReview(expected, conflicts, context.pairing);
    throw new Error(
      (reviewDir ? 'The earlier review is stale.\n' : '') +
        `Required update is blocked by a local edit: ${conflicts.map(({ destination }) => destination).join(', ')}\n` +
        `Private review folder: ${folder}\n` +
        'Compare the copies in review.json, then follow the required-edit instructions in docs/updating.md.',
    );
  }
  return conflicts.map(({ destination, installed, incoming, prior }, index) => {
    const { choice, merged } = input.conflicts[index];
    if (choice === 'replace')
      return { destination, installed, choice, result: incoming };
    if (choice !== 'merge' || !merged) {
      const options = merged
        ? 'a reviewed merge or a backed-up replacement'
        : 'a backed-up replacement';
      throw new Error(
        `Choose ${options} for ${destination} in the private review, or defer.`,
      );
    }
    let bytes;
    try {
      bytes = reviewFile(reviewDir, merged);
    } catch {
      throw new Error(
        `Save the reviewed merge for ${destination} in the named file before continuing.`,
      );
    }
    if (
      [installed, prior].some(
        (version) => version && version.bytes.equals(bytes),
      ) ||
      /^(?:<{7}|\|{7}|={7}|>{7})(?:\s|$)/m.test(bytes.toString('utf8'))
    )
      throw new Error(
        `The reviewed merge for ${destination} must include the required change and resolve all conflict markers.`,
      );
    return { destination, installed, choice, result: { ...incoming, bytes } };
  });
}
