/** Probe destination access before replacing release files. Probes leave no files behind. */
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { safePath } from './destination-resolver.mjs';

export function preflightDestinations(root, paths) {
  const permissions = [];
  for (const path of new Set(paths)) {
    let probe;
    const created = [];
    try {
      const target = safePath(root, path), parent = dirname(target);
      let missing = parent;
      while (!existsSync(missing)) { created.push(missing); missing = dirname(missing); }
      mkdirSync(parent, { recursive: true });
      // access alone misses sandbox/ACL denials: exercise create, rename and removal.
      probe = mkdtempSync(join(parent, '.orion-preflight-'));
      writeFileSync(join(probe, 'write'), 'probe', { flag: 'wx' });
      renameSync(join(probe, 'write'), join(probe, 'renamed'));
      rmSync(probe, { recursive: true });
      probe = null;
      if (existsSync(target)) accessSync(target, constants.R_OK | constants.W_OK);
    } catch (error) {
      permissions.push({ path, code: error.code || 'ACCESS', message: error.message });
    } finally {
      if (probe) {
        try { rmSync(probe, { recursive: true, force: true }); }
        catch (error) { permissions.push({ path: relative(root, probe), code: error.code || 'ACCESS', message: 'Remove the preflight probe before retrying.' }); }
      }
      for (const dir of created) {
        try { rmdirSync(dir); }
        catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') permissions.push({ path: relative(root, dir), code: error.code || 'ACCESS', message: 'Cannot remove preflight directory.' }); }
      }
    }
  }
  return permissions;
}
