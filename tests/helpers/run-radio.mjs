/**
 * The real radio.mjs, run in a scratch harness with fetch answering from memory.
 * Shared by the suites that send and receive skills.
 */
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync,
  readdirSync, lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { plainEnv } from './env.mjs';

const statusDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'status');

// A key that is well shaped and opens nothing. Built here, never written out
// whole, so no file in this folder holds a line shaped like a key.
const FAKE_KEY = 'orion_' + 'test'.repeat(6);

// A rich skill: the entry file, a reference, a template, and two things that
// must never travel — a script and a hidden file.
export function writeRichSkill(dir) {
  mkdirSync(join(dir, 'references'), { recursive: true });
  mkdirSync(join(dir, 'templates'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: meeting-confirmation\n---\n\nConfirm meetings the right way.\n');
  writeFileSync(join(dir, 'references', 'boundary.md'), '# Execution boundary\n');
  writeFileSync(join(dir, 'templates', 'confirm.json'), '{"subject":"Confirming {{date}}"}');
  writeFileSync(join(dir, 'check.mjs'), 'console.log("validator")');
  writeFileSync(join(dir, '.DS_Store'), 'junk');
}

/**
 * Run the real radio.mjs in a scratch harness with fetch answering from memory.
 * Returns what it printed, every bridge call, and the skill trees it left on
 * disk (captured before the scratch harness is removed). `status` adds fields to
 * the scratch status.json (a business name, say). `writeSkill` writes the
 * `skill` folder when the rich one is not what the test needs. `preload` is
 * module source run in the radio's process before it starts (a disk that fails,
 * say).
 */
export function runRadio(args, { reply, skill, writeSkill = writeRichSkill, status, preload = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-radio-'));
  try {
    mkdirSync(join(dir, 'status'));
    for (const f of ['radio.mjs', 'shapes.mjs']) copyFileSync(join(statusDir, f), join(dir, 'status', f));
    writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
      template_version: '1.2.1',
      ...(status || {}),
      sharing: {
        status_signal_enabled: true,
        bridge_url: 'https://radio.test/api/bridge',
        harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
        install_token: FAKE_KEY,
      },
    }));
    if (skill) writeSkill(join(dir, '.claude', 'skills', skill));
    const log = join(dir, 'fetch.log');
    const mock = join(dir, 'fetch.mjs');
    writeFileSync(mock, `
      import { appendFileSync } from 'node:fs';
      const reply = ${JSON.stringify(reply ?? { status: 201, body: { contribution_id: 'c1', replay: false } })};
      globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url);
        appendFileSync(${JSON.stringify(log)}, JSON.stringify({
          method: init.method || 'GET', path: u.pathname, body: init.body ? JSON.parse(init.body) : null,
        }) + '\\n');
        if (u.pathname === '/api/bridge/assets') return new Response('{"asset_id":"a1","replay":false}', { status: 201, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
      };
      ${preload}
    `);
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, join(dir, 'status', 'radio.mjs'), ...args], { encoding: 'utf8', env: plainEnv() });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const trees = {};
    const skillsRoot = join(dir, '.claude', 'skills');
    if (existsSync(skillsRoot)) {
      for (const slug of readdirSync(skillsRoot)) {
        const root = join(skillsRoot, slug);
        const files = {};
        const walk = (rel) => {
          for (const n of readdirSync(join(root, rel)).sort()) {
            const p = rel ? `${rel}/${n}` : n;
            if (lstatSync(join(root, p)).isDirectory()) walk(p);
            else files[p] = readFileSync(join(root, p), 'utf8');
          }
        };
        walk('');
        trees[slug] = files;
      }
    }
    return { code: r.status, out: r.stdout, err: r.stderr, calls, trees };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
