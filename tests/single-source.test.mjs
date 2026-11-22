/** Each operational rule has one home: duplicated prose drifts, so the release refuses it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every tracked Markdown file an agent or client may read: specs/ is human-only, .specify/ is maintainer governance, the changelog is history. */
function docs() {
  const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md', ':!:specs/**', ':!:.specify/**', ':!:CHANGELOG.md'], { cwd: repo, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  return listed.stdout.split('\n').filter(Boolean)
    .filter((path) => { try { readFileSync(join(repo, path)); return true; } catch { return false; } });
}
const squash = (text) => text.replace(/\s+/g, ' ');

for (const [rule, home, pattern] of [
  // Match the rule's working parts, not one sentence, so a reworded copy is caught too.
  ['the guard-run paragraph', 'docs/install.md', /admit the whole invocation with|guard\.mjs run --|run -- sh -c/i],
  ['the 48-hour connection allowance', 'docs/install.md', /\b48[- ]?(elapsed )?(hours?|hrs?|h\b)|forty[- ]eight hours/i],
]) {
  test(`${rule} lives only in ${home}`, () => {
    const found = docs().filter((path) => pattern.test(squash(readFileSync(join(repo, path), 'utf8'))));
    assert.deepEqual(found, [home], `${rule} must be stated once, in ${home}; link to it instead`);
  });
}
