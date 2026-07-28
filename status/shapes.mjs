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
