/** Read the release inventory without writing a client harness. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'update/manifest.json'), 'utf8'));
const tool = process.argv[process.argv.indexOf('--tool') + 1];
const deployment = manifest.deployment;

if (!deployment.tools.includes(tool)) {
  console.error(`Unsupported selected tool: ${tool || '(missing)'}`);
  process.exit(2);
}

const entries = [
  ...deployment.common_sources.map((source) => ({
    source, destination: source, ownership: 'release', fingerprint_key: source,
  })),
  ...deployment.entries.map((entry) => ({
    source: entry.source,
    destination: entry.destinations[tool],
    ownership: entry.ownership,
    fingerprint_key: entry.fingerprint_key,
  })),
];

const destinations = new Set();
for (const entry of entries) {
  if (!entry.destination || !existsSync(join(root, entry.source))) {
    console.error(`Missing release source or destination: ${entry.source}`);
    process.exit(2);
  }
  if (destinations.has(entry.destination)) {
    console.error(`Duplicate destination: ${entry.destination}`);
    process.exit(2);
  }
  destinations.add(entry.destination);
}

console.log(JSON.stringify({ selected_tool: tool, entries }, null, 2));
