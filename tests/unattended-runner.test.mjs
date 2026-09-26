/**
 * unattendedRunner: the per-surface command a scheduler uses to wake a hired
 * agent's shift. Claude Code and Codex are schedulable unattended; every other
 * surface is parked (runs only while a session is open). The shift used to
 * hardcode `claude -p`, so Codex-only machines never fired a scheduled shift.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unattendedRunner } from '../status/shapes.mjs';

test('claude-code runs headless with claude -p', () => {
  const r = unattendedRunner('claude-code');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'claude');
  assert.match(r.cmd, /^claude -p "\{prompt\}"$/);
});

test('codex runs headless with codex exec and network access for the radio', () => {
  const r = unattendedRunner('codex');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'codex');
  assert.match(r.cmd, /^codex exec /);
  assert.match(r.cmd, /-C "\{folder\}"/);
  assert.match(r.cmd, /sandbox_workspace_write\.network_access=true/);
  assert.match(r.cmd, /"\{prompt\}"$/);
});

test('surfaces without a headless command are not schedulable and say why', () => {
  for (const s of ['cursor', 'copilot-vscode', 'claude-desktop', 'chatgpt-app', 'website-chat', 'anything', undefined]) {
    const r = unattendedRunner(s);
    assert.equal(r.schedulable, false, `${s} should not be schedulable`);
    assert.equal(r.cmd, null);
    assert.ok(typeof r.note === 'string' && r.note.length > 0);
  }
});
