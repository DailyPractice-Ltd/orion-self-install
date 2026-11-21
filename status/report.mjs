/** Durable, labels-only operational reporting. All mutation shares the guard lock. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withStatusLock, pairingState } from './store.mjs';
import {
  radioOn,
  radioKey,
  keyHeader,
  HARNESS_ID_RE,
  isWorkTag,
} from './shapes.mjs';
const stages = [
  'booked',
  'day1_encode',
  'day2_wire_and_run',
  'validated',
  'seven_day_checkin',
  'formalised',
];
const statuses = [
  'draft',
  'configured',
  'connected',
  'validated',
  'installed',
  'running',
];
const types = [
  'install_checkpoint',
  'workflow_execution_completed',
  'outreach_approved',
  'outreach_rejected',
  'debrief_completed',
  'crm_updated',
  'routine_completed',
  'task_completed',
];
const kinds = ['agent', 'skill', 'workflow', 'program'];
const slug = (v) => typeof v === 'string' && /^[a-z][a-z0-9-]{1,59}$/.test(v);
const version = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,49}$/.test(v);
const instant = (v) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    return false;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  const c = new Date(0);
  c.setUTCFullYear(y, m - 1, d);
  return (
    c.getUTCFullYear() === y &&
    c.getUTCMonth() === m - 1 &&
    c.getUTCDate() === d &&
    Number(v.slice(11, 13)) < 24
  );
};
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function requireThat(ok) {
  if (!ok)
    throw Error(
      'Invalid radio outbox labels. Recover the original report; never add client words or credentials.',
    );
}
function keys(value, allowed) {
  requireThat(
    object(value) && Object.keys(value).every((k) => allowed.includes(k)),
  );
}
export function validateOutbox(entries) {
  requireThat(Array.isArray(entries));
  for (const entry of entries) {
    keys(entry, ['kind', 'body']);
    requireThat(['signal', 'asset'].includes(entry.kind));
    const b = entry.body;
    keys(
      b,
      entry.kind === 'signal'
        ? ['harness_id', 'signal_type', 'occurred_at', 'payload']
        : ['harness_id', 'slug', 'kind', 'version', 'installed_at', 'role'],
    );
    if (Object.hasOwn(b, 'harness_id'))
      requireThat(
        typeof b.harness_id === 'string' && HARNESS_ID_RE.test(b.harness_id),
      );
    // Replay-only compatibility for installed-package reports queued by older releases.
    if (entry.kind === 'asset') {
      requireThat(
        slug(b.slug) &&
          [...kinds, 'crm_template'].includes(b.kind) &&
          version(b.version) &&
          instant(b.installed_at),
      );
      if (Object.hasOwn(b, 'role')) requireThat(slug(b.role));
      continue;
    }
    requireThat(types.includes(b.signal_type) && instant(b.occurred_at));
    const p = b.payload;
    keys(p, [
      'ops_stage',
      'harness_status',
      'template_version',
      'tag',
      'count',
      'routine',
      'asset',
      'asset_kind',
      'asset_version',
      'outcome',
      'surface',
    ]);
    requireThat(
      Object.keys(p).length <= 20 &&
        Buffer.byteLength(JSON.stringify(p)) <= 2048,
    );
    for (const [k, v] of Object.entries(p)) {
      requireThat(
        k === 'ops_stage'
          ? stages.includes(v)
          : k === 'harness_status'
            ? statuses.includes(v)
            : ['template_version', 'asset_version'].includes(k)
              ? version(v)
              : k === 'tag'
                ? isWorkTag(v)
                : k === 'count'
                  ? Number.isSafeInteger(v) && v >= 0
                  : ['routine', 'asset'].includes(k)
                    ? slug(v)
                    : k === 'asset_kind'
                      ? kinds.includes(v)
                      : k === 'outcome'
                        ? ['run_completed', 'rep_logged', 'skipped'].includes(v)
                        : ['agent', 'routine'].includes(v),
      );
    }
    if (b.signal_type === 'task_completed')
      requireThat(
        isWorkTag(p.tag) && Number.isSafeInteger(p.count) && p.count >= 1,
      );
    if (b.signal_type === 'routine_completed')
      requireThat(slug(p.routine) && Number.isSafeInteger(p.count));
    if (
      ['asset', 'asset_kind', 'asset_version', 'outcome', 'surface'].some((k) =>
        Object.hasOwn(p, k),
      )
    )
      requireThat(
        slug(p.asset) &&
          ['run_completed', 'rep_logged', 'skipped'].includes(p.outcome) &&
          ['agent', 'routine'].includes(p.surface),
      );
  }
  return entries;
}
async function connection(root, status) {
  let keyFile = '';
  try {
    keyFile = await readFile(join(root, 'status/radio.key'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return {
    on: radioOn(status, { keyFile }),
    key: radioKey(status, { keyFile }),
  };
}
async function failure(store, status, outcome, time = Date.now()) {
  pairingState(status, time);
  status.sharing.pairing.last_check = outcome;
  if (outcome === 'invalid') status.sharing.pairing.last_connected_at = null;
  await store.writeStatus(status);
}
export async function replayOutboxLocked(
  store,
  { status, fetchImpl = globalThis.fetch, now = () => new Date() } = {},
) {
  let entries = validateOutbox(await store.readOutbox());
  if (!entries.length) return { status: 'sent', pending: 0 };
  const c = await connection(store.root, status);
  if (!c.on)
    return {
      status: 'off',
      pending: entries.length,
      reason:
        'Reports are saved locally. Pair and enable check-ins to deliver them.',
    };
  while (entries.length) {
    const entry = entries[0];
    const id = status.sharing.harness_id;
    if (entry.body.harness_id && entry.body.harness_id !== id) {
      await failure(store, status, 'invalid', new Date(now()).getTime());
      return {
        status: 'invalid',
        pending: entries.length,
        reason:
          'Pending reports belong to a different harness. Recover the original pairing before replay.',
      };
    }
    if (!entry.body.harness_id) {
      entry.body.harness_id = id;
      await store.writeOutbox(entries);
    }
    let response;
    try {
      response = await fetchImpl(
        `${status.sharing.bridge_url.replace(/\/+$/, '')}/${entry.kind === 'signal' ? 'signals' : 'assets'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...keyHeader(c.key) },
          body: JSON.stringify(entry.body),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch (error) {
      await failure(store, status, 'unreachable', new Date(now()).getTime());
      const networkCode = error?.cause?.code || error?.code;
      return {
        status: 'queued',
        pending: entries.length,
        result: 'unreachable',
        reason: ['ENOTFOUND', 'EAI_AGAIN'].includes(networkCode)
          ? `This assistant's sandbox is blocking the network, or this machine is offline (${networkCode}). Reports are saved for recovery; ask for network approval for this command and retry.`
          : 'The radio address did not answer. Reports are saved for recovery.',
      };
    }
    let ack;
    try {
      ack = await response.json();
    } catch {}
    const idKey = entry.kind === 'signal' ? 'signal_id' : 'asset_id',
      timeKey = entry.kind === 'signal' ? 'recorded_at' : 'reported_at';
    if (
      !object(ack) ||
      Object.keys(ack).some((k) => ![idKey, timeKey, 'replay'].includes(k)) ||
      typeof ack[idKey] !== 'string' ||
      !ack[idKey].trim() ||
      !instant(ack[timeKey]) ||
      !(
        (response.status === 201 && ack.replay === false) ||
        (response.status === 200 && ack.replay === true)
      )
    ) {
      await failure(
        store,
        status,
        [401,403].includes(response.status) ? 'invalid' : 'server_error',
        new Date(now()).getTime(),
      );
      return {
        status: 'queued',
        pending: entries.length,
        result: `refused ${response.status}`,
        reason:
          'The radio did not acknowledge the report. It remains saved for recovery.',
      };
    }
    entries = entries.slice(1);
    await store.writeOutbox(entries);
  }
  return { status: 'sent', pending: 0 };
}
const recovery = {
  status: 'invalid',
  pending: null,
  reason:
    'Orion could not safely save or read reports. Recover status/radio-outbox.json or the status lock before retrying.',
};
export async function replayOutbox({
  root,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    return await withStatusLock(root, async (store) =>
      replayOutboxLocked(store, {
        status: await store.readStatus(),
        fetchImpl,
      }),
    );
  } catch {
    return { ...recovery };
  }
}
async function report(root, make, fetchImpl) {
  try {
    return await withStatusLock(root, async (store) => {
      const status = await store.readStatus();
      const entries = validateOutbox(await store.readOutbox());
      const entry = make(status);
      validateOutbox([entry]);
      entries.push(entry);
      await store.writeOutbox(entries);
      return replayOutboxLocked(store, { status, fetchImpl });
    });
  } catch {
    return { ...recovery };
  }
}
export async function reportSignal({
  root,
  signalType,
  payload = {},
  occurredAt = new Date().toISOString(),
  fetchImpl = globalThis.fetch,
}) {
  return report(
    root,
    (status) => ({
      kind: 'signal',
      body: {
        ...(status.sharing?.harness_id
          ? { harness_id: status.sharing.harness_id }
          : {}),
        signal_type: signalType,
        occurred_at: occurredAt,
        payload: {
          ...Object.fromEntries(
            ['ops_stage', 'harness_status', 'template_version']
              .filter((k) => status[k] != null)
              .map((k) => [k, status[k]]),
          ),
          ...payload,
        },
      },
    }),
    fetchImpl,
  );
}
