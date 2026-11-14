/** Read the release inventory without writing a client harness. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planForTool } from './destination-resolver.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'update/manifest.json'), 'utf8'));
const tool = process.argv[process.argv.indexOf('--tool') + 1];
try {
  const entries = planForTool(manifest.deployment, tool, { releaseRoot: root });
  const registry = manifest.deployment.fingerprints.registry;
  const pristine = JSON.parse(readFileSync(join(root, registry), 'utf8'));
  const required = new Set([
    ...entries.map(entry => entry.fingerprint_key),
    ...(manifest.remove || []),
    ...(manifest.deployment.retired || []).flatMap(entry => [entry.fingerprint_key || entry.source, ...Object.values(entry.sources || {})]),
    ...Object.values(manifest.deployment.fingerprints.legacy_aliases || {}),
  ]);
  for (const key of required) {
    if (key === registry) continue; // A registry cannot fingerprint itself.
    if (!Array.isArray(pristine.files?.[key]) || pristine.files[key].length === 0) {
      throw new Error(`Missing required historical fingerprint: ${key}`);
    }
  }
  console.log(JSON.stringify({ selected_tool: tool, entries }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
