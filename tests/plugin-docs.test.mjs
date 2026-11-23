import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'update/manifest.json'), 'utf8'));
const deployedDocs = manifest.deployment.common_sources
  .map((entry) => (typeof entry === 'string' ? entry : entry.source))
  .filter((path) => path.endsWith('.md') && path !== 'CHANGELOG.md');

test('deployed docs link shipped skills inside the orion plugin package', () => {
  for (const doc of deployedDocs) {
    const text = readFileSync(join(root, doc), 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)\s#]*SKILL\.md)[^)]*\)/g)) {
      const path = relative(root, resolve(root, dirname(doc), target));
      assert.ok(path.startsWith('plugins/orion/skills/'), `${doc} links ${target}, outside plugins/orion/skills/`);
      assert.ok(existsSync(join(root, path)), `${doc} links ${target}, which does not exist`);
    }
  }
});

test('deployed docs place shipped skills in the orion plugin, not the client skill folders', () => {
  const stale = /(installed|shipped|built-in) skills (are|live) in `\.(claude|agents)\/skills|skills directory\s*\(`\.(agents|claude)\/skills/i;
  for (const doc of deployedDocs) {
    const text = readFileSync(join(root, doc), 'utf8').replace(/\s+/g, ' ');
    assert.ok(!stale.test(text), `${doc} says shipped skills live in a client skill folder`);
  }
});

test('the manual plugin validation checklist stays release-only', () => {
  assert.ok(existsSync(join(root, 'agent/plugin-validation.md')));
  assert.ok(!deployedDocs.includes('agent/plugin-validation.md'));
  assert.ok(manifest.deployment.release_only.includes('agent/plugin-validation.md'));
});
