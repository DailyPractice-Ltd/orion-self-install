/**
 * unattendedRunner: the per-surface binary + flags a scheduler uses to wake a
 * hired agent's shift. Claude Code and Codex are schedulable unattended; every
 * other surface is parked. The shift used to hardcode `claude -p`, so Codex-only
 * machines never fired a scheduled shift.
 *
 * The parts are quote-free on purpose: the scheduler-writer quotes the prompt
 * once, per shell. These tests lock that invariant AND assemble the two recipes
 * HIRING.md documents, because the Windows `/TR "..."` quoting is exactly what
 * regressed once.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unattendedRunner } from '../status/shapes.mjs';

const hasQuote = (s) => /['"]/.test(s);

test('claude-code -> claude -p, as quote-free parts', () => {
  const r = unattendedRunner('claude-code');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'claude');
  assert.deepEqual(r.flags, ['-p']);
});

test('codex -> exec with sandbox network on and skip-git, as quote-free parts', () => {
  const r = unattendedRunner('codex');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'codex');
  assert.ok(r.flags.includes('exec'));
  assert.ok(r.flags.includes('--skip-git-repo-check'));
  assert.ok(r.flags.includes('sandbox_workspace_write.network_access=true'));
});

test('every part is quote-free, so the writer can quote once per shell', () => {
  for (const s of ['claude-code', 'codex']) {
    const r = unattendedRunner(s);
    assert.equal(hasQuote(r.bin), false, `${s} bin has a quote`);
    for (const f of r.flags) assert.equal(hasQuote(f), false, `${s} flag "${f}" has a quote`);
  }
});

// The two scheduler recipes in HIRING.md, assembled from the parts. The prompt is
// quoted once by the writer: single-quoted launchd wrapper vs escaped \" inside a
// double-quoted schtasks /TR. Both must stay quote-balanced.
const macos = (bin, flags, prompt) =>
  `zsh -lc 'cd {folder} && ${bin} ${flags.join(' ')} "${prompt}"'`;
// Just the /TR value — the double-quoted string that carries the nested-quote risk.
const windows = (bin, flags, prompt) =>
  `"cmd /c cd /d {folder} && ${bin} ${flags.join(' ')} \\"${prompt}\\""`;
const balanced = (s, ch) => (s.split(ch).length - 1) % 2 === 0;

test('assembled macOS and Windows commands stay quote-balanced', () => {
  const r = unattendedRunner('codex');
  const prompt = 'run the shift and report';
  const mac = macos(r.bin, r.flags, prompt);
  assert.ok(balanced(mac, "'"), 'macOS single quotes unbalanced');
  assert.ok(balanced(mac, '"'), 'macOS double quotes unbalanced');
  // Inside /TR "...", the only UNescaped double quotes must be the outer pair;
  // the prompt's quotes are escaped \". If the escaping is dropped (the old bug),
  // this count exceeds 2 and the test fails.
  const win = windows(r.bin, r.flags, prompt);
  const unescaped = (win.match(/(?<!\\)"/g) || []).length;
  assert.equal(unescaped, 2, `Windows /TR has ${unescaped} unescaped quotes, expected the outer 2`);
});

test('surfaces without a headless command are parked, not wired', () => {
  for (const s of ['cursor', 'copilot-vscode', 'claude-desktop', 'chatgpt-app', 'website-chat', 'anything', undefined]) {
    const r = unattendedRunner(s);
    assert.equal(r.schedulable, false, `${s} should not be schedulable`);
    assert.equal(r.flags, null);
    assert.ok(typeof r.note === 'string' && r.note.length > 0);
  }
});
