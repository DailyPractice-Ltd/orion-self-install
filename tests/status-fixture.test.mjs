import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyStatusResources } from './helpers/status.mjs';

test('status fixtures copy code and schema without inheriting runtime state', t => {
  const base = mkdtempSync(join(tmpdir(), 'status-fixture-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const source = join(base, 'source');
  const root = join(base, 'fixture');
  mkdirSync(join(source, '.radio-lock'), { recursive: true });
  for (const name of ['guard.mjs', 'store.mjs', 'status.schema-template.json',
    'status.json', 'radio.key', 'radio-outbox.json', 'work-log.md',
    'waiting.md', 'status.json.partial.tmp', '.radio-lock/owner.json']) {
    writeFileSync(join(source, name), `synthetic ${name}`);
  }
  mkdirSync(join(root, 'status'), { recursive: true });
  writeFileSync(join(root, 'status/status.json'), 'fixture-owned state');
  copyStatusResources(root, source);
  assert.deepEqual(readdirSync(join(root, 'status')).sort(),
    ['guard.mjs', 'status.json', 'status.schema-template.json', 'store.mjs']);
  assert.equal(readFileSync(join(root, 'status/status.json'), 'utf8'), 'fixture-owned state');
  assert.equal(readFileSync(join(root, 'status/guard.mjs'), 'utf8'), 'synthetic guard.mjs');
  assert.equal(readFileSync(join(root, 'status/status.schema-template.json'), 'utf8'),
    'synthetic status.schema-template.json');
});
