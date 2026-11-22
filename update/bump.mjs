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
 * It never commits, tags or pushes.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePluginManifests } from './plugin-package.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'update/manifest.json';
const CHANGELOG = 'CHANGELOG.md';
const UNRELEASED = /^## Unreleased — (.+)$/;

const read = (path) => readFileSync(join(root, path), 'utf8');
const parts = (version) => version.split('.').map(Number);

function greater(a, b) {
  const [x, y] = [parts(a), parts(b)];
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
  if (!greater(version, current)) throw new Error(`${version} is not greater than the current template_version ${current}.`);

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

writeFileSync(join(root, CHANGELOG), next.changelog);
writeFileSync(join(root, MANIFEST), next.manifest);
const manifests = writePluginManifests(root);
const pristine = spawnSync(process.execPath, [join(root, 'tests/helpers/pristine.mjs'), '--write'], { cwd: root, encoding: 'utf8' });
if (pristine.status !== 0) {
  console.error(`Bumped ${CHANGELOG}, ${MANIFEST} and ${manifests.join(', ')}, but regenerating update/pristine.json failed:\n${pristine.stderr || pristine.stdout}`);
  process.exit(2);
}

console.log(`Bumped ${next.current} → ${version}:
  ${CHANGELOG}: ${next.heading}
  ${MANIFEST}: template_version ${version}
  ${manifests.join('\n  ')}: version ${version}
  update/pristine.json: regenerated

Next: review the diff (git diff), commit it, then tag v${version}. Nothing was committed, tagged or pushed.`);
