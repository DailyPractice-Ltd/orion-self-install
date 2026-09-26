/**
 * What the radio's settings have to look like — one definition, used by every
 * script that reads them (start.mjs, radio.mjs, emit-status.mjs).
 *
 * Why this file exists: on 2026-07-28 a first real client's agent drove the
 * wizard by piping answers, one question out of step, and a stray "y" landed in
 * the radio-address box. The old check only asked "is this box non-empty?" —
 * and "y" is non-empty — so the harness read as configured forever while every
 * check-in failed. A shape check was added to the wizard the same day, but the
 * radio itself still trusted mere presence. Now all three agree.
 *
 * Dependency-free: no imports at all. A sibling .mjs is not a dependency —
 * `import './shapes.mjs'` needs no package.json and no install, so the
 * zero-install promise in README.md is untouched.
 */

export const RADIO_URL_RE = /^https:\/\/[^\s]+$/i;
export const HARNESS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INSTALL_TOKEN_RE = /^orion_[A-Za-z0-9_-]{20,}$/;

/**
 * Pairing code: 12 consonants, no vowels (so it can never spell a word) and no
 * digits (so 0-vs-O and 1-vs-I cannot arise — neither half of either pair is in
 * the alphabet). Must match packages/harness/src/bridge in the mono exactly.
 */
