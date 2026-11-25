/**
 * Which Orion harness a package script works for.
 *
 * A plugin package can run from a copy that is not inside any harness (a Codex
 * plugin cache, for one), so its own location says nothing about the harness.
 * The harness is the explicitly active project: `--root <folder>`, else the current
 * working directory. That folder must itself be one Orion harness (status/status.json
 * and status/guard.mjs, real files, not links elsewhere). No ancestor walk, no
 * sibling search: anything missing or ambiguous stops before any harness is read.
 *
 * Dependency-free: node:fs and node:path only.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const OPEN_IT = 'Open the intended Orion folder and run this from its root, or pass --root <that folder>.';

export class HarnessRootError extends Error {}

const fail = (why) => { throw new HarnessRootError(`${why} ${OPEN_IT}`); };

const real = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };

const MARKERS = ['status', 'status/status.json', 'status/guard.mjs'];

function isHarness(dir) {
  return MARKERS.every((marker) => existsSync(join(dir, marker)));
}

function validate(root) {
  for (const marker of MARKERS) {
    if (lstatSync(join(root, marker)).isSymbolicLink()) fail(`${marker} in ${root} links outside that folder.`);
  }
  let status;
  try { status = JSON.parse(readFileSync(join(root, 'status/status.json'), 'utf8')); }
  catch { fail(`${root} has an unreadable status/status.json.`); }
  if (!status || typeof status !== 'object' || Array.isArray(status)) fail(`${root} has an unreadable status/status.json.`);
  return root;
}

/** Every `--root` value on a command line, in order (an empty one included). */
export function rootFlags(argv) {
  const roots = [];
  argv.forEach((arg, i) => {
    if (arg === '--root') roots.push(argv[i + 1] ?? '');
    else if (arg.startsWith('--root=')) roots.push(arg.slice('--root='.length));
  });
  return roots;
}

/** The one harness root this invocation may use, or a HarnessRootError. */
export function resolveHarnessRoot({ roots = [], cwd = process.cwd() } = {}) {
  if (roots.some((root) => !root || root.startsWith('--'))) fail('--root needs a folder path.');
  const here = real(cwd);
  const named = [...new Set(roots.map((root) => real(resolve(here, root))))];
  if (named.length > 1) fail(`More than one --root was given (${named.join(', ')}).`);
  if (named.length === 1) {
    const [chosen] = named;
    if (!isHarness(chosen)) fail(`${chosen} is not an Orion folder.`);
    if (isHarness(here) && here !== chosen) fail(`This command runs in the Orion folder ${here} but names another, ${chosen}.`);
    return validate(chosen);
  }
  if (!isHarness(here)) fail(`${here} is not the root of an Orion folder.`);
  return validate(here);
}

/** Resolve `path` against the harness and refuse anything that lands outside it. */
export function insideHarness(root, path, label) {
  const target = resolve(root, path);
  let existing = target;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  const rel = relative(root, real(existing));
  if (rel === '..' || rel.startsWith(`..${'/'}`) || rel.startsWith('..\\') || isAbsolute(rel)) {
    fail(`${label} ${path} is outside the Orion folder ${root}.`);
  }
  return target;
}
