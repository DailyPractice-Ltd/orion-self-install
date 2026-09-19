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
 * The thing check must never do: read "[library:install] x@1.0.0" to a person as
 * if a colleague had said it. The coach side mints that line (library-ship.mjs
 * and the admin Ship button in dailypractice-mono); the client turns it into
 * words and the exact command, against the server's own format byte for byte.
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
import { parseInstallDirective, LIBRARY_INSTALL_DIRECTIVE_PREFIX } from '../status/shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const statusDir = join(here, '..', 'status');

// Byte for byte what apps/enablement/scripts/library-ship.mjs mints with no --note.
const DIRECTIVE_BODY =
  '[library:install] meeting-sizing@1.0.0\n' +
  'New from the library: Meeting sizing. Your agent will ask before installing anything.';

// What GET /library/<slug> answers (LibraryAssetContentResponse in the mono).
const SKILL = {
  slug: 'meeting-sizing',
  kind: 'skill',
  name: 'Meeting sizing',
  one_liner: 'Size a meeting before you take it.',
  family: 'value_building',
  tools_required: [],
  version: '1.0.0',
  content_path: 'packages/harness/templates/library/meeting-sizing/skill.md',
  content_sha: 'not-checked-here',
  content: '---\nname: meeting-sizing\n---\n\nSize the meeting before you take it.\n',
};

test('parses the directive exactly as the server formats it', () => {
  assert.equal(LIBRARY_INSTALL_DIRECTIVE_PREFIX, '[library:install]');
  assert.deepEqual(parseInstallDirective(DIRECTIVE_BODY), { slug: 'meeting-sizing', version: '1.0.0' });
  assert.deepEqual(parseInstallDirective('[library:install] prospect-research@1.4.0'), {
    slug: 'prospect-research',
    version: '1.4.0',
  });
  assert.deepEqual(parseInstallDirective('  [library:install] meeting-sizing@1.0.0  \nprose'), {
    slug: 'meeting-sizing',
    version: '1.0.0',
  });
  for (const notAnOffer of [
    'Your follow-up agent has been quiet. Want a look?',
    '',
    null,
    undefined,
    42,
    '[library:install]',
    '[library:install] meeting-sizing',
    '[library:install] meeting-sizing@',
    '[library:install] Meeting-Sizing@1.0.0',
    '[library:install] bad slug@1.0.0',
    'install meeting-sizing@1.0.0',
    'Hello\n[library:install] meeting-sizing@1.0.0',
  ]) {
    assert.equal(parseInstallDirective(notAnOffer), null, `should be null: ${JSON.stringify(notAnOffer)}`);
  }
});

/**
 * Run the real radio in a scratch harness folder. Returns what it printed, the
 * status.json it left behind, every call the bridge received, and the skill
 * file it wrote, if any.
 */
function runRadio(args, { thread = { version: 1, messages: [] }, sharing = {}, skills = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-radio-'));
  try {
    mkdirSync(join(dir, 'status'));
    for (const f of ['radio.mjs', 'shapes.mjs']) copyFileSync(join(statusDir, f), join(dir, 'status', f));
    for (const [slug, content] of Object.entries(skills)) {
      mkdirSync(join(dir, '.claude', 'skills', slug), { recursive: true });
      writeFileSync(join(dir, '.claude', 'skills', slug, 'SKILL.md'), content);
    }
    writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
      template_version: '0.6.4',
      sharing: {
        status_signal_enabled: true,
        bridge_url: 'https://radio.test/api/bridge',
        harness_id: '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62',
        install_token: 'orion_testtesttesttesttesttest',
        ...sharing,
      },
    }));
    const log = join(dir, 'fetch.log');
    const mock = join(dir, 'fetch.mjs');
    writeFileSync(mock, `
      import { appendFileSync } from 'node:fs';
      const thread = ${JSON.stringify(thread)};
      const skill = ${JSON.stringify(SKILL)};
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
        if (path === '/api/bridge/library/' + skill.slug) return answer(200, skill);
        if (path.startsWith('/api/bridge/library/')) return answer(404, { error: 'Unknown asset' });
        if (path === '/api/bridge/assets') return answer(201, { asset_id: 'a1', reported_at: new Date().toISOString(), replay: false });
        if (path === '/api/bridge/contributions') return answer(201, { contribution_id: 'c1', replay: false });
        return answer(404, { error: 'no such door' });
      };
    `);
    const r = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(mock).href, join(dir, 'status', 'radio.mjs'), ...args],
      { encoding: 'utf8' },
    );
    const status = JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
    const calls = existsSync(log)
      ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const skillFile = join(dir, '.claude', 'skills', SKILL.slug, 'SKILL.md');
    const written = existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : null;
    return { code: r.status, out: r.stdout, err: r.stderr, status, calls, written };
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

