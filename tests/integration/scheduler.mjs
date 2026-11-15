/** Exercise the cleanup command against the actual OS scheduler in CI. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, isOn, plan, steps } from '../../status/schedule.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const folder = realpathSync(mkdtempSync(join(tmpdir(), 'orion-cleanup-')));
const os = process.platform;
const options = { home: homedir(), uid: process.getuid?.() ?? 0 };
const result = plan({
  os, folder, name: 'probe', surface: 'codex', at: '12:00', days: [],
  bin: process.execPath, nodeDir: dirname(process.execPath),
});
const record = result.record;
try {
  assert.deepEqual(result.problems, []);
  for (const file of result.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.text);
    if (file.executable) chmodSync(file.path, 0o755);
  }
  // Use a no-op executable even if the scheduler happens to fire at test time.
  writeFileSync(record.wake_up, os === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
  for (const path of ['status/schedule.mjs', 'status/shapes.mjs', 'update/destination-resolver.mjs']) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    copyFileSync(join(root, path), join(folder, path));
  }
  assert.equal(apply(steps('on', record, options)), null);
  assert.equal(isOn(record, options), true);
  const command = () => spawnSync(process.execPath, [
    join(folder, 'status/schedule.mjs'), 'off', '--agent', 'probe',
  ], { encoding: 'utf8', timeout: 60_000 });
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = command();
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(isOn(record, options), false);
  }
} finally {
  if (record && isOn(record, options)) apply(steps('off', record, options));
  rmSync(folder, { recursive: true, force: true });
}