export const PAIRING_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const PAIRING_CODE_LENGTH = 12;
export const PAIRING_CODE_RE = new RegExp(`^[${PAIRING_CODE_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

/** Where the radio lives. ORION_BRIDGE_URL overrides it for a local or staging test. */
export const DEFAULT_BRIDGE_URL = 'https://www.dailypractice.world/api/bridge';

export function bridgeBase(env = process.env) {
  return String(env.ORION_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/+$/, '');
}

/**
 * Strips the separators a human or a paste can introduce, and uppercases.
 * Deliberately does NOT strip characters outside the alphabet: dropping a stray
 * "O" would silently turn a mistype into a valid-length WRONG code. Leaving it
 * in produces an honest "that isn't a code" instead.
 */
export function normalizePairingCode(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\s\-\u2010-\u2015\u00A0]/g, '').toUpperCase();
}

export function isPairingCode(value) {
  return PAIRING_CODE_RE.test(normalizePairingCode(value));
}

/** Plain-words reason a code was rejected, or null when it's fine. */
export function pairingCodeProblem(input) {
  const code = normalizePairingCode(input);
  if (code.length === 0) return 'I didn\'t catch a code there.';
  if (code.length !== PAIRING_CODE_LENGTH) {
    return `A pairing code is ${PAIRING_CODE_LENGTH} letters — that one has ${code.length}.`;
  }
  if (!PAIRING_CODE_RE.test(code)) {
    return 'Pairing codes are all letters, with no vowels and no numbers — is there a 0 that should be an O, or a 1 that should be an L?';
  }
  return null;
}

/**
 * Shape, not mere presence. Anything that doesn't match counts as unconfigured,
 * which is what re-opens the pairing step on the next run instead of leaving a
 * poisoned value in place forever.
 */
export function radioConfigured(status) {
  const s = status?.sharing ?? {};
  return RADIO_URL_RE.test(s.bridge_url || '') &&
    HARNESS_ID_RE.test(s.harness_id || '') &&
    INSTALL_TOKEN_RE.test(s.install_token || '');
}

/** On means: the client said yes, AND the settings are actually usable. */
export function radioOn(status) {
  return status?.sharing?.status_signal_enabled === true && radioConfigured(status);
}

/**
 * The memory block (docs/memory.md is the contract). Shape, not mere presence,
 * for the same 2026-07-28 reason as the radio: a poisoned value must read as
 * unconfigured, not as configured-and-broken-forever.
 *
 * Backends: 'folder' (a plain local folder — the client may open it in Obsidian
 * and sync it with any tool of their own) and 'git' (a private repo the CLIENT
 * owns; agents pull and push silently). Daily Practice hosts none of it.
 */
export const MEMORY_BACKENDS = ['folder', 'git'];
// https, ssh, or an absolute local path (a repo on a shared drive counts).
export const MEMORY_GIT_REMOTE_RE = /^(https:\/\/|git@|\/)[^\s]+$/;

export function memoryBlock(status) {
  return status?.memory ?? {};
}

export function memoryConfigured(status) {
  const m = memoryBlock(status);
  if (m.enabled !== true) return false;
  if (!MEMORY_BACKENDS.includes(m.backend)) return false;
  if (typeof m.path !== 'string' || m.path.length === 0 || m.path.includes('..')) return false;
  if (m.backend === 'git' && !MEMORY_GIT_REMOTE_RE.test(m.remote || '')) return false;
  return true;
}

/**
 * Memory is deliberately independent of radioOn(): the shift-log asymmetry
 * extends here — the local memory write never skips because the radio is off.
 */
export function memoryOn(status) {
  return memoryConfigured(status);
}

/**
 * A skill on offer. Daily Practice ships a skill as a message whose first line is
 *   [library:install] <slug>@<version>
 * with plain words after a newline. It is minted coach-side (library-ship.mjs and
 * the admin Ship button in dailypractice-mono) and parsed here before the assistant
 * says a word to its human. This is a copy of parseInstallDirective in
 * packages/harness/src/bridge/index.ts and must match it exactly: the client
 * matches the server, never the reverse. Anything that is not a well-formed
 * directive is null, so a plain message can never be mistaken for an offer.
 */
export const LIBRARY_INSTALL_DIRECTIVE_PREFIX = '[library:install]';
const DIRECTIVE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseInstallDirective(body) {
  if (typeof body !== 'string' || body.length === 0) return null;
  const firstLine = (body.split('\n', 1)[0] ?? '').trim();
  if (!firstLine.startsWith(LIBRARY_INSTALL_DIRECTIVE_PREFIX + ' ')) return null;
  const spec = firstLine.slice(LIBRARY_INSTALL_DIRECTIVE_PREFIX.length + 1).trim();
  const at = spec.lastIndexOf('@');
  if (at <= 0) return null;
  const slug = spec.slice(0, at);
  const version = spec.slice(at + 1);
  if (!DIRECTIVE_SLUG_RE.test(slug)) return null;
  if (version.length === 0 || version.length > 50) return null;
  return { slug, version };
}

/**
 * How this surface wakes an agent for an unattended scheduled shift.
 *
 * A hired agent's shift has to be launched by a scheduler (launchd, schtasks, or
 * a native task) with nobody watching, headless, pointed at this folder — and it
 * must launch the SAME agent software the client runs. Claude Code and Codex are
 * the two surfaces with a proven non-interactive command; the rest can run a
 * shift only while a person has a session open, so they are not schedulable
 * unattended and HIRING.md parks them honestly rather than wiring a command that
 * will never fire.
 *
 * Returns the binary and its flags as SEPARATE, QUOTE-FREE parts — never a
 * ready-quoted command string. The scheduler-writer resolves `bin` to an absolute
 * path (`command -v <bin>`, since launchd and schtasks run with a bare PATH),
 * appends `flags`, and quotes the shift prompt exactly ONCE for the shell it is
 * writing for (single quotes inside a launchd wrapper, escaped `\"` inside a
 * schtasks `/TR "..."`). The working directory is set by the scheduler's
 * `cd {folder}`, so it is not a flag. Keeping every part quote-free is what stops
 * a per-OS quoting bug — a ready-made string with baked-in quotes cannot be
 * re-quoted safely for a second shell.
 */
export function unattendedRunner(chosenSurface) {
  switch (chosenSurface) {
    case 'claude-code':
      return { schedulable: true, bin: 'claude', flags: ['-p'] };
    case 'codex':
      // codex exec is the non-interactive form. --skip-git-repo-check lets it run
      // in a harness folder that was downloaded rather than git-cloned. The
      // workspace-write sandbox blocks the network by default, so a scheduled
      // run's radio call fails unless network_access is on — set it inline so the
      // task never depends on a separate ~/.codex/config.toml edit having been made.
      return {
        schedulable: true,
        bin: 'codex',
        flags: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true'],
      };
    default:
      // cursor, copilot-vscode, claude-desktop, chatgpt-app, website-chat, unknown.
      return {
        schedulable: false,
        bin: null,
        flags: null,
        note: 'No proven unattended command on this surface. The shift runs only while a session is open (HIRING.md Part D parks it), unless Claude Code or Codex is also installed here.',
      };
  }
}
