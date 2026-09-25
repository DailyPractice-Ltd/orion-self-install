/**
 * The role bank's two load-bearing shapes, checked against the real files.
 *
 * report-install validates --role by parsing library/ROLES.md headings with
 * the regex in status/radio.mjs. If the heading format drifts (backticks
 * dropped, a rank prefix added), matchAll finds zero slugs and validation
 * silently degrades to shape-only — the exact regression the check exists to
 * prevent. These tests pin the format and the purpose tripwire.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The same expressions status/radio.mjs report-install uses, byte for byte.
const BANK_HEADING_RE = /^## `([a-z][a-z0-9-]{0,29})`/gm;
const ROLE_SHAPE_RE = /^[a-z][a-z0-9-]{0,29}$/;
const PURPOSE_TRIPWIRE_RE = /[\d@]/;

test('library/ROLES.md headings parse to the eight bank slugs', () => {
  const bank = readFileSync(join(root, 'library', 'ROLES.md'), 'utf8');
  const slugs = [...bank.matchAll(BANK_HEADING_RE)].map((m) => m[1]);
  assert.deepEqual(slugs, [
    'sdr', 'bdr', 'deals', 'pipeline-review',
    'reporting', 'content', 'research', 'head-of-sales',
  ]);
  for (const s of slugs) assert.match(s, ROLE_SHAPE_RE);
});

test('every agent PACKAGE.md report line carries a valid role and a clean purpose', () => {
  for (const pkg of ['prospecting', 'friday-report', 'call-planner', 'dream']) {
    const text = readFileSync(join(root, 'library', 'agents', pkg, 'PACKAGE.md'), 'utf8');
    const m = text.match(/report-install[^\n]*--role (\S+)[^\n]*--purpose "([^"]+)"/);
    assert.ok(m, `${pkg}: report-install line missing --role/--purpose`);
    const [, role, purpose] = m;
    assert.ok(role === 'custom' || ROLE_SHAPE_RE.test(role), `${pkg}: bad role ${role}`);
    assert.ok(purpose.length <= 140, `${pkg}: purpose over 140 chars`);
    assert.ok(!PURPOSE_TRIPWIRE_RE.test(purpose), `${pkg}: purpose carries a digit or handle`);
  }
});

test('the purpose tripwire catches numbers and handles', () => {
  assert.ok(PURPOSE_TRIPWIRE_RE.test('books 20 meetings a month'));
  assert.ok(PURPOSE_TRIPWIRE_RE.test('emails kira@astutetech.co.za'));
  assert.ok(!PURPOSE_TRIPWIRE_RE.test('warms CRM leads toward booked meetings'));
});
