/** Point-in-time pre-work authorization; verification never consumes radio messages. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { withStatusLock } from './store.mjs';
import { radioKey, keyHeader, RADIO_URL_RE, HARNESS_ID_RE, wantsEnvProxy, envProxyEnv } from './shapes.mjs';
import { spawnSync } from 'node:child_process';
const MONTH = 30 * 24 * 60 * 60 * 1000;
const defaults = () => ({version:1,state:'unpaired',verified_at:null,last_check:null,migration_started_at:null,migration_deadline_at:null,migration_satisfied_at:null});
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year,month,day] = value.slice(0,10).split('-').map(Number);
  const calendar = new Date(0); calendar.setUTCFullYear(year,month-1,day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month-1 && calendar.getUTCDate() === day && Number(value.slice(11,13)) < 24;
}
function migration(status, time) {
  const sharing = status.sharing ??= {};
  if (typeof sharing !== 'object' || Array.isArray(sharing)) throw new Error('Invalid sharing settings');
  const unmarked = !Object.hasOwn(sharing, 'pairing');
  if (!unmarked && (!sharing.pairing || typeof sharing.pairing !== 'object' || Array.isArray(sharing.pairing))) throw new Error('Invalid pairing state');
  const pairing = sharing.pairing ??= defaults();
  if (pairing.state != null && !['unpaired','exchanged','verified'].includes(pairing.state)) throw new Error('Invalid pairing state');
  if (pairing.last_check != null && !['accepted','invalid','unreachable','server_error'].includes(pairing.last_check)) throw new Error('Invalid verification state');
  if (pairing.version !== 1) throw new Error('Unsupported pairing state');
  const existing = status.started_at != null || status.machine_profile != null || Object.values(status.checklist || {}).some(value => value === true) || (status.ops_stage && status.ops_stage !== 'booked');
  const start = pairing.migration_started_at, deadline = pairing.migration_deadline_at, satisfied = pairing.migration_satisfied_at;
  for (const value of [start,deadline,satisfied,pairing.verified_at]) if (value != null && !instant(value)) throw new Error('Invalid pairing timestamp');
  if (satisfied != null && Date.parse(satisfied) > time) throw new Error('Future pairing timestamp');
  if ((start != null) !== (deadline != null)) throw new Error('Incomplete migration timestamps');
  if (start != null && Date.parse(start) > time) throw new Error('Future migration timestamp');
  if (unmarked && existing && start == null && satisfied == null) {
    pairing.migration_started_at = new Date(time).toISOString();
    pairing.migration_deadline_at = new Date(time + MONTH).toISOString();
  }
  const deadlineAt = pairing.migration_started_at == null ? null : new Date(Math.min(Date.parse(pairing.migration_deadline_at), Date.parse(pairing.migration_started_at) + MONTH)).toISOString();
  return {pairing, deadlineAt, grace:satisfied == null && deadlineAt != null && time < Date.parse(deadlineAt)};
}
const reasons = {
  invalid:'Pairing needs attention. Get a fresh code at https://www.dailypractice.world/home/pair and run node start.mjs --code <code>.',
  unreachable:'Daily Practice could not be reached. Restore the connection and run node status/guard.mjs check again.',
  server_error:'Daily Practice could not verify this connection. Try node status/guard.mjs check again shortly; contact Daily Practice if it continues.',
  disabled:'Check-ins are paused. Run node start.mjs to enable pairing before starting work.',
  pending:'Finished-work reports are still waiting. Restore the connection and run node status/guard.mjs check to deliver them.',
};
export async function checkWork({root, now = () => new Date(), fetchImpl = globalThis.fetch, replay = true} = {}) {
  try {
    return await withStatusLock(root, async store => {
      const status = await store.readStatus();
      const time = new Date(now()).getTime();
      if (!Number.isFinite(time)) throw new Error('Invalid current time');
      const policy = migration(status, time);
      const {pairing,deadlineAt} = policy;
      // Migration must be durable before any network request or permission.
      await store.writeStatus(status);
      const sharing = status.sharing;
      const queued = await store.readOutbox();
      let reporting;
      if (queued.length) {
        reporting = await import('./report.mjs');
        reporting.validateOutbox(queued);
      }
      let keyFile = '';
      try { keyFile = await readFile(join(root,'status/radio.key'),'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const credential = radioKey(status, {keyFile});
      let outcome = 'invalid';
      if (RADIO_URL_RE.test(sharing.bridge_url || '') && HARNESS_ID_RE.test(sharing.harness_id || '') && credential.source) {
        try {
          const response = await fetchImpl(`${sharing.bridge_url.replace(/\/+$/,'')}/verify`, {method:'GET',headers:keyHeader(credential),signal:AbortSignal.timeout(10000)});
          if (response.status === 401) outcome = 'invalid';
          else if (response.status === 200) {
            let body; try { body = await response.json(); } catch {}
            outcome = body?.status === 'accepted' && typeof body.harness_id === 'string' ? (body.harness_id === sharing.harness_id ? 'accepted' : 'invalid') : 'server_error';
          } else outcome = 'server_error';
        } catch { outcome = 'unreachable'; }
      }
      pairing.last_check = outcome;
      if (outcome === 'accepted') {
        pairing.state = 'verified'; pairing.verified_at = new Date(time).toISOString();
        if (sharing.status_signal_enabled === true) pairing.migration_satisfied_at ??= new Date(time).toISOString();
      }
      await store.writeStatus(status);
      let pending = (await store.readOutbox()).length;
      if (outcome === 'accepted' && sharing.status_signal_enabled === true && pending && replay) {
        // Ticket 05 supplies this locked sibling; no second authorization or lock.
        await reporting.replayOutboxLocked(store, {status,fetchImpl});
        pending = (await store.readOutbox()).length;
      }
      const fresh = await store.readStatus();
      const grace = policy.grace && fresh.sharing.pairing.migration_satisfied_at == null;
      const allow = grace || (sharing.status_signal_enabled === true && outcome === 'accepted' && fresh.sharing.pairing.last_check === 'accepted' && pending === 0);
      const reason = grace ? `Pair Orion by ${deadlineAt} to keep working. Run node start.mjs for a pairing code.` : allow ? 'Pairing verified; work may begin.' : sharing.status_signal_enabled !== true ? reasons.disabled : outcome !== 'accepted' ? reasons[outcome] : reasons.pending;
      return {allow,reason,grace,deadlineAt};
    });
  } catch {
    return {allow:false,reason:'Orion could not safely save or read pairing state. Run node status/home.mjs check and recover the status files or lock before retrying.',grace:false,deadlineAt:null};
  }
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  if (wantsEnvProxy()) {
    const child = spawnSync(process.execPath,[...process.execArgv,...process.argv.slice(1)],{stdio:'inherit',env:envProxyEnv()}); process.exit(child.status ?? 2);
  }
  if (process.argv[2] !== 'check' || process.argv.slice(3).some(arg => arg !== '--quiet')) { console.error('Run: node status/guard.mjs check [--quiet]'); process.exitCode = 2; }
  else {
    const result = await checkWork({root:join(dirname(fileURLToPath(import.meta.url)),'..')});
    if (!result.allow || result.grace || !process.argv.includes('--quiet')) console.log(result.reason);
    process.exitCode = result.allow ? 0 : 2;
  }
}
