/** Shared, cross-process status/outbox transaction. Never acquire this recursively. */
import { open, readFile, rename, unlink, mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

async function readJson(path, missing) {
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT' && missing !== undefined) return missing; throw error; }
  return JSON.parse(text);
}
async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync(); await file.close(); file = null;
    await rename(temporary, path);
    // Directory fsync is unavailable on some supported Windows filesystems.
    let directory;
    try { directory = await open(join(path, '..'), 'r'); await directory.sync(); }
    catch (error) { if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes(error.code) && !(process.platform === 'win32' && ['EPERM','EACCES'].includes(error.code))) throw error; }
    finally { await directory?.close(); }
  } finally {
    await file?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
export async function withStatusLock(root, action) {
  const directory = join(root, 'status');
  const lock = join(directory, '.radio-lock');
  const started = Date.now();
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - started >= 5000) throw new Error('Status is locked. Finish the other Orion command; if it stopped, recover the status lock before retrying.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    await atomicJson(join(lock, 'owner.json'), {pid:process.pid, host:hostname()});
    const store = {
      root,
      async readStatus() {
        const value = await readJson(join(directory, 'status.json'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid status file');
        return value;
      },
      async writeStatus(value) { await atomicJson(join(directory, 'status.json'), value); },
      async readOutbox() {
        const value = await readJson(join(directory, 'radio-outbox.json'), []);
        if (!Array.isArray(value) || value.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['kind','body'].includes(key)) || !['signal','asset'].includes(entry.kind) || !entry.body || typeof entry.body !== 'object' || Array.isArray(entry.body))) throw new Error('Invalid radio outbox');
        return value;
      },
      async writeOutbox(value) {
        if (!Array.isArray(value)) throw new Error('Invalid radio outbox');
        await atomicJson(join(directory, 'radio-outbox.json'), value);
      },
    };
    return await action(store);
  } finally {
    await unlink(join(lock, 'owner.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(lock);
  }
}

/** Shared migration policy: every first pairing marker preserves legacy eligibility. */
const MONTH = 30 * 24 * 60 * 60 * 1000;
const defaults = () => ({version:1,state:'unpaired',verified_at:null,last_check:null,migration_started_at:null,migration_deadline_at:null,migration_satisfied_at:null});
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year,month,day] = value.slice(0,10).split('-').map(Number);
  const calendar = new Date(0); calendar.setUTCFullYear(year,month-1,day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month-1 && calendar.getUTCDate() === day && Number(value.slice(11,13)) < 24;
}
export function pairingMigration(status, time) {
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
