/**
 * Give a scratch harness this release's update/manifest.json: the one place the
 * release version is declared, which status/store.mjs reads to stamp a fresh
 * status record.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function copyReleaseManifest(dir) {
  mkdirSync(join(dir, 'update'), { recursive: true });
  copyFileSync(join(repo, 'update', 'manifest.json'), join(dir, 'update', 'manifest.json'));
}
