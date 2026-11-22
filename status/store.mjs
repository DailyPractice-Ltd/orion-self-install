/**
 * The one owner of status/status.json, status/radio.key and the radio outbox.
 *
 * Every Orion command that changes these files goes through here, so no two
 * commands can overwrite each other's changes: each change reads the file fresh
 * under the status lock, applies itself, and saves atomically. Nothing else in
 * the kit writes status.json or radio.key (tests/store-ownership.test.mjs holds
 * this).
 *
 *   changeStatus(root, mutate)   one change to status.json
 *   createStatus(root)           status.json from the template, when it has none
 *   statusTemplate(root)         the fresh record every reader starts from
 *   readStatus(root)             a read-only look, no lock
 *   withStatusLock(root, action) several steps that must not be interleaved:
 *                                status, outbox and key together
 *
 * The lock is a directory, status/.radio-lock, because creating one is atomic on
 * every supported system. It is named for the radio because the radio's outbox
 * was the first thing it guarded; it now guards all three files, and the name is
 * kept because the recovery steps in docs/install.md point at that path.
 *
 * Never acquire the lock recursively: a changeStatus or withStatusLock inside
 * another one, in this process or a child it waits on, blocks until it gives up.
 */
import { open, readFile, rename, unlink, mkdir, rmdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

/**
 * How long a command waits for the lock. The guard holds it through a network
 * check of up to 10 seconds plus up to 10 seconds per queued report, so this is
 * generous on purpose. ORION_STATUS_LOCK_WAIT_MS shortens it for tests.
 */
export const LOCK_WAIT_MS = Number(process.env.ORION_STATUS_LOCK_WAIT_MS) > 0 ? Number(process.env.ORION_STATUS_LOCK_WAIT_MS) : 60000;
export const LOCKED_MESSAGE = 'Status is locked. Finish the other Orion command; if it stopped, recover the status lock before retrying.';

/** Thrown when the lock stays busy past the wait; `code` is 'STATUS_LOCKED'. */
export class StatusLockedError extends Error {
  constructor() { super(LOCKED_MESSAGE); this.code = 'STATUS_LOCKED'; }
}

const statusPath = root => join(root, 'status', 'status.json');
const keyPath = root => join(root, 'status', 'radio.key');

/**
 * A fresh status record: the template, stamped with the release's one version
 * from update/manifest.json. Both files ship in every harness and every release,
 * so this resolves them from the root it is given. No other runtime code parses
 * the template (tests read it directly to check its shape).
 */
export function statusTemplate(root) {
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const { template_version } = read('update/manifest.json');
  return { ...read('status/status.schema-template.json'), template_version };
}

async function readJson(path, missing) {
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT' && missing !== undefined) return missing; throw error; }
  return JSON.parse(text);
}
async function atomicText(path, text) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(text);
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
const atomicJson = (path, value) => atomicText(path, `${JSON.stringify(value, null, 2)}\n`);

function checkStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid status file');
  return value;
}

/** status.json as it is now, without the lock: null when there is none, an error when it cannot be read. */
export async function readStatus(root) {
  const value = await readJson(statusPath(root), null);
  return value === null ? null : checkStatus(value);
}

