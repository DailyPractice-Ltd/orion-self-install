/** Reading a deployed harness's installed-file receipt: absent, trustworthy, or refused. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { NO_NATIVE } from './helpers/env.mjs';
import { readReceipt } from '../update/receipt.mjs';

const release = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a harness receipt reads back as installed, and a damaged one is refused rather than ignored', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'orion-receipt-read-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const target = join(base, 'client');
  const run = spawnSync(process.execPath, [join(release, 'install.mjs'), '--tool', 'codex', '--target', target, '--local-only'], { encoding: 'utf8', env: { ...process.env, ...NO_NATIVE } });
  assert.equal(run.status, 0, run.stderr);
  const path = join(target, 'status/installed-files.json');
  const installed = readFileSync(path, 'utf8');
  assert.deepEqual(readReceipt(target), JSON.parse(installed));

  const empty = join(base, 'legacy');
  mkdirSync(join(empty, 'status'), { recursive: true });
  assert.equal(readReceipt(empty), null, 'no receipt is a legacy harness, not an error');

  const damaged = {
    malformed: installed.slice(0, -10),
    unsupported: JSON.stringify({ ...JSON.parse(installed), version: 99 }),
    'bad hash': JSON.stringify({ ...JSON.parse(installed), files: { 'AGENTS.md': { key: 'AGENTS.md', hash: 'abc', origin: 'release' } } }),
    'escaping path': JSON.stringify({ ...JSON.parse(installed), files: { '../outside.md': { key: 'x', hash: 'a'.repeat(64), origin: 'release' } } }),
    'client record': JSON.stringify({ ...JSON.parse(installed), files: { 'status/status.json': { key: 'x', hash: 'a'.repeat(64), origin: 'release' } } }),
  };
  for (const [name, text] of Object.entries(damaged)) {
    writeFileSync(path, text);
    assert.throws(() => readReceipt(target), /installed-file receipt/, name);
  }
});