test('check tells the client about an offer in words and prints the exact install command', () => {
  const at = now();
  const { code, out, err, status, calls } = runRadio(['check'], { thread: { version: 1, messages: [fromUs({ at })] } });
  assert.equal(code, 0, err);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /api/bridge/nudges?v=1']);
  assert.match(out, /From Oliver Carter, just now:/);
  assert.match(out, /Daily Practice is offering you a skill: meeting-sizing, version 1\.0\.0\./);
  assert.match(out, /New from the library: Meeting sizing\. Your agent will ask before installing anything\./);
  assert.match(out, /^  node status\/radio\.mjs library --install meeting-sizing$/m);
  assert.doesNotMatch(out, /\[library:install\]/, 'the machine line must never be read to a person');
  assert.match(out, /reply --nudge b1c2d3e4-0000-0000-0000-000000000000 --message "their words" --yes/);
  // The client's part comes first; everything about commands sits under the fence.
  const fence = out.indexOf('--- for the assistant');
  assert.ok(fence > 0);
  assert.ok(out.indexOf('library --install') > fence);
  assert.equal(status.sharing.radio_seen_through, at, 'the message read out is remembered');
  assert.equal(status.sharing.install_token, 'orion_testtesttesttesttesttest', 'the rest of the file survives');
});

test('a plain message is still read as written, with no install command', () => {
  const { code, out, err } = runRadio(['check'], {
    thread: { version: 1, messages: [fromUs({ key: 'k1', from_name: 'Daily Practice', body: 'Hi Kira, Oliver here.', state_at: null })] },
  });
  assert.equal(code, 0, err);
  assert.match(out, /^  Hi Kira, Oliver here\.$/m);
  assert.doesNotMatch(out, /library --install/);
});

test('a message already read out is not repeated', () => {
  const heard = '2026-09-17T12:00:00.000Z';
  const { code, out, err, status } = runRadio(['check'], {
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
  const { code, out, err, status } = runRadio(['check'], {
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

test('library --install shows the skill and writes nothing without --yes', () => {
  const { code, out, err, calls, written } = runRadio(['library', '--install', 'meeting-sizing']);
  assert.equal(code, 0, err);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /api/bridge/library/meeting-sizing']);
  assert.match(out, /Meeting sizing/);
  assert.match(out, /\.claude\/skills\/meeting-sizing\/SKILL\.md/);
  assert.match(out, /library --install meeting-sizing --yes/);
  assert.equal(written, null, 'nothing is written before the yes');
});

test('library --install --yes writes the skill and tells the shelf', () => {
  const { code, out, err, calls, written } = runRadio(['library', '--install', 'meeting-sizing', '--yes']);
  assert.equal(code, 0, err);
  assert.equal(written, SKILL.content);
  assert.match(out, /Written: \.claude\/skills\/meeting-sizing\/SKILL\.md/);
  const report = calls.find((c) => c.method === 'POST' && c.path === '/api/bridge/assets');
  assert.ok(report, 'the shelf is told');
  assert.equal(report.body.slug, 'meeting-sizing');
  assert.equal(report.body.kind, 'skill');
  assert.equal(report.body.version, '1.0.0');
  assert.equal(report.body.harness_id, '9e6d1cbf-9d5c-4213-8c3f-b8ad95d34f62');
});

test('contribute shows what would be sent and sends nothing without --yes', () => {
  const { code, out, err, calls } = runRadio(['contribute', '--slug', 'meeting-sizing'], {
    skills: { 'meeting-sizing': '# Mine\n\nThe way I size a meeting.\n' },
  });
  assert.equal(code, 0, err);
  assert.match(out, /You would offer "meeting-sizing"/);
  assert.match(out, /contribute --slug meeting-sizing --yes/);
  assert.deepEqual(calls, [], 'nothing leaves the machine before the yes');
});
