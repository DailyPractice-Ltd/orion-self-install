/**
 * Cut a release from the CHANGELOG's Unreleased section (maintainers only; not
 * deployed to client harnesses):
 *
 *   node update/bump.mjs X.Y.Z
 *
 * Checks first, writing nothing until every check passes: X.Y.Z format, greater
 * than the current template_version, a CHANGELOG.md that opens with exactly
 * one "## Unreleased — <title>" section, and valid frozen compatibility
 * fingerprints in update/pristine.json. Then, in order: renames that heading to
 * "## X.Y.Z — <today> — <title>", sets template_version in update/manifest.json
 * and regenerates the plugin manifests. update/pristine.json is frozen data: the
 * bump validates it and never rewrites it, and needs no git history.
 * All or nothing: if any write fails, every file it may write is put back
 * byte for byte. It never commits, tags or pushes.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compatibilityErrors } from './destination-resolver.mjs';
import { MANIFEST_PATHS, writePluginManifests } from './plugin-package.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'update/manifest.json';
const CHANGELOG = 'CHANGELOG.md';
const UNRELEASED = /^## Unreleased — (.+)$/;

const read = (path) => readFileSync(join(root, path), 'utf8');
const versionParts = (version) => version.split('.').map(Number);

function isNewer(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function localDate(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

/** Every check, before any write. Returns what to write, or throws the refusal. */
function plan(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error(`${version === undefined ? 'No version given' : `"${version}" is not an X.Y.Z version`}. Usage: node update/bump.mjs X.Y.Z`);
  }
  const manifestText = read(MANIFEST);
  const { template_version: current, deployment } = JSON.parse(manifestText);
  if (!isNewer(version, current)) throw new Error(`${version} is not greater than the current template_version ${current}.`);
  const compatibility = compatibilityErrors(root, deployment);
  if (compatibility.length) throw new Error(compatibility.join('\n'));

  const lines = read(CHANGELOG).split('\n');
  const headings = lines.map((line, at) => ({ line: line.replace(/\r$/, ''), at })).filter(({ line }) => line.startsWith('## '));
  const unreleased = headings.filter(({ line }) => line.startsWith('## Unreleased'));
  if (unreleased.length > 1) {
    throw new Error(`${CHANGELOG} has ${unreleased.length} "## Unreleased" sections. Merge them into one "## Unreleased — <title>" section first.`);
  }
  const first = headings[0];
  const title = first && UNRELEASED.exec(first.line)?.[1].trim();
  if (!title) {
    throw new Error(`${CHANGELOG} must open with a "## Unreleased — <title>" section to release ${version}, found ${first ? `"${first.line}"` : 'no section'}.`);
  }
  const heading = `## ${version} — ${localDate()} — ${title}`;
  lines[first.at] = lines[first.at].endsWith('\r') ? `${heading}\r` : heading;

  const versionLine = /("template_version"\s*:\s*)"[^"]*"/;
  if (!versionLine.test(manifestText)) throw new Error(`${MANIFEST} has no template_version to bump.`);
  return { current, heading, changelog: lines.join('\n'), manifest: manifestText.replace(versionLine, `$1"${version}"`) };
}

const version = process.argv[2];
let next;
try {
  next = plan(version);
} catch (error) {
  console.error(`Bump refused; nothing was changed.\n${error.message}`);
  process.exit(2);
}

// Every file the bump may write, as it is now (null: absent), to put back on any failure.
const mayWrite = [CHANGELOG, MANIFEST, ...Object.values(MANIFEST_PATHS)];
const original = new Map(mayWrite.map(path => [path, existsSync(join(root, path)) ? readFileSync(join(root, path)) : null]));
let manifests;
try {
  writeFileSync(join(root, CHANGELOG), next.changelog);
  writeFileSync(join(root, MANIFEST), next.manifest);
  manifests = writePluginManifests(root);
} catch (error) {
  for (const [path, bytes] of original) {
    const now = existsSync(join(root, path)) ? readFileSync(join(root, path)) : null;
    if (bytes === null) rmSync(join(root, path), { force: true });
    // A file the failed step never changed (it may be the one that refused the write) is left alone.
    else if (now === null || !now.equals(bytes)) writeFileSync(join(root, path), bytes);
  }
  console.error(`Bump failed; nothing was changed.\n${error.message}`);
  process.exit(2);
}

console.log(`Bumped ${next.current} → ${version}:
  ${CHANGELOG}: ${next.heading}
  ${MANIFEST}: template_version ${version}
  ${manifests.join('\n  ')}: version ${version}
  update/pristine.json: frozen compatibility data, validated and unchanged

Next: review the diff (git diff), commit it, then tag v${version}. Nothing was committed, tagged or pushed.`);
