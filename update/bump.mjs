/**
 * Cut a release from the CHANGELOG's Unreleased section (maintainers only; not
 * deployed to client harnesses):
 *
 *   node update/bump.mjs X.Y.Z
 *
 * Checks first, writing nothing until every check passes: X.Y.Z format, greater
 * than the current template_version, and a CHANGELOG.md that opens with exactly
 * one "## Unreleased — <title>" section. Then, in order: renames that heading to
 * "## X.Y.Z — <today> — <title>", sets template_version in update/manifest.json,
 * regenerates the plugin manifests, and regenerates update/pristine.json.
 * All or nothing: if any write fails, every file it may write is put back
 * byte for byte. It never commits, tags or pushes.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_PATHS, writePluginManifests } from './plugin-package.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'update/manifest.json';
const CHANGELOG = 'CHANGELOG.md';
const PRISTINE = 'update/pristine.json';
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
  const current = JSON.parse(manifestText).template_version;
  if (!isNewer(version, current)) throw new Error(`${version} is not greater than the current template_version ${current}.`);

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
const mayWrite = [CHANGELOG, MANIFEST, ...Object.values(MANIFEST_PATHS), PRISTINE];
const original = new Map(mayWrite.map(path => [path, existsSync(join(root, path)) ? readFileSync(join(root, path)) : null]));
let manifests;
try {
  writeFileSync(join(root, CHANGELOG), next.changelog);
  writeFileSync(join(root, MANIFEST), next.manifest);
  manifests = writePluginManifests(root);
  const pristine = spawnSync(process.execPath, [join(root, 'tests/helpers/pristine.mjs'), '--write'], { cwd: root, encoding: 'utf8' });
  if (pristine.status !== 0) throw new Error(`Regenerating ${PRISTINE} failed:\n${pristine.stderr || pristine.stdout}`);
} catch (error) {
  for (const [path, bytes] of original) {
    if (bytes === null) rmSync(join(root, path), { force: true });
    else writeFileSync(join(root, path), bytes);
  }
  console.error(`Bump failed; nothing was changed.\n${error.message}`);
  process.exit(2);
}

console.log(`Bumped ${next.current} → ${version}:
  ${CHANGELOG}: ${next.heading}
  ${MANIFEST}: template_version ${version}
  ${manifests.join('\n  ')}: version ${version}
  update/pristine.json: regenerated

Next: review the diff (git diff), commit it, then tag v${version}. Nothing was committed, tagged or pushed.`);
