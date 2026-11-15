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
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseInstallDirective, LIBRARY_INSTALL_DIRECTIVE_PREFIX } from '../status/shapes.mjs';
import { plainEnv } from './helpers/env.mjs';

/**
 * A key that is well shaped and opens nothing. Built here, never written out
 * whole, so no file in this folder holds a line shaped like a key (the rule
 * status/home.mjs applies before it saves a folder anywhere).
 */
const FAKE_KEY = 'orion_' + 'test'.repeat(6);

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
function runRadio(args, { thread = { version: 1, messages: [] }, sharing = {}, skills = {}, tool = 'claude-code', applied, notices = [], acknowledgmentFailure = 503 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'orion-radio-'));
  try {
    mkdirSync(join(dir, 'status'));
    for (const f of ['radio.mjs', 'shapes.mjs']) copyFileSync(join(statusDir, f), join(dir, 'status', f));
    mkdirSync(join(dir, 'update'));
    for (const f of ['manifest.json', 'destination-resolver.mjs']) copyFileSync(join(statusDir, '..', 'update', f), join(dir, 'update', f));
    for (const [slug, content] of Object.entries(skills)) {
      const skillRoot = tool === 'codex' ? '.agents' : '.claude';
      mkdirSync(join(dir, skillRoot, 'skills', slug), { recursive: true });
      writeFileSync(join(dir, skillRoot, 'skills', slug, 'SKILL.md'), content);
    }
    writeFileSync(join(dir, 'status', 'status.json'), JSON.stringify({
      template_version: applied?.manifest_version ?? '0.6.4',
      ...(applied ? { applied_release: applied } : {}),
      selected_tool: tool,
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
      import { appendFileSync, readFileSync } from 'node:fs';
      const thread = ${JSON.stringify(thread)};
      const skill = ${JSON.stringify(SKILL)};
      const notices = ${JSON.stringify(notices)};
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
        const calls = readFileSync(${JSON.stringify(log)}, 'utf8').split('\\n').filter(Boolean).map(JSON.parse);
        const polls = calls.filter((call) => call.path === '/api/bridge/releases').length;
        if (path === '/api/bridge/releases') return answer(200, { version: 1, notice: notices[polls - 1] ?? null });
        if (path.startsWith('/api/bridge/releases/') && path.endsWith('/display')) {
          if (calls.filter((call) => call.path.endsWith('/display')).length === 1) {
            return answer(${acknowledgmentFailure}, { error: 'Acknowledgment not accepted' });
          }
          return new Response(null, { status: 204 });
        }
        if (path === '/api/bridge/library/' + skill.slug) return answer(200, skill);
        if (path.startsWith('/api/bridge/library/')) return answer(404, { error: 'Unknown asset' });
        if (path === '/api/bridge/assets') return answer(201, { asset_id: 'a1', reported_at: new Date().toISOString(), replay: false });
        if (path === '/api/bridge/contributions') return answer(201, { contribution_id: 'c1', replay: false });
        return answer(404, { error: 'no such door' });
      };
    `);
    const checks = Array.from({ length: Math.max(notices.length, 1) }, () => spawnSync(
      process.execPath,
      ['--import', pathToFileURL(mock).href, join(dir, 'status', 'radio.mjs'), ...args],
      { encoding: 'utf8', env: plainEnv() },
    ));
    const [r] = checks;
    const receipts = existsSync(join(dir, 'status', 'release-notices'))
      ? readdirSync(join(dir, 'status', 'release-notices')).sort()
      : [];
    const status = JSON.parse(readFileSync(join(dir, 'status', 'status.json'), 'utf8'));
    const calls = existsSync(log)
      ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const skillFile = join(dir, tool === 'codex' ? '.agents' : '.claude', 'skills', SKILL.slug, 'SKILL.md');
    const written = existsSync(skillFile) ? readFileSync(skillFile, 'utf8') : null;
    return { code: r.status, out: r.stdout, err: r.stderr, status, calls, written, checks, receipts };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Codex library install writes to the selected skills directory', () => {
  const result = runRadio(['library', '--install', 'meeting-sizing', '--yes'], { tool: 'codex' });
  assert.equal(result.code, 0, result.out + result.err);
  assert.ok(result.written?.includes('Size the meeting'));
  assert.match(result.out, /\.agents\/skills\/meeting-sizing/);
});

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
  assert.equal(status.sharing.install_token, FAKE_KEY, 'the rest of the file survives');
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
  assert.match(out, /written to \.claude\/skills\/meeting-sizing\/ as 1 file:[\s\S]*SKILL\.md/);
  assert.match(out, /library --install meeting-sizing --yes/);
  assert.equal(written, null, 'nothing is written before the yes');
});

test('library --install --yes writes the skill and tells the shelf', () => {
  const { code, out, err, calls, written } = runRadio(['library', '--install', 'meeting-sizing', '--yes']);
  assert.equal(code, 0, err);
  assert.equal(written, SKILL.content);
  assert.match(out, /Written: 1 file to \.claude\/skills\/meeting-sizing\//);
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


const APPLIED = {
  tag: 'v2.0.0',
  commit: 'a'.repeat(40),
  release_id: 1001,
  manifest_version: '2.0.0',
  applied_at: '2026-11-12T14:00:00Z',
};
const NOTICE = {
  kind: 'release',
  version: '2.3.0',
  tag: 'v2.3.0',
  commit: 'c'.repeat(40),
  release_id: 1023,
  claim_id: '3d784eb4-4939-4d1d-9b64-494dcd764a71',
  claim_expires_at: '2099-01-01T00:00:00Z',
  summary: 'Your weekly report now includes finished work.',
  notes_url: 'https://github.com/DailyPractice-Ltd/orion-self-install/releases/tag/v2.3.0',
};

test('a release is shown once and acknowledged again when the first acknowledgment fails', () => {
  const { checks, calls, status, receipts } = runRadio(['check'], {
    applied: APPLIED,
    notices: [NOTICE, null, {
      ...NOTICE, tag: 'v2.4.0', version: '2.4.0', release_id: 1024,
      notes_url: NOTICE.notes_url.replace('v2.3.0', 'v2.4.0'),
    }],
  });
  for (const check of checks) assert.equal(check.status, 0, check.stderr);
  assert.match(checks[0].stdout, /Orion 2\.3\.0 is available/);
  assert.match(checks[0].stdout, /Your weekly report now includes finished work\./);
  assert.ok(checks[0].stdout.includes(NOTICE.notes_url));
  assert.match(checks[0].stdout, /Say 'update my harness' when you're ready\./);
  assert.doesNotMatch(checks[0].stdout, /1023|c{40}|reply --nudge|node update|Radio quiet/);
  assert.doesNotMatch(checks[1].stdout, /2\.3\.0 is available/);
  assert.match(checks[2].stdout, /Orion 2\.4\.0 is available/);
  assert.deepEqual(calls.filter((call) => call.path === '/api/bridge/releases').map((call) => call.body),
    Array(3).fill({ check_ins_enabled: true, selected_tool: 'claude-code', applied_release: APPLIED }));
  assert.deepEqual(calls.filter((call) => call.path.endsWith('/display')).map((call) => [call.path, call.body]), [
    ['/api/bridge/releases/1023/display', { kind: 'release', claim_id: NOTICE.claim_id }],
    ['/api/bridge/releases/1023/display', { kind: 'release', claim_id: NOTICE.claim_id }],
    ['/api/bridge/releases/1024/display', { kind: 'release', claim_id: NOTICE.claim_id }],
  ]);
  assert.equal(status.template_version, APPLIED.manifest_version);
  assert.deepEqual(status.applied_release, APPLIED);
  assert.equal(status.sharing.radio_seen_through, undefined);
  assert.deepEqual(receipts.map((name) => name.split('-').slice(-2).join('-')), ['release-1023', 'release-1024']);
});

test('a radio-off or unpaired harness never checks for a release', () => {
  for (const sharing of [{ status_signal_enabled: false }, { harness_id: null }]) {
    const { out, calls } = runRadio(['check'], { applied: APPLIED, notices: [NOTICE], sharing });
    assert.match(out, /Radio is off/);
    assert.deepEqual(calls, []);
  }
});


test('an acknowledgment survives a skipped offer on the next check', () => {
  const { checks, calls } = runRadio(['check'], { applied: APPLIED, notices: [NOTICE, null] });
  assert.match(checks[0].stdout, /Orion 2\.3\.0 is available/);
  assert.doesNotMatch(checks[1].stdout, /2\.3\.0 is available/);
  assert.equal(calls.filter((call) => call.path.endsWith('/1023/display')).length, 2);
});

test('an invalid notice does not get displayed or interfere with an ordinary message', () => {
  const { out, calls } = runRadio(['check'], {
    applied: APPLIED,
    notices: [{ ...NOTICE, notes_url: 'https://example.com/releases/v2.3.0' }],
    thread: { version: 1, messages: [fromUs({ body: 'Hi Kira, Oliver here.' })] },
  });
  assert.match(out, /Hi Kira, Oliver here\./);
  assert.doesNotMatch(out, /2\.3\.0 is available|example\.com/);
  assert.equal(calls.filter((call) => call.path.endsWith('/display')).length, 0);
});

test('a withdrawal explains whether the harness applied it without applying or restoring anything', () => {
  const { summary, ...identity } = NOTICE;
  const withdrawnApplied = {
    tag: NOTICE.tag, commit: NOTICE.commit, release_id: NOTICE.release_id,
    manifest_version: NOTICE.version, applied_at: APPLIED.applied_at,
  };
  for (const [application, applied, message, next] of [
    ['notified_only', APPLIED, /Your harness never applied this release/, /Skip this version/],
    ['previously_applied', APPLIED, /Your harness applied this release previously/, /Keep using your current version/],
    ['currently_applied', withdrawnApplied, /Your harness is running this release/, /restore a backup or move to a corrected release/],
  ]) {
    const notice = { ...identity, kind: 'withdrawal', application };
    const { checks, calls, status, receipts } = runRadio(['check'], { applied, notices: [notice, null, NOTICE] });
    assert.equal(checks[0].status, 0, checks[0].stderr);
    assert.match(checks[0].stdout, /Orion 2\.3\.0 was withdrawn/);
    assert.match(checks[0].stdout, message);
    assert.match(checks[0].stdout, next);
    assert.ok(checks[0].stdout.includes(NOTICE.notes_url));
    assert.doesNotMatch(checks[0].stdout, /Orion 2\.3\.0 is available|reply --nudge|node update|1023|c{40}/);
    assert.doesNotMatch(checks[1].stdout, /was withdrawn/);
    assert.doesNotMatch(checks[2].stdout, /Orion 2\.3\.0 is available/);
    assert.equal(status.template_version, applied.manifest_version);
    assert.deepEqual(status.applied_release, applied);
    assert.deepEqual(calls.filter((call) => call.path.endsWith('/display')).map((call) => call.body),
      [{ kind: 'withdrawal', claim_id: NOTICE.claim_id }, { kind: 'withdrawal', claim_id: NOTICE.claim_id }]);
    assert.deepEqual(receipts.map((name) => name.split('-').slice(-2).join('-')), ['withdrawal-1023']);
  }
});

test('an already displayed notice acknowledges a replacement lease without printing twice', () => {
  const newClaim = '045dc76b-c17d-4867-bedc-c1f3bf2d8ee7';
  const { checks, calls } = runRadio(['check'], {
    applied: APPLIED,
    notices: [NOTICE, { ...NOTICE, claim_id: newClaim }],
    acknowledgmentFailure: 409,
  });
  assert.match(checks[0].stdout, /Orion 2\.3\.0 is available/);
  assert.doesNotMatch(checks[1].stdout, /2\.3\.0 is available/);
  assert.deepEqual(calls.filter((call) => call.path.endsWith('/1023/display')).map((call) => call.body.claim_id),
    [NOTICE.claim_id, newClaim]);
});
