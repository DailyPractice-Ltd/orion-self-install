#!/usr/bin/env node
/** Deployed entry point. The launcher performs no update writes. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReleaseClient,
  discoverRelease,
  pinRelease,
} from './published-release.mjs';
import { assertPublishedUpdateNotBlocked } from './published-transaction.mjs';

export async function requestPublishedUpdate({
  root,
  repository,
  apiBase,
  sourceUrl,
} = {}) {
  assertPublishedUpdateNotBlocked(root);
  const client = createReleaseClient({ repository, apiBase, sourceUrl });
  const temporary = mkdtempSync(join(tmpdir(), 'orion-update-source-'));
  const checkout = join(temporary, 'source');
  try {
    const pin = await pinRelease(
      client,
      await discoverRelease(client),
      checkout,
    );
    return await new Promise((resolve, reject) => {
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
        ],
        { stdio: 'inherit' },
      );
      updater.once('error', reject);
      updater.once('close', (code) => resolve(code ?? 2));
    });
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
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
