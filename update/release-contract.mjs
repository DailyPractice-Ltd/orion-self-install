/**
 * The release contract for one tool, run on the candidate release checkout:
 *
 *   node update/release-contract.mjs --tool <codex|claude-code> [--version X.Y.Z]
 *
 * It refuses a package carrying client credentials or business state, checks
 * the plugin manifests are fresh from the candidate's template_version (and
 * equal `--version` when given), validates the package, then simulates a
 * fresh deployment for the tool into a temporary folder: deployment plan plus
 * that tool's catalog under a synthetic catalog identity, validated against
 * the deployed package. Prints the deployment plan; exits 2 naming the tool on
 * any failure. Writes nothing in the release or in any client harness.
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT, TOOL_LAYOUT, planForTool, safePath } from './destination-resolver.mjs';
import { staleManifests, validateCatalog, validatePackage, writeCatalog } from './plugin-package.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Harness business state and credentials: never part of the distributable package.
const BUSINESS_STATE = [/^status\.json$/, /^status-.*\.json$/, /^radio\.key$/, /^\.env(\..*)?$/, /^work-log\.md$/,
  /^shift-log\.md$/, /^outbox(\..*)?$/, /^credentials(\..*)?$/, /\.(pem|key)$/];

function businessState(base) {
  const dir = join(base, PACKAGE_ROOT);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && BUSINESS_STATE.some(pattern => pattern.test(entry.name)))
    .map(entry => `${relative(base, join(entry.parentPath, entry.name)).split(sep).join('/')} looks like client credentials or business state; the package must not carry it`);
}

function arg(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

/** Deploy the plan into a scratch harness and validate what a fresh install would hold. */
function simulateDeployment(ai_assistant, entries, version) {
  const harness = mkdtempSync(join(tmpdir(), 'orion-release-deploy-'));
  try {
    for (const { source, destination } of entries) {
      const target = safePath(harness, destination);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(safePath(root, source), target);
    }
    const identity = randomUUID();
    const path = writeCatalog(harness, ai_assistant, identity);
    const catalog = JSON.parse(readFileSync(join(harness, path), 'utf8'));
    if (path !== TOOL_LAYOUT[ai_assistant].catalogPath) return [`catalog written at ${path}, expected ${TOOL_LAYOUT[ai_assistant].catalogPath}`];
    return [
      ...validatePackage(harness, { version, tool: ai_assistant }).map(error => `deployed ${error}`),
      ...validateCatalog(ai_assistant, catalog, { root: harness, identity }),
      ...businessState(harness).map(error => `deployed ${error}`),
    ];
  } finally {
    rmSync(harness, { recursive: true, force: true });
  }
}

function check(ai_assistant, requested) {
  const manifest = JSON.parse(readFileSync(join(root, 'update/manifest.json'), 'utf8'));
  const version = manifest.template_version;
  const errors = businessState(root);
  if (errors.length) return { entries: [], errors };
  const entries = planForTool(manifest.deployment, ai_assistant, { releaseRoot: root });
  if (requested !== undefined) {
    if (!/^\d+\.\d+\.\d+$/.test(requested)) errors.push(`--version ${requested} is not an X.Y.Z release version`);
    else if (requested !== version) errors.push(`release version ${requested} does not equal the candidate's template_version ${version}`);
  }
  errors.push(...staleManifests(root).map(path => `${path} is stale: regenerate it from template_version ${version} (node update/plugin-package.mjs --write)`));
  errors.push(...validatePackage(root, { version: requested ?? version }));
  if (!errors.length) errors.push(...simulateDeployment(ai_assistant, entries, requested ?? version));
  return { entries, errors };
}

const ai_assistant = arg('--tool');
try {
  const { entries, errors } = check(ai_assistant, arg('--version'));
  if (errors.length) throw new Error(errors.map(error => `  - ${error}`).join('\n'));
  console.log(JSON.stringify({ ai_assistant, entries }, null, 2));
} catch (error) {
  console.error(`Release contract failed for ${ai_assistant || '(no --tool)'}:\n${error.message.replace(/^(?!  - )/gm, '  ')}`);
  process.exitCode = 2;
}
