/** Read the release inventory without writing a client harness. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planForTool } from './destination-resolver.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'update/manifest.json'), 'utf8'));
const tool = process.argv[process.argv.indexOf('--tool') + 1];
try {
  console.log(JSON.stringify({ selected_tool: tool, entries: planForTool(manifest.deployment, tool, { releaseRoot: root }) }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
