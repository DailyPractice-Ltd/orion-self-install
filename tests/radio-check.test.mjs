/**
 * The radio, run for real.
 *
 * Every case below runs status/radio.mjs as a child process inside a scratch
 * folder laid out like a harness, against a fetch that answers from memory and
 * writes down every call it gets. So nothing leaves this machine, and no
 * status/status.json in this folder is touched.
 *
 *   node --test
 *
 * Legacy machine directives are hidden; support messages are still delivered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';

/**
 * A key that is well shaped and opens nothing. Built here, never written out
 * whole, so no file in this folder holds a line shaped like a key (the rule
 * status/home.mjs applies before it saves a folder anywhere).
 */
const FAKE_KEY = 'orion_' + 'test'.repeat(6);

const here = dirname(fileURLToPath(import.meta.url));
const statusDir = join(here, '..', 'status');

// A message retained on the bridge from before skill distribution was retired.
const DIRECTIVE_BODY =
  '[library:install] meeting-sizing@1.0.0\n' +
  'New from the library: Meeting sizing. Your agent will ask before installing anything.';

/**
 * Run the real radio in a scratch harness folder. Returns what it printed, the
 * status.json it left behind, and every call the bridge received.
 */
function checkRadio({ thread, sharing = {}, args = ['check'] }) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-radio-'));
  try {
    mkdirSync(join(dir, 'status'));
    for (const f of ['radio.mjs', 'shapes.mjs', 'report.mjs', 'store.mjs']) copyFileSync(join(statusDir, f), join(dir, 'status', f));
    mkdirSync(join(dir, 'update'));
    for (const f of ['manifest.json', 'destination-resolver.mjs']) copyFileSync(join(statusDir, '..', 'update', f), join(dir, 'update', f));
    writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
      template_version: '0.6.4',
      ai_assistant: 'claude-code',
      sharing: {
        status_signal_enabled: true,
        bridge_url: 'https://radio.test/api/bridge',
        harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
        install_token: FAKE_KEY,
        ...sharing,
      },
    }));
    const log = join(dir, 'fetch.log');
    const mock = join(dir, 'fetch.mjs');
    writeFileSync(mock, `
      import { appendFileSync } from 'node:fs';
      const thread = ${JSON.stringify(thread)};
      const answer = (status, body) => new Response(JSON.stringify(body), {
        status, headers: { 'content-type': 'application/json' },
      });
      globalThis.fetch = async (url, init = {}) => {
        const u = new URL(url);
        const path = u.pathname + u.search;
        appendFileSync(${JSON.stringify(log)}, JSON.stringify({
          method: init.method || 'GET', path, body: init.body ? JSON.parse(init.body) : null,
        }) + '\\n');
        if (path.startsWith('/api/bridge/nudges')) return answer(200, thread);
        return answer(404, { error: 'no such door' });
      };
    `);
    const r = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(mock).href, join(dir, 'status', 'radio.mjs'), ...args],
      { encoding: 'utf8', env: plainEnv() },
    );
    const status = JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
    const calls = existsSync(log)
      ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    return { code: r.status, out: r.stdout, err: r.stderr, status, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const now = () => new Date().toISOString();
const fromUs = (over) => ({
  key: 'b1c2d3e4-0000-0000-0000-000000000000',
  from: 'daily_practice',
  from_name: 'Oliver Carter',
  body: DIRECTIVE_BODY,
  at: now(),
  state: 'delivered',
  state_at: now(),
  answered: false,
  ...over,
});

test('check hides a legacy offer directive while retaining human prose and reply support', () => {
  const at = now();
  const { code, out, err, status, calls } = checkRadio({ thread: { version: 1, messages: [fromUs({ at })] } });
  assert.equal(code, 0, err);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /api/bridge/nudges?v=1']);
  assert.match(out, /From Oliver Carter, just now:/);
  assert.doesNotMatch(out, /offering you a skill|library --install/);
  assert.match(out, /New from the library: Meeting sizing\. Your agent will ask before installing anything\./);
  assert.doesNotMatch(out, /\[library:install\]/, 'the machine line must never be read to a person');
  assert.match(out, /reply --nudge b1c2d3e4-0000-0000-0000-000000000000 --message "their words" --yes/);
  // The client's part comes first; everything about commands sits under the fence.
  const fence = out.indexOf('--- for the assistant');
  assert.ok(fence > 0);
  assert.equal(status.sharing.radio_seen_through, at, 'the message read out is remembered');
  assert.equal(status.sharing.install_token, FAKE_KEY, 'the rest of the file survives');
});

test('a plain message is still read as written, with no install command', () => {
  const { code, out, err } = checkRadio({
    thread: { version: 1, messages: [fromUs({ key: 'k1', from_name: 'Daily Practice', body: 'Hi Kira, Oliver here.', state_at: null })] },
  });
  assert.equal(code, 0, err);
  assert.match(out, /^  Hi Kira, Oliver here\.$/m);
  assert.doesNotMatch(out, /library --install/);
});

test('a message already read out is not repeated', () => {
  const heard = '2026-09-17T12:00:00.000Z';
  const { code, out, err, status } = checkRadio({
    thread: { version: 1, messages: [fromUs({ key: 'k1', at: heard, state_at: '2026-09-17T12:30:00.000Z' })] },
    sharing: { radio_seen_through: heard },
  });
  assert.equal(code, 0, err);
  assert.match(out, /Radio quiet/);
  assert.doesNotMatch(out, /offering you a skill|library --install/);
  assert.equal(status.sharing.radio_seen_through, heard, 'a quiet check changes nothing');
});

test('with no mark yet, only what the server just delivered is read out', () => {
  // The first check on this version: an old message delivered last week, and one
  // the server marked delivered in this very request. The client hears the new one.
  const { code, out, err, status } = checkRadio({
    thread: {
      version: 1,
      messages: [
        fromUs({ key: 'old', body: 'Hi Kira, Oliver here.', at: '2026-09-10T09:00:00.000Z', state_at: '2026-09-10T09:05:00.000Z' }),
        fromUs({ key: 'new', body: 'One more thing.', at: '2026-09-17T15:00:00.000Z', state_at: now() }),
      ],
    },
  });
  assert.equal(code, 0, err);
  assert.match(out, /^  One more thing\.$/m);
  assert.doesNotMatch(out, /Hi Kira/);
  assert.equal(status.sharing.radio_seen_through, '2026-09-17T15:00:00.000Z');
});

for (const command of ['library', 'contribute', 'report-install']) {
  test(`retired command ${command} is rejected before any network call or state change`, () => {
    const { code, out, err, calls, status } = checkRadio({
      thread: {}, args: [command, '--install', 'example', '--slug', 'example', '--yes'],
    });
    assert.equal(code, 1, err);
    assert.deepEqual(calls, []);
    assert.match(out, /<check \| reply \| send \| signal>/);
    assert.doesNotMatch(out, /library|contribute|report-install/);
    assert.equal(status.sharing.radio_seen_through, undefined);
  });
}

test('legacy directive-only and malformed directive lines never produce install guidance', () => {
  const { code, out, err, status } = checkRadio({ thread: { messages: [
    fromUs({ body: '[library:install] bad slug@\n  [library:install]\nHello from Oliver.' }),
  ] } });
  assert.equal(code, 0, err);
  assert.match(out, /Hello from Oliver/);
  assert.doesNotMatch(out, /library|install|offering you a skill/);
  assert.ok(status.sharing.radio_seen_through);
});
