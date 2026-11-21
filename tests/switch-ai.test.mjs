import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../switch_ai.mjs', import.meta.url).pathname;
const put = (root, path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); };
const get = (root, path) => readFileSync(join(root, path), 'utf8');
const has = (root, path) => existsSync(join(root, path));
const status = (root) => JSON.parse(get(root, 'status/status.json'));
const skills = (tool) => tool === 'codex' ? '.agents/skills' : '.claude/skills';
const other = (tool) => tool === 'codex' ? 'claude-code' : 'codex';

function folder(t, from) {
  const root = mkdtempSync(join(tmpdir(), 'orion-switch-ai-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, 'status/status.json', JSON.stringify({ template_version: '2.0.0', ai_assistant: from, notes: 'keep', machine_profile: { chosen_surface: from } }));
  put(root, `${skills(from)}/foo/SKILL.md`, 'release foo\n');
  put(root, `${skills(from)}/bar/SKILL.md`, 'my edited bar\n');
  put(root, `${skills(from)}/custom/SKILL.md`, 'my skill\n');
  put(root, `${skills(from)}/custom/references/notes.md`, 'my notes\n');
  put(root, `${skills(from)}/speckit-plan/SKILL.md`, 'maintainer only\n');
  put(root, 'status/shift-log.md', 'old log\n');
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });

for (const from of ['codex', 'claude-code']) test(`switch from ${from} moves every skill and records the new assistant`, (t) => {
  const root = folder(t, from), to = other(from);
  if (from === 'claude-code') put(root, '.claude/settings.json', '{}\n');
  const result = run(root, '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.from, from); assert.equal(report.to, to);
  assert.equal(status(root).ai_assistant, to);
  assert.equal(status(root).machine_profile.chosen_surface, to);
  assert.match(status(root).notes, /^keep\nswitched from/);
  assert.equal(get(root, `${skills(to)}/foo/SKILL.md`), 'release foo\n');
  assert.equal(get(root, `${skills(to)}/bar/SKILL.md`), 'my edited bar\n');
  assert.equal(get(root, `${skills(to)}/custom/references/notes.md`), 'my notes\n');
  assert.equal(has(root, `${skills(to)}/speckit-plan`), false);
  assert.equal(has(root, skills(from)), false);
  if (from === 'codex') assert.equal(has(root, '.agents'), false);
  else assert.equal(get(root, '.claude/settings.json'), '{}\n', 'other files in .claude stay');
  assert.equal(get(root, `${report.backup}/${skills(from)}/speckit-plan/SKILL.md`), 'maintainer only\n');
  assert.equal(get(root, `${report.backup}/${skills(from)}/bar/SKILL.md`), 'my edited bar\n');
  assert.equal(JSON.parse(get(root, `${report.backup}/status/status.json`)).ai_assistant, from);
  assert.equal(get(root, 'status/shift-log.md'), 'old log\n');
});

test('running it again switches back', (t) => {
  const root = folder(t, 'codex');
  const there = run(root); assert.equal(there.status, 0, there.stderr);
  assert.match(there.stdout, /from Codex to Claude Code/);
  const back = run(root); assert.equal(back.status, 0, back.stderr);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(get(root, '.agents/skills/bar/SKILL.md'), 'my edited bar\n');
  assert.equal(has(root, '.claude'), false);
});

test('--to names the assistant and refuses the current one', (t) => {
  const root = folder(t, 'codex');
  const same = run(root, '--to', 'codex');
  assert.equal(same.status, 2); assert.match(same.stderr, /already uses Codex/);
  assert.equal(run(root, '--to', 'copilot').status, 2);
  const ok = run(root, '--to', 'claude-code'); assert.equal(ok.status, 0, ok.stderr);
  assert.equal(status(root).ai_assistant, 'claude-code');
});

test('a collision changes nothing', (t) => {
  const root = folder(t, 'codex');
  put(root, '.claude/skills/foo/SKILL.md', 'already here\n');
  const blocked = run(root);
  assert.equal(blocked.status, 2); assert.match(blocked.stderr, /Nothing was changed[\s\S]*\.claude\/skills\/foo\/SKILL\.md/);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(get(root, '.agents/skills/foo/SKILL.md'), 'release foo\n');
  assert.equal(get(root, '.claude/skills/foo/SKILL.md'), 'already here\n');
  assert.equal(has(root, '.claude/skills/bar'), false);
  assert.equal(has(root, '.update-backup'), false);
});

test('a symlinked skill is refused before anything changes', (t) => {
  const root = folder(t, 'codex');
  symlinkSync(join(root, 'status/shift-log.md'), join(root, '.agents/skills/custom/link.md'));
  const blocked = run(root);
  assert.equal(blocked.status, 2); assert.match(blocked.stderr, /link or special file/);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(has(root, '.claude'), false);
});

test('a folder with no recorded assistant is read from its layout', (t) => {
  const root = folder(t, 'claude-code');
  const s = status(root); delete s.ai_assistant; put(root, 'status/status.json', JSON.stringify(s));
  const result = run(root); assert.equal(result.status, 0, result.stderr);
  assert.equal(status(root).ai_assistant, 'codex');
  assert.equal(get(root, '.agents/skills/custom/SKILL.md'), 'my skill\n');
});

test('with no --root it switches the folder it sits in', (t) => {
  const root = folder(t, 'codex');
  copyFileSync(script, join(root, 'switch_ai.mjs'));
  const result = spawnSync(process.execPath, [join(root, 'switch_ai.mjs')], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(status(root).ai_assistant, 'claude-code');
});

test('update/apply.mjs switch points to switch_ai.mjs', () => {
  const apply = new URL('../update/apply.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [apply, 'switch', '--root', tmpdir()], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.match(result.stderr, /node switch_ai\.mjs/);
});
