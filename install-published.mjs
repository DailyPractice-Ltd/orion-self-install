#!/usr/bin/env node
/** New-client entry point; install.mjs is the maintainer/offline primitive. */
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  renameSync,
  lstatSync,
  readdirSync,
  rmdirSync,
} from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createReleaseClient,
  discoverRelease,
  pinRelease,
  verifyPinnedRelease,
} from './update/published-release.mjs';
import { planForTool, safePath } from './update/destination-resolver.mjs';
import {
  bridgeBase,
  normalizePairingCode,
  pairingCodeProblem,
} from './status/shapes.mjs';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
  renameSync(temporary, path);
};
export async function installPublished({
  target,
  tool,
  repository,
  apiBase,
  sourceUrl,
  bridgeUrl = bridgeBase(),
  code,
} = {}) {
  if (!target || !['codex', 'claude-code'].includes(tool))
    throw new Error('Specify --target and --tool codex|claude-code.');
  target = resolve(target);
  if (
    existsSync(target) &&
    (!lstatSync(target).isDirectory() ||
      lstatSync(target).isSymbolicLink() ||
      readdirSync(target).length)
  )
    throw new Error('Client folder must be new or empty.');
  const pending = join(
      dirname(target),
      `.${basename(target)}-published-install`,
    ),
    journal = join(pending, 'request.json'),
    harness = join(pending, 'harness');
  if (existsSync(pending) && lstatSync(pending).isSymbolicLink())
    throw new Error('Unsafe pending installation folder.');
  const client = createReleaseClient({ repository, apiBase, sourceUrl }),
    previous = existsSync(journal) ? read(journal) : null;
  if (
    previous &&
    (previous.target !== target ||
      previous.tool !== tool ||
      previous.repository !== client.repository ||
      previous.source_url !== client.sourceUrl ||
      previous.api_base !== client.apiBase)
  )
    throw new Error('Resume must use the original target, tool and source.');
  const temporary = mkdtempSync(join(tmpdir(), 'orion-published-source-')),
    checkout = join(temporary, 'source');
  try {
    const release = previous
        ? await client.get(`/releases/${previous.pin.release_id}`)
        : await discoverRelease(client),
      pin = await pinRelease(client, release, checkout);
    if (previous && JSON.stringify(previous.pin) !== JSON.stringify(pin))
      throw new Error('Paused installation publication identity changed.');
    // Last asynchronous operation before the first install write.
    await verifyPinnedRelease(client, pin, checkout);
    if (!previous) {
      mkdirSync(pending, { mode: 0o700 });
      save(journal, {
        target,
        tool,
        repository: client.repository,
        source_url: client.sourceUrl,
        api_base: client.apiBase,
        pin,
        phase: 'pairing',
      });
    }
    if (!existsSync(harness)) {
      const r = spawnSync(
        process.execPath,
        [
          join(checkout, 'install.mjs'),
          '--tool',
          tool,
          '--target',
          harness,
          '--local-only',
        ],
        { encoding: 'utf8' },
      );
      if (r.status !== 0)
        throw new Error(`Pinned installer failed: ${r.stderr.trim()}`);
    }
    const manifest = read(join(checkout, 'update/manifest.json'));
    for (const entry of planForTool(manifest.deployment, tool, {
      releaseRoot: checkout,
      root: harness,
    })) {
      if (
        !readFileSync(safePath(harness, entry.destination)).equals(
          readFileSync(safePath(checkout, entry.source)),
        )
      )
        throw new Error(
          `Pending install source mismatch: ${entry.destination}`,
        );
    }
    const statusPath = safePath(harness, 'status/status.json'),
      status = read(statusPath);
    if (status.applied_release) {
      if (previous?.phase !== 'ready-to-promote')
        throw new Error(
          'Unexpected successful record in pending installation.',
        );
      // This is a prepared transaction, not an applied release: only the final
      // directory rename exposes it. Reconfirm radio and publication on resume.
      delete status.applied_release;
      save(statusPath, status);
    }
    if (status.selected_tool !== tool)
      throw new Error('Pending selected tool changed.');
    status.template_version = pin.manifest_version;
    status.sharing = {
      ...status.sharing,
      status_signal_enabled: true,
      radio_choice: 'accepted',
    };
    let working = false;
    try {
      if (code) {
        if (pairingCodeProblem(code)) throw new Error('Invalid pairing code.');
        const r = await fetch(`${bridgeUrl.replace(/\/$/, '')}/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: normalizePairingCode(code) }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error('Pairing unavailable.');
        const pack = await r.json();
        if (!pack.install_token || !pack.harness_id)
          throw new Error('Incomplete pairing response.');
        Object.assign(status.sharing, {
          install_token: pack.install_token,
          harness_id: pack.harness_id,
          bridge_url: pack.bridge_url || bridgeUrl,
          paired_at: new Date().toISOString(),
        });
        save(statusPath, status);
      }
      if (status.sharing.install_token && status.sharing.harness_id) {
        const r = await fetch(
            `${status.sharing.bridge_url.replace(/\/$/, '')}/nudges?v=1`,
            {
              headers: {
                Authorization: `Bearer ${status.sharing.install_token}`,
              },
              signal: AbortSignal.timeout(10000),
            },
          ),
          body = r.ok ? await r.json() : null;
        working =
          r.ok &&
          (Array.isArray(body?.messages) || Array.isArray(body?.nudges));
      }
    } catch {
      /* Pairing/connectivity failure pauses, never records success. */
    }
    if (!working) {
      save(statusPath, status);
      return {
        paused: true,
        message:
          'Installation paused: an enabled, paired, working radio is required. Run the same install command again with --code YOUR-CODE when pairing is available.',
      };
    }
    await verifyPinnedRelease(client, pin, checkout);
    save(journal, { ...read(journal), phase: 'ready-to-promote' });
    status.applied_release = { ...pin, applied_at: new Date().toISOString() };
    save(statusPath, status);
    try {
      if (existsSync(target)) rmdirSync(target);
      renameSync(harness, target);
    } catch (error) {
      delete status.applied_release;
      save(statusPath, status);
      throw error;
    }
    rmSync(pending, { recursive: true, force: true });
    return {
      paused: false,
      message: `Installed ${pin.tag} at ${target}. Next: enter that folder and run node start.mjs.`,
    };
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
    const r = await installPublished({
      target: arg('--target'),
      tool: arg('--tool'),
      repository: arg('--repository'),
      apiBase: arg('--api-base'),
      sourceUrl: arg('--source-url'),
      bridgeUrl: arg('--bridge-url'),
      code: arg('--code') || process.env.ORION_PAIRING_CODE,
    });
    console.log(r.message);
    if (r.paused) process.exitCode = 3;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
