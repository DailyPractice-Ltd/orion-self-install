import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  reportSignal,
  replayOutbox,
  reportAsset,
  validateOutbox,
} from '../status/report.mjs';
const id = '11111111-1111-1111-1111-111111111111';
const time = '2026-11-18T12:00:00.000Z';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'outbox-'));
  await mkdir(join(root, 'status'));
  await writeFile(
    join(root, 'status/status.json'),
    JSON.stringify({
      ops_stage: 'formalised',
      harness_status: 'running',
      template_version: '2.0.0',
      sharing: {
        status_signal_enabled: true,
        bridge_url: 'https://example.com/api/bridge',
        harness_id: id,
        install_token: 'orion_' + 'test'.repeat(6),
        pairing: { version: 1, state:'verified', verified_at:null, last_check: 'accepted' },
      },
    }),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const task = (root) => ({
  root,
  signalType: 'task_completed',
  payload: { tag: 'research', count: 1 },
  occurredAt: time,
});
const outbox = async (root) =>
  JSON.parse(await readFile(join(root, 'status/radio-outbox.json'), 'utf8'));
test('lost ACK survives restart and replay keeps original identity without duplicate server count', async (t) => {
  const root = await fixture(t);
  const received = new Set();
  let lose = true;
  const fetchImpl = async (url, req) => {
    const body = JSON.parse(req.body);
    assert.equal((await outbox(root)).length, 1);
    received.add(JSON.stringify(body));
    if (lose) {
      lose = false;
      throw Error('lost ACK');
    }
    return {
      status: 200,
      json: async () => ({
        signal_id: 'signal-1',
        recorded_at: time,
        replay: true,
      }),
    };
  };
  assert.equal(
    (await reportSignal({ ...task(root), fetchImpl })).status,
    'queued',
  );
  assert.equal((await replayOutbox({ root, fetchImpl })).status, 'sent');
  assert.equal(received.size, 1);
  assert.deepEqual(await outbox(root), []);
  assert.equal((await replayOutbox({ root, fetchImpl })).status, 'sent');
});
test('privacy allowlist rejects words, arbitrary keys, malformed times and legacy routine prose before sending', async (t) => {
  const root = await fixture(t);
  let calls = 0;
  for (const payload of [
    { tag: 'research', count: 1, line: 'private client words' },
    { tag: 'research', count: 1, routine: 'my client followup' },
    { tag: 'research', count: 1, asset: 'call-planner' },
  ]) {
    assert.equal(
      (
        await reportSignal({
          ...task(root),
          payload,
          fetchImpl: async () => {
            calls++;
          },
        })
      ).status,
      'invalid',
    );
  }
  assert.equal(calls, 0);
  assert.throws(() =>
    validateOutbox([
      {
        kind: 'asset',
        body: {
          slug: 'call-planner',
          kind: 'skill',
          version: '1.0.0',
          installed_at: time,
          purpose: 'client words',
        },
      },
    ]),
  );
});
test('partial delivery removes only strict endpoint ACKs and keeps remaining original reports', async (t) => {
  const root = await fixture(t);
  const offline = async () => {
    throw Error('offline');
  };
  await reportSignal({ ...task(root), fetchImpl: offline });
  await reportAsset({
    root,
    asset: {
      slug: 'call-planner',
      kind: 'skill',
      version: '1.0.0',
      installed_at: time,
    },
    fetchImpl: offline,
  });
  let calls = 0;
  const malformed = async () => {
    calls++;
    return {
      status: 201,
      json: async () =>
        calls === 1
          ? { signal_id: 's', recorded_at: time, replay: false }
          : { signal_id: 'wrong-endpoint', recorded_at: time, replay: false },
    };
  };
  assert.equal((await replayOutbox({ root, fetchImpl: malformed })).pending, 1);
  assert.equal((await outbox(root))[0].kind, 'asset');
  assert.equal(
    (
      await replayOutbox({
        root,
        fetchImpl: async () => ({
          status: 200,
          json: async () => ({
            asset_id: 'a',
            reported_at: time,
            replay: false,
          }),
        }),
      })
    ).pending,
    1,
  );
  assert.equal(
    (
      await replayOutbox({
        root,
        fetchImpl: async () => ({
          status: 200,
          json: async () => ({
            asset_id: 'a',
            reported_at: time,
            replay: true,
          }),
        }),
      })
    ).status,
    'sent',
  );
});
test('concurrent reporters and replay serialize without dropping rows', async (t) => {
  const root = await fixture(t);
  const offline = async () => {
    throw Error('offline');
  };
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      reportSignal({
        ...task(root),
        occurredAt: `2026-11-18T12:00:0${i}.000Z`,
        fetchImpl: offline,
      }),
    ),
  );
  assert.equal((await outbox(root)).length, 8);
  const seen = new Set();
  const deliver = async (url, req) => {
    seen.add(JSON.parse(req.body).occurred_at);
    return {
      status: 201,
      json: async () => ({ signal_id: 's', recorded_at: time, replay: false }),
    };
  };
  await Promise.all([
    replayOutbox({ root, fetchImpl: deliver }),
    reportSignal({
      ...task(root),
      occurredAt: '2026-11-18T12:00:09.000Z',
      fetchImpl: deliver,
    }),
  ]);
  assert.equal(seen.size, 9);
  assert.deepEqual(await outbox(root), []);
});
test('disabled unpaired reporting freezes labels and time then attaches identity once; never reassigns account', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'status/status.json');
  const s = JSON.parse(await readFile(path, 'utf8'));
  s.sharing.harness_id = null;
  s.sharing.status_signal_enabled = false;
  await writeFile(path, JSON.stringify(s));
  assert.equal((await reportSignal({ ...task(root) })).status, 'off');
  assert.equal((await outbox(root))[0].body.harness_id, undefined);
  s.sharing.harness_id = id;
  s.sharing.status_signal_enabled = true;
  await writeFile(path, JSON.stringify(s));
  await replayOutbox({
    root,
    fetchImpl: async () => {
      throw Error('lost');
    },
  });
  assert.equal((await outbox(root))[0].body.harness_id, id);
  s.sharing.harness_id = '22222222-2222-2222-2222-222222222222';
  await writeFile(path, JSON.stringify(s));
  let calls = 0;
  assert.equal(
    (
      await replayOutbox({
        root,
        fetchImpl: async () => {
          calls++;
        },
      })
    ).status,
    'invalid',
  );
  assert.equal(calls, 0);
});
test('unwritable or corrupt queue prevents network transmission', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'status/radio-outbox.json'));
  let calls = 0;
  assert.equal(
    (
      await reportSignal({
        ...task(root),
        fetchImpl: async () => {
          calls++;
        },
      })
    ).status,
    'invalid',
  );
  assert.equal(calls, 0);
});

