/** Check the standing CRM-write scope in the Orion agent definition and status template. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('the product no longer stages a CRM write for approval', () => {
  const def = read('agent/agent-definition.md');
  assert.doesNotMatch(def, /CRM Update[^\n]*STAGED FOR APPROVAL/);
  assert.doesNotMatch(def, /CRM change, and\s+external communication/);
  assert.match(def, /CRM WRITES NEED NO YES/);
  assert.doesNotMatch(def, /CRM update → `debrief_completed`/);
  assert.match(def, /never covered by\s+the scope/, 'the irreversible list stays, and is read back');
  assert.match(read('AGENTS.md'), /CRM writes need none/);
  assert.equal(JSON.parse(read('status/status.schema-template.json')).scopes.crm_write, true);
});
