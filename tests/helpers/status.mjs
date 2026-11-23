import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../status/', import.meta.url));

/** Copy release status resources, never the checkout's operational state. */
export function copyStatusResources(root, from = source) {
  const destination = join(root, 'status');
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name.endsWith('.mjs') || entry.name === 'status.schema-template.json')) {
      copyFileSync(join(from, entry.name), join(destination, entry.name));
    }
  }
}
