/**
 * update/pristine.json: for every path an update may refresh, the fingerprint of
 * every copy of that path this repository has ever held.
 *
 * "Update my harness" uses it to tell a file the client never touched (its
 * fingerprint is listed: refresh it) from one the client, their assistant or the
 * install has changed (not listed: keep it exactly as it is). It replaces "compare
 * with the copy at your version's tag", which could not serve a harness on a
 * version that was never tagged, and stranded a file that came from any commit
 * other than the tagged one.
 *
 *   node tests/helpers/pristine.mjs --write     regenerate, before every release
 *   node --test tests/*.test.mjs                fails if it is stale
 *
 * It needs the full git history (a shallow clone cannot know what we shipped).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PRISTINE_PATH = 'update/pristine.json';

/**
 * Line endings are normalised first, so one of our files checked out with CRLF
 * still reads as ours. docs/updating.md gives the installer the same one-liner.
 */
export const fingerprint = (buf) =>
  createHash('sha256').update(Buffer.from(buf).toString('utf8').replace(/\r\n/g, '\n')).digest('hex');

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: repo, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'ignore'], ...opts });

export function hasFullHistory() {
  const r = spawnSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: repo, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'false';
}

/** Every blob id a path has ever pointed at, merge resolutions included (-m). */
function blobIds(path) {
  const raw = git(['log', '-m', '--raw', '--no-abbrev', '--format=', 'HEAD', '--', path]).toString('utf8');
  const ids = new Set();
  for (const line of raw.split('\n')) {
    const m = /^:\d+ \d+ ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) /.exec(line);
    if (!m) continue;
    for (const id of [m[1], m[2]]) if (!/^0+$/.test(id)) ids.add(id);
  }
  return ids;
}

/** Read many blobs in one git process. */
function readBlobs(ids) {
  const out = git(['cat-file', '--batch'], { input: [...ids].join('\n') + '\n' });
  const blobs = new Map();
  let at = 0;
  while (at < out.length) {
    const nl = out.indexOf(0x0a, at);
    if (nl === -1) break;
    const [id, type, size] = out.subarray(at, nl).toString('utf8').split(' ');
    if (type !== 'blob') { at = nl + 1; continue; }
    const start = nl + 1;
    const end = start + Number(size);
    blobs.set(id, out.subarray(start, end));
    at = end + 1; // the newline git writes after each object
  }
  return blobs;
}

export function computePristine() {
  const manifest = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
  const idsByPath = new Map(manifest.refresh.filter((p) => p !== PRISTINE_PATH).map((p) => [p, blobIds(p)]));
  const blobs = readBlobs(new Set([...idsByPath.values()].flatMap((s) => [...s])));

  const files = {};
  for (const path of [...manifest.refresh].sort()) {
    // This file has no entry for itself. It cannot hold its own fingerprint, and
    // listing its earlier copies would change it on every regeneration. It is pure
    // data that nobody edits, so an update always replaces it (docs/updating.md, step 4).
    if (path === PRISTINE_PATH) continue;
    const prints = new Set();
    for (const id of idsByPath.get(path)) if (blobs.has(id)) prints.add(fingerprint(blobs.get(id)));
    // The copy about to ship is ours too.
    const here = join(repo, path);
    if (existsSync(here)) prints.add(fingerprint(readFileSync(here)));
    files[path] = [...prints].sort();
  }
  return {
    _what: "For every path 'update my harness' may refresh: the fingerprint of every copy of it Daily Practice has ever shipped. A local file whose fingerprint is listed under its path was never changed by the client, so the update refreshes it. One that is not listed is the client's now, and the update keeps it exactly as it is. Contract: docs/updating.md, step 4.",
    _fingerprint: 'SHA-256, as lowercase hex, of the file read as UTF-8 text with every CRLF turned into LF.',
    _regenerate: 'node tests/helpers/pristine.mjs --write, before every release. node --test fails if it is stale.',
    files,
  };
}

export const serialise = (data) => JSON.stringify(data, null, 1) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!hasFullHistory()) {
    console.error('This is a shallow clone. Fetch the full history first (git fetch --unshallow).');
    process.exit(1);
  }
  const text = serialise(computePristine());
  if (process.argv.includes('--write')) {
    writeFileSync(join(repo, PRISTINE_PATH), text);
    console.log(`wrote ${PRISTINE_PATH}`);
  } else {
    const current = existsSync(join(repo, PRISTINE_PATH)) ? readFileSync(join(repo, PRISTINE_PATH), 'utf8') : '';
    console.log(current === text ? 'up to date' : 'STALE: run with --write');
    process.exit(current === text ? 0 : 1);
  }
}
