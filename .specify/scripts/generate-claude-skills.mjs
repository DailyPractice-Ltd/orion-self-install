#!/usr/bin/env node
/** Generate optional Claude Code discovery copies for release maintainers. */
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'skills');
const destination = join(root, '.claude/skills');
mkdirSync(destination, { recursive: true });
const names = readdirSync(source).filter(name => name.startsWith('speckit-'));
for (const name of names) {
  rmSync(join(destination, name), { recursive: true, force: true });
  cpSync(join(source, name), join(destination, name), { recursive: true });
}
console.log(`Generated ${names.length} Claude Code maintainer skills from skills/.`);
