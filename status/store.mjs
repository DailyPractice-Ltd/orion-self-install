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
