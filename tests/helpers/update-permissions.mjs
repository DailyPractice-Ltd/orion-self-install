// Child-process fault injection: model sandbox denials without relying on chmod/root.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.writeFileSync;
fs.writeFileSync = function(path, ...args) {
  const name = String(path).replaceAll('\\', '/');
  const protectedProbe = process.env.TEST_DENY_PREFLIGHT && /\/(\.agents|\.codex)\/.*\.orion-preflight-/.test(name);
  const lateSetup = process.env.TEST_DENY_SETUP && name.endsWith('/.codex/config.toml');
  // The catalog the activation writes in place; the update's own staged copy is in its backup.
  const activationCatalog = process.env.TEST_DENY_CATALOG && /\/(\.claude-plugin|\.agents\/plugins)\/marketplace\.json$/.test(name) && !name.includes('/.update-backup/');
  if (protectedProbe || lateSetup || activationCatalog) throw Object.assign(new Error(`EPERM: write ${name}`), { code: 'EPERM', path: name });
  return original.call(this, path, ...args);
};
syncBuiltinESMExports();