test('process interruption after send retains original report for safe replay', async (t) => {
  const root = await fixture(t);
  const { spawn } = await import('node:child_process');
  const reportUrl = new URL('../status/report.mjs', import.meta.url).href;
  const code = `import {reportSignal} from ${JSON.stringify(reportUrl)};await reportSignal({root:${JSON.stringify(root)},signalType:'task_completed',payload:{tag:'research',count:1},occurredAt:${JSON.stringify(time)},fetchImpl:async()=>{console.log('sent-without-ack');await new Promise(()=>{});}});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', (c) => reject(Error(`early exit ${c}`)));
  });
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('exit', resolve));
  const retained = await outbox(root);
  assert.equal(retained[0].body.occurred_at, time);
  // Death is established above: the documented explicit stale-lock recovery is safe.
  await rm(join(root, 'status/.radio-lock'), { recursive: true });
  const bodies = [];
  assert.equal(
    (
      await replayOutbox({
        root,
        fetchImpl: async (url, req) => {
          bodies.push(JSON.parse(req.body));
          return {
            status: 200,
            json: async () => ({
              signal_id: 'existing',
              recorded_at: time,
              replay: true,
            }),
          };
        },
      })
    ).status,
    'sent',
  );
  assert.deepEqual(bodies, [retained[0].body]);
});

test('failure after accepted pre-work check permits work within the same allowance', async (t) => {
  const root = await fixture(t);
  const { checkWork } = await import('../status/guard.mjs');
  const online = async (url) =>
    url.endsWith('/verify')
      ? {
          status: 200,
          json: async () => ({ status: 'accepted', harness_id: id }),
        }
      : {
          status: 201,
          json: async () => ({
            signal_id: 's',
            recorded_at: time,
            replay: false,
          }),
        };
  assert.equal((await checkWork({ root, fetchImpl: online })).allow, true);
  await reportSignal({
    ...task(root),
    fetchImpl: async () => {
      throw Error('offline');
    },
  });
  const refused = async (url) =>
    url.endsWith('/verify')
      ? online(url)
      : { status: 503, json: async () => ({}) };
  assert.equal((await checkWork({ root, fetchImpl: refused })).allow, true);
  assert.equal((await outbox(root)).length, 1);
  assert.equal((await checkWork({ root, fetchImpl: online })).allow, true);
  assert.deepEqual(await outbox(root), []);
});
