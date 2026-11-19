/** Point-in-time pre-work authorization; verification never consumes radio messages. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { withStatusLock, pairingState } from './store.mjs';
import { radioKey, keyHeader, RADIO_URL_RE, HARNESS_ID_RE, wantsEnvProxy, envProxyEnv } from './shapes.mjs';
import { createServer, createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
const reasons = {
  invalid:'Pairing needs attention. Get a fresh code at https://www.dailypractice.world/home/pair and run node start.mjs --code <code>.',
  unreachable:'Daily Practice could not be reached. Restore the connection and run node status/guard.mjs check again.',
  server_error:'Daily Practice could not verify this connection. Try node status/guard.mjs check again shortly; contact Daily Practice if it continues.',
  disabled:'Check-ins are paused. Run node start.mjs to enable pairing before starting work.',
  pending:'Finished-work reports are still waiting. Restore the connection and run node status/guard.mjs check to deliver them.',
};
// A live parent invocation admits its descendants only while its command runs.
// No status marker, reusable flag or deadline extension is written to disk.
async function admittedTask(root) {
  const address = process.env.ORION_TASK_SCOPE;
  if (!address) return null;
  try {
    const {port,secret} = JSON.parse(address);
    if (!Number.isInteger(port) || typeof secret !== 'string') return false;
    const scopeRoot = realpathSync(root);
    return await new Promise(resolveResult => {
      const socket = createConnection({host:'127.0.0.1',port});
      let answer = '';
      socket.setTimeout(1000, () => socket.destroy());
      socket.on('connect', () => socket.end(JSON.stringify({secret,root:scopeRoot})));
      socket.on('data', chunk => { answer += chunk; if (answer.length > 100) socket.destroy(); });
      socket.on('error', () => resolveResult(false));
      socket.on('close', () => resolveResult(answer === 'admitted'));
    });
  } catch { return false; }
}
export async function runWork({root,command,args = [],now,fetchImpl}) {
  const permission = await checkWork({root,now,fetchImpl,scope:false});
  if (!permission.allow) { console.log(permission.reason); return 2; }
  const secret = randomBytes(32).toString('hex');
  const server = createServer(socket => {
    let request = '';
    socket.setTimeout(1000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', chunk => { request += chunk; if (request.length > 8192) socket.destroy(); });
    socket.on('end', () => {
      try {
        const message = JSON.parse(request);
        socket.end(message.secret === secret && message.root === realpathSync(root) ? 'admitted' : 'denied');
      } catch { socket.end('denied'); }
    });
  });
  try {
    await new Promise((ok,fail) => { server.once('error',fail); server.listen(0,'127.0.0.1',ok); });
  } catch {
    console.log('Orion could not open this task scope. Allow local loopback connections for this command and retry.');
    return 2;
  }
  try {
    return await new Promise(resolveResult => {
      const child = spawn(command,args,{cwd:root,stdio:'inherit',env:{...process.env,ORION_TASK_SCOPE:JSON.stringify({port:server.address().port,secret})}});
      child.on('error', () => resolveResult(2));
      child.on('exit', code => resolveResult(code ?? 2));
    });
  } finally { await new Promise(ok => server.close(ok)); }
}
export async function checkWork({root, now = () => new Date(), fetchImpl = globalThis.fetch, replay = true, scope = true} = {}) {
  if (scope && replay) {
    const admitted = await admittedTask(root);
    if (admitted === false) return {allow:false,reason:'This task admission has ended. Run the guard for a new task.',allowance:false,deadlineAt:null};
    if (admitted) {
      try {
        return await withStatusLock(root, async store => {
          const status = await store.readStatus();
          const {pairing} = pairingState(status,new Date(now()).getTime());
          const entries = await store.readOutbox();
          if (entries.length) (await import('./report.mjs')).validateOutbox(entries);
          const wrongIdentity = entries.some(entry => entry.body.harness_id && entry.body.harness_id !== status.sharing.harness_id);
          if (wrongIdentity) { pairing.last_check = 'invalid'; pairing.last_connected_at = null; await store.writeStatus(status); }
          const allow = status.sharing.status_signal_enabled === true && pairing.state === 'verified' && pairing.last_check !== 'invalid';
          return {allow,reason:allow ? 'Task already admitted.' : reasons.invalid,allowance:false,deadlineAt:null};
        });
      } catch {
        return {allow:false,reason:'Orion could not safely read this task state. Recover the status files or lock before retrying.',allowance:false,deadlineAt:null};
      }
    }
  }
  try {
    return await withStatusLock(root, async store => {
      const status = await store.readStatus();
      const time = new Date(now()).getTime();
      if (!Number.isFinite(time)) throw new Error('Invalid current time');
      const policy = pairingState(status, time);
      const {pairing} = policy;
      // State upgrades must be durable before any network request or permission.
      await store.writeStatus(status);
      const sharing = status.sharing;
      const queued = await store.readOutbox();
      let reporting;
      if (queued.length) {
        reporting = await import('./report.mjs');
        reporting.validateOutbox(queued);
        if (queued.some(entry => entry.body.harness_id && entry.body.harness_id !== sharing.harness_id)) {
          pairing.last_check = 'invalid'; pairing.last_connected_at = null;
          await store.writeStatus(status);
          return {allow:false,reason:reasons.invalid,allowance:false,deadlineAt:null};
        }
      }
      let keyFile = '';
      try { keyFile = await readFile(join(root,'status/radio.key'),'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const credential = radioKey(status, {keyFile});
      let outcome = 'invalid';
      if (RADIO_URL_RE.test(sharing.bridge_url || '') && HARNESS_ID_RE.test(sharing.harness_id || '') && credential.source) {
        try {
          const response = await fetchImpl(`${sharing.bridge_url.replace(/\/+$/,'')}/verify`, {method:'GET',headers:keyHeader(credential),signal:AbortSignal.timeout(10000)});
          if ([401,403].includes(response.status)) outcome = 'invalid';
          else if (response.status === 200) {
            let body; try { body = await response.json(); } catch {}
            outcome = body?.status === 'accepted' && typeof body.harness_id === 'string' ? (body.harness_id === sharing.harness_id ? 'accepted' : 'invalid') : 'server_error';
          } else outcome = 'server_error';
        } catch { outcome = 'unreachable'; }
      }
      pairing.last_check = outcome;
      if (outcome === 'accepted') {
        pairing.state = 'verified'; pairing.verified_at = new Date(time).toISOString();
      } else if (outcome === 'invalid') {
        pairing.last_connected_at = null;
      }
      await store.writeStatus(status);
      let pending = (await store.readOutbox()).length;
      if (outcome === 'accepted' && sharing.status_signal_enabled === true && pending && replay) {
        // Ticket 05 supplies this locked sibling; no second authorization or lock.
        await reporting.replayOutboxLocked(store, {status,fetchImpl,now});
        pending = (await store.readOutbox()).length;
      }
      const fresh = await store.readStatus();
      const current = fresh.sharing.pairing;
      const complete = replay && sharing.status_signal_enabled === true && outcome === 'accepted' && current.last_check === 'accepted' && pending === 0;
      if (complete) {
        current.last_connected_at = new Date(now()).toISOString();
        await store.writeStatus(fresh);
      }
      const remaining = pairingState(fresh, new Date(now()).getTime());
      const allowance = replay && sharing.status_signal_enabled === true && !complete && remaining.allowance && ['unreachable','server_error'].includes(current.last_check);
      const allow = complete || allowance;
      const reason = allow ? 'Work may begin.' : sharing.status_signal_enabled !== true ? reasons.disabled : current.last_check !== 'accepted' ? reasons[current.last_check] : reasons.pending;
      return {allow,reason,allowance,deadlineAt:remaining.deadlineAt};
    });
  } catch {
    return {allow:false,reason:'Orion could not safely save or read pairing state. Run node status/home.mjs check and recover the status files or lock before retrying.',allowance:false,deadlineAt:null};
  }
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  if (wantsEnvProxy()) {
    const child = spawnSync(process.execPath,[...process.execArgv,...process.argv.slice(1)],{stdio:'inherit',env:envProxyEnv()}); process.exit(child.status ?? 2);
  }
  if (process.argv[2] === 'run' && process.argv[3] === '--' && process.argv[4]) {
    process.exitCode = await runWork({root:join(dirname(fileURLToPath(import.meta.url)),'..'),command:process.argv[4],args:process.argv.slice(5)});
  } else if (process.argv[2] !== 'check' || process.argv.slice(3).some(arg => arg !== '--quiet')) { console.error('Run: node status/guard.mjs check [--quiet] or run -- <command> [args]'); process.exitCode = 2; }
  else {
    const result = await checkWork({root:join(dirname(fileURLToPath(import.meta.url)),'..')});
    if (!result.allow || (!result.allowance && !process.argv.includes('--quiet'))) console.log(result.reason);
    process.exitCode = result.allow ? 0 : 2;
  }
}
