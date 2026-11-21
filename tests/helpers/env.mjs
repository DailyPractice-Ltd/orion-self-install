/**
 * The environment a test hands a script: this machine's own, minus anything
 * that would make the script believe it is on a cloud run or was handed a key.
 *
 * Why it exists: since 1.3.0 a script behaves differently on a cloud run (the
 * key may be attached outside the machine, and calls go through the machine's
 * proxy). The tests themselves may be run on a cloud machine, and there every
 * "no key means the radio is off" case would otherwise read as "on".
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLOUD_NAMES = ['CLAUDE_CODE_REMOTE', 'ORION_CLOUD', 'ORION_INSTALL_TOKEN', 'NODE_USE_ENV_PROXY'];

/**
 * The native plugin CLIs point at programs that do not exist, so a script under test
 * never registers anything with this machine's real `claude` or `codex`. A test that
 * wants a native CLI passes a fake one in `extra`.
 */
export const NO_NATIVE = Object.freeze({
  ORION_CLAUDE_BIN: join(tmpdir(), 'orion-no-native', 'claude'),
  ORION_CODEX_BIN: join(tmpdir(), 'orion-no-native', 'codex'),
  // Never this machine's own Codex settings or plugin cache.
  CODEX_HOME: join(tmpdir(), 'orion-no-native', 'codex-home'),
});

export function plainEnv(extra = {}) {
  const env = { ...process.env };
  for (const name of CLOUD_NAMES) delete env[name];
  return { ...env, ...NO_NATIVE, ...extra };
}