export async function withStatusLock(root, action, { wait = LOCK_WAIT_MS } = {}) {
  const directory = join(root, 'status');
  const lock = join(directory, '.radio-lock');
  const started = Date.now();
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - started >= wait) throw new StatusLockedError();
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try {
    await atomicJson(join(lock, 'owner.json'), {pid:process.pid, host:hostname()});
    const store = {
      root,
      async readStatus() { return checkStatus(await readJson(statusPath(root))); },
      /** Saves atomically and stamps updated_at. */
      async writeStatus(value) {
        checkStatus(value).updated_at = new Date().toISOString();
        await atomicJson(statusPath(root), value);
      },
      /**
       * Saves exactly this text, unstamped. Only for a journaled update, rollback
       * or switch that must put back or predict the file's bytes; any other
       * change uses writeStatus.
       */
      async writeStatusText(text) {
        checkStatus(JSON.parse(String(text)));
        await atomicText(statusPath(root), String(text));
      },
      async readOutbox() {
        const value = await readJson(join(directory, 'radio-outbox.json'), []);
        if (!Array.isArray(value) || value.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['kind','body'].includes(key)) || !['signal','asset'].includes(entry.kind) || !entry.body || typeof entry.body !== 'object' || Array.isArray(entry.body))) throw new Error('Invalid radio outbox');
        return value;
      },
      async writeOutbox(value) {
        if (!Array.isArray(value)) throw new Error('Invalid radio outbox');
        await atomicJson(join(directory, 'radio-outbox.json'), value);
      },
      /** The text of status/radio.key, '' when there is none. Never print it. */
      async readKey() {
        try { return await readFile(keyPath(root), 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
      },
      /** Saves the key with owner-only access, and reads it back before returning. */
      async writeKey(token) {
        const value = String(token).trim();
        await atomicText(keyPath(root), `${value}\n`);
        if ((await this.readKey()).trim() !== value) throw new Error('the key file did not read back as written');
      },
      async removeKey() {
        await unlink(keyPath(root)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      },
    };
    return await action(store);
  } finally {
    await unlink(join(lock, 'owner.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(lock);
  }
}

/**
 * One change to status.json: read fresh under the lock, `mutate(status)` edits
 * it in place, and it is saved unless mutate throws or changed nothing. Returns
 * what mutate returns.
 */
export async function changeStatus(root, mutate, { wait } = {}) {
  return withStatusLock(root, async store => {
    const status = await store.readStatus();
    const before = JSON.stringify(status);
    const result = await mutate(status);
    if (JSON.stringify(status) !== before) await store.writeStatus(status);
    return result;
  }, { wait });
}

/** Creates status.json from the template when there is none. True when it did. */
export async function createStatus(root) {
  return withStatusLock(root, async store => {
    if (await readStatus(root) !== null) return false;
    await store.writeStatus(statusTemplate(root));
    return true;
  });
}

/** Version-2 state upgrade. Historical migration fields are inert. */
export const CONNECTION_ALLOWANCE_MS = 48 * 60 * 60 * 1000;
const defaults = () => ({version:2,state:'unpaired',verified_at:null,last_check:null,last_connected_at:null});
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year,month,day] = value.slice(0,10).split('-').map(Number);
  const calendar = new Date(0); calendar.setUTCFullYear(year,month-1,day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month-1 && calendar.getUTCDate() === day && Number(value.slice(11,13)) < 24;
}
export function pairingState(status, time) {
  const sharing = status.sharing ??= {};
  if (typeof sharing !== 'object' || Array.isArray(sharing)) throw new Error('Invalid sharing settings');
  if (!Object.hasOwn(sharing,'pairing')) sharing.pairing = defaults();
  const pairing = sharing.pairing;
  if (!pairing || typeof pairing !== 'object' || Array.isArray(pairing)) throw new Error('Invalid pairing state');
  if (![1,2].includes(pairing.version)) throw new Error('Unsupported pairing state');
  if (!['unpaired','exchanged','verified'].includes(pairing.state)) throw new Error('Invalid pairing state');
  if (![null,'accepted','invalid','unreachable','server_error'].includes(pairing.last_check)) throw new Error('Invalid verification state');
  if (pairing.verified_at !== null && (!instant(pairing.verified_at) || Date.parse(pairing.verified_at) > time)) throw new Error('Invalid verification timestamp');
  if (pairing.version === 1) { pairing.version = 2; pairing.last_connected_at = null; }
  if (pairing.last_connected_at !== null && (!instant(pairing.last_connected_at) || Date.parse(pairing.last_connected_at) > time)) throw new Error('Invalid connection timestamp');
  const deadlineAt = pairing.last_connected_at === null ? null : new Date(Date.parse(pairing.last_connected_at) + CONNECTION_ALLOWANCE_MS).toISOString();
  return {pairing,deadlineAt,allowance:pairing.state === 'verified' && pairing.last_check !== 'invalid' && deadlineAt !== null && time < Date.parse(deadlineAt)};
}
