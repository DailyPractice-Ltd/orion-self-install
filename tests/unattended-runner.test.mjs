/**
 * unattendedRunner: the binary and flags an OS scheduler uses to wake a hired
 * agent for its shift. Claude Code and Codex can be started with nobody
 * watching. Every other surface cannot, and is never wired. The wake-up used
 * to be written as `claude -p` whatever the machine ran, so a Codex-only
 * machine was handed a task that could never start.
 *
 * The parts carry no quote characters on purpose: whoever writes the scheduler
 * entry quotes the prompt once, for its own shell. These tests hold that rule,
 * build the two entries library/HIRING.md documents, and check that HIRING.md
 * and the adapters still say what the code says.
 *
 *   node --test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unattendedRunner } from '../status/shapes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const hasQuote = (s) => /['"]/.test(s);

test('claude-code starts with claude -p', () => {
  const r = unattendedRunner('claude-code');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'claude');
  assert.deepEqual(r.flags, ['-p']);
});

test('codex starts with codex exec, outside a git repo, with the network allowed', () => {
  const r = unattendedRunner('codex');
  assert.equal(r.schedulable, true);
  assert.equal(r.bin, 'codex');
  assert.equal(r.flags[0], 'exec');
  assert.ok(r.flags.includes('--skip-git-repo-check'));
  // Without this a scheduled shift does its work and can never report it.
  assert.ok(r.flags.includes('sandbox_workspace_write.network_access=true'));
});

test('no part carries a quote, so the prompt can be quoted once per shell', () => {
  for (const surface of ['claude-code', 'codex']) {
    const r = unattendedRunner(surface);
    assert.equal(hasQuote(r.bin), false, `${surface}: the binary has a quote in it`);
    for (const flag of r.flags) assert.equal(hasQuote(flag), false, `${surface}: flag "${flag}" has a quote in it`);
  }
});

// The two entries HIRING.md documents, built from the parts. macOS wraps the
// whole command in single quotes. Windows puts it inside a double-quoted /TR
// value, so the prompt's own quotes have to be escaped.
const macos = (bin, flags, prompt) => `zsh -lc 'cd {folder} && ${bin} ${flags.join(' ')} "${prompt}"'`;
const windowsTr = (bin, flags, prompt) => `"cmd /c cd /d {folder} && ${bin} ${flags.join(' ')} \\"${prompt}\\""`;
const balanced = (s, ch) => (s.split(ch).length - 1) % 2 === 0;

test('the macOS and Windows entries keep their quotes balanced', () => {
  const prompt = 'run the shift and report';
  for (const surface of ['claude-code', 'codex']) {
    const r = unattendedRunner(surface);
    const mac = macos(r.bin, r.flags, prompt);
    assert.ok(balanced(mac, "'"), `${surface}: macOS single quotes do not balance`);
    assert.ok(balanced(mac, '"'), `${surface}: macOS double quotes do not balance`);
    // Inside /TR "...", the only quotes left unescaped are the outer pair. If
    // the escaping is dropped, the command is cut short at the prompt.
    const unescaped = (windowsTr(r.bin, r.flags, prompt).match(/(?<!\\)"/g) || []).length;
    assert.equal(unescaped, 2, `${surface}: Windows /TR has ${unescaped} unescaped quotes, expected the outer two`);
  }
});

test('a surface that cannot start on its own is never wired', () => {
  for (const surface of ['cursor', 'copilot-vscode', 'claude-desktop', 'chatgpt-app', 'website-chat', 'something-new', null, undefined]) {
    const r = unattendedRunner(surface);
    assert.equal(r.schedulable, false, `${surface} should not be schedulable`);
    assert.equal(r.bin, null);
    assert.equal(r.flags, null);
    assert.ok(typeof r.note === 'string' && r.note.length > 0);
  }
});

test('the shift prompt in HIRING.md has no quote characters, so it embeds in both entries', () => {
  const hiring = read('library/HIRING.md');
  const at = hiring.indexOf('`Open {absolute folder path} and run the {name} shift:');
  assert.ok(at !== -1, 'the shift prompt is missing from HIRING.md');
  const prompt = hiring.slice(at + 1, hiring.indexOf('`', at + 1));
  assert.ok(prompt.includes('report section with\n     --shift') || prompt.includes('report section with --shift'), 'the prompt no longer asks for the report with --shift');
  assert.equal(hasQuote(prompt), false, 'the shift prompt has a quote character in it');
});

test('HIRING.md and the adapters name the same command the code gives', () => {
  const hiring = read('library/HIRING.md');
  assert.ok(!/&& claude -p/.test(hiring), 'HIRING.md still writes claude into the scheduler entry');
  assert.ok(hiring.includes('{bin} {flags}'), 'HIRING.md no longer builds the entry from the runner');
  const codex = unattendedRunner('codex');
  const codexFlags = codex.flags.join(' ');
  assert.ok(hiring.includes(`| \`codex\` | \`codex\` | \`${codexFlags}\` |`), 'the Codex row in HIRING.md differs from unattendedRunner');
  assert.ok(read('agent/adapters/codex.md').includes(`${codex.bin} ${codexFlags} "{prompt}"`), 'agent/adapters/codex.md differs from unattendedRunner');
  const claude = unattendedRunner('claude-code');
  assert.ok(hiring.includes(`| \`claude-code\` | \`claude\` | \`${claude.flags.join(' ')}\` |`), 'the Claude Code row in HIRING.md differs from unattendedRunner');
  assert.ok(read('agent/adapters/claude-code.md').includes(`${claude.bin} ${claude.flags.join(' ')} "{prompt}"`), 'agent/adapters/claude-code.md differs from unattendedRunner');
});
