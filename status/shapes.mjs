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
 * Since 1.1.0 it also holds the two shapes a finished-work report is made of: the
 * tag menu (WORK_TAGS) and the label rule for what ran (isLabel). status/done.mjs
 * and status/radio.mjs both read them from here, so they cannot disagree either.
 *
 * Since 1.3.0 it also says where the radio key may be (radioKey), what a cloud
 * run is (isCloudRun), and whether the folder has a home (homeOn). Every script
 * asks here, so no two of them can answer those differently.
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
 * A cloud run: the work is happening on a machine that is handed a fresh copy
 * of this folder and thrown away afterwards. Claude Code's cloud sessions say so
 * themselves (CLAUDE_CODE_REMOTE). Any other cloud can say it with ORION_CLOUD=1.
 * Two things follow from it, and both read this one answer: the radio key may be
 * attached outside the machine (radioKey below), and work that cannot reach the
 * folder's home is parked on a branch instead of being lost (status/home.mjs).
 */
export function isCloudRun(env = process.env) {
  return env?.CLAUDE_CODE_REMOTE === 'true' || env?.ORION_CLOUD === '1';
}

/**
 * Whether this script has to be started again with Node's proxy support on.
 *
 * Found by running it, 8 Oct 2026. On a Claude Code cloud machine every outside
 * address is reached through a proxy the machine names in HTTPS_PROXY, and a
 * name like www.dailypractice.world does not even resolve on the machine
 * itself. Node's fetch ignores that variable unless NODE_USE_ENV_PROXY=1 was set
 * before Node started, so a plain call fails with ENOTFOUND while curl beside it
 * gets through. The radio key is attached by that same proxy, so the call has to
 * go that way. Node learned the variable in 22.21 and 24.0. Only a cloud run
 * does this: a person's own machine keeps reaching the radio as it always has.
 */
export function wantsEnvProxy(env = process.env, nodeVersion = process.versions.node) {
  if (!isCloudRun(env) || env?.NODE_USE_ENV_PROXY === '1') return false;
  if (!(env?.HTTPS_PROXY || env?.https_proxy)) return false;
  const [major, minor] = String(nodeVersion).split('.').map(Number);
  return major >= 24 || (major === 22 && minor >= 21);
}

/** The environment a script hands itself when it starts again with proxy support on. */
export function envProxyEnv(env = process.env) {
  return {
    ...env,
    NODE_USE_ENV_PROXY: '1',
    // Node calls that support experimental and says so on every call. Quiet that
    // one line: a shift's output is read by its agent.
    NODE_OPTIONS: `${env?.NODE_OPTIONS || ''} --disable-warning=UNDICI-EHPA`.trim(),
  };
}

/**
 * Where the radio key is. The key (the install token) is what proves which
 * harness is calling. Until 1.3.0 it had one place, sharing.install_token in
 * status/status.json, which is why that file could never be saved anywhere but
 * this machine. Now there are four places, and the first one that holds a
 * well-shaped key wins:
 *
 *   environment  ORION_INSTALL_TOKEN, set on the machine. For a cloud that hands
 *                secrets over as environment variables.
 *   key-file     status/radio.key: one line, git-ignored. Where status/home.mjs
 *                moves the key when the folder gets a home, so status.json can
 *                be saved there without it.
 *   status-file  sharing.install_token in status.json. Where pairing has always
 *                written it. Every harness already in the field keeps working.
 *   attached     Nowhere on this machine. A cloud run with no key of its own
 *                sends its calls without one, and the environment adds the key
 *                after the call has left the machine (on Claude Code, a network
 *                secret for the radio's address). The key never enters the run.
 *
 * `keyFile` is the text of status/radio.key, read by the caller (readRadioKeyFile
 * below), so this file stays free of imports. A value that is not shaped like a
 * key counts as absent, the same rule as everywhere else here.
 */
export const RADIO_KEY_ENV = 'ORION_INSTALL_TOKEN';
export const RADIO_KEY_FILE = 'radio.key';

export function radioKey(status, { env = process.env, keyFile = '' } = {}) {
  const candidates = [
    ['environment', env?.[RADIO_KEY_ENV]],
    ['key-file', keyFile],
    ['status-file', status?.sharing?.install_token],
  ];
  for (const [source, value] of candidates) {
    const token = typeof value === 'string' ? value.trim() : '';
    if (INSTALL_TOKEN_RE.test(token)) return { token, source };
  }
  return { token: null, source: isCloudRun(env) ? 'attached' : null };
}

/** The text of status/radio.key, or '' when there is none. `fs` is injected, as in packSkillFolder. */
export function readRadioKeyFile(statusDir, fs) {
  try {
    return fs.readFileSync(`${statusDir}/${RADIO_KEY_FILE}`, 'utf8');
  } catch {
    return '';
  }
}

/** The header that carries the key. None when the key is attached outside this machine. */
export function keyHeader(key) {
  return key?.token ? { Authorization: `Bearer ${key.token}` } : {};
}

/**
 * Shape, not mere presence. Anything that doesn't match counts as unconfigured,
 * which is what re-opens the pairing step on the next run instead of leaving a
 * poisoned value in place forever. `where` is what radioKey takes: pass the key
 * file's text, or a harness whose key has moved there reads as unconfigured.
 */
export function radioConfigured(status, where) {
  const s = status?.sharing ?? {};
  return RADIO_URL_RE.test(s.bridge_url || '') &&
    HARNESS_ID_RE.test(s.harness_id || '') &&
    radioKey(status, where).source !== null;
}

/** On means: the client said yes, AND the settings are actually usable. */
export function radioOn(status, where) {
  return status?.sharing?.status_signal_enabled === true && radioConfigured(status, where);
}

/**
 * The home block: whether this folder lives in a private repository its owner
 * controls, and on which branch (status/home.mjs is the script, and its header
 * is the contract). Off unless status/home.mjs prepare switched it on, so a
 * harness that never asked for a home never touches git.
 */
const HOME_DEFAULTS = Object.freeze({ enabled: false, branch: 'main' });
const HOME_BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

export function homeBlock(status) {
  return { ...HOME_DEFAULTS, ...(status?.home ?? {}) };
}

/** A branch name git will take, with nothing in it a shell or a ref could trip on. */
export function isHomeBranch(value) {
  return typeof value === 'string' && HOME_BRANCH_RE.test(value) &&
    !value.includes('..') && !value.includes('//') && !/[/.]$/.test(value) && !value.endsWith('.lock');
}

export function homeOn(status) {
  const h = homeBlock(status);
  return h.enabled === true && isHomeBranch(h.branch);
}

/**
 * The tag menu: the kind of work a finished task was, in one word.
 *
 * What it is for: every finished task reports one tag, so Daily Practice can see
 * that a harness was prospecting or working its deals without ever seeing the
 * task. The tag says what kind of work it was. The content stays on this machine.
 *
 * This is the one copy of the menu on the client side. status/done.mjs and
 * status/radio.mjs refuse any tag that is not on it, docs/radio.md lists the same
 * tags in the same words, and tests/finished-work.test.mjs fails if the two
 * drift. The server keeps a twin (WORK_TAGS in packages/harness/src/bridge in the
 * mono) so the console can group by tag. When nothing fits, the tag is `other`.
 */
export const WORK_TAGS = Object.freeze({
  prospecting: 'finding and researching who to talk to',
  outreach: 'messages, sequences, follow-up',
  content: 'collateral, posts, decks, webinars',
  crm: 'records and pipeline upkeep',
  calls: 'call prep, debriefs, meeting notes',
  deals: 'proposals, pricing, contracts',
  accounts: 'work on existing customers',
  hiring: 'recruitment and candidates',
  finance: 'invoices, numbers, bookkeeping',
  admin: 'inbox, calendar, files',
  onboarding: 'getting a person or client started',
  research: 'market, competitor or topic research',
  reporting: 'reviews, summaries, dashboards',
  ops: 'upkeep of the harness and the team itself',
  other: 'anything that fits nowhere above',
});

/** The shape the server accepts for a tag. Every tag on the menu fits it. */
export const WORK_TAG_RE = /^[a-z][a-z0-9-]{1,39}$/;

/** Own keys only, so "constructor" or "toString" can never pass as a tag. */
export function isWorkTag(value) {
  return typeof value === 'string' && Object.hasOwn(WORK_TAGS, value);
}

/** The menu as plain lines, for a script to print when a tag is missing or wrong. */
export function workTagMenu() {
  const width = Math.max(...Object.keys(WORK_TAGS).map((tag) => tag.length));
  return Object.entries(WORK_TAGS).map(([tag, meaning]) => `  ${tag.padEnd(width)}  ${meaning}`);
}

/**
 * What ran: a skill's slug, or a hired agent's roster name. These ride the radio
 * beside the tag, so they must be labels and never words: lowercase letters,
 * digits and hyphens. No spaces, no capitals and no punctuation, so a sentence or
 * an email address cannot travel in one.
 *
 * A roster name starts with a letter and is at most 30 characters. A skill
 * slug may start with a digit, like "5-whys", and is at most 100 characters.
 */
export const LABEL_MAX = Object.freeze({ skill: 100, agent: 30 });
const LABEL_RES = Object.freeze({
  skill: /^[a-z0-9]+(-[a-z0-9]+)*$/,
  agent: /^[a-z][a-z0-9-]*$/,
});
const LABEL_WORDS = Object.freeze({ skill: 'A slug', agent: 'A roster name' });
const LABEL_RULES = Object.freeze({
  skill: 'lowercase letters, digits and single hyphens (like "meeting-sizing")',
  agent: 'lowercase letters, digits and hyphens, starting with a letter (like "prospecting")',
});

export function isLabel(value, kind) {
  return typeof value === 'string' && Object.hasOwn(LABEL_MAX, kind) &&
    value.length <= LABEL_MAX[kind] && LABEL_RES[kind].test(value);
}

/** Plain-words reason a skill slug or roster name was rejected, or null when it's fine. */
export function labelProblem(value, kind) {
  if (isLabel(value, kind)) return null;
  const what = LABEL_WORDS[kind] || 'A label';
  const max = LABEL_MAX[kind];
  if (typeof value !== 'string' || value.length === 0) return `${what} is missing.`;
  if (max !== undefined && value.length > max) {
    return `${what} is at most ${max} characters. That one has ${value.length}.`;
  }
  return `${what} is ${LABEL_RULES[kind] || 'a short lowercase label'}. "${value}" is not.`;
}

/**
 * How many things were done. One rule, read by status/done.mjs and
 * status/radio.mjs both, so a count one accepts is never refused by the other.
 * Plain digits only: Number() exotica like 0x12 or 1e3 do not belong on a wire.
 * A finished task did at least one thing. Only a shift may report 0: it ran and
 * found nothing to do. Returns a plain-words problem, or null when it's fine.
 */
export function countProblem(text, { allowZero = false } = {}) {
  if (!/^\d{1,9}$/.test(String(text))) {
    return 'The count must be a whole number in plain digits (how many things were done).';
  }
  if (Number(text) < 1 && !allowZero) {
    return 'A count of 0 is only for a shift that ran and found nothing to do. A finished task did at least one thing.';
  }
  return null;
}

/**
 * The credential tripwire. Narrow on purpose: broad patterns would refuse honest
 * lines. status/done.mjs refuses a line that matches before it is written
 * anywhere, because the same line goes to the local logs that other agents read.
 */
const UNMISTAKABLE_KEY_RES = [
  /orion_[A-Za-z0-9_-]{20,}/,            // an install token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,  // a key file
  /\bsk-[A-Za-z0-9_-]{16,}/,             // API-key shapes
];

export const CREDENTIAL_RES = Object.freeze([
  ...UNMISTAKABLE_KEY_RES,
  /\b(password|passwd|api[_-]?key|client[_-]?secret)\s*[:=]\s*\S/i,
]);

export function looksLikeCredential(text) {
  return CREDENTIAL_RES.some((re) => re.test(String(text)));
}

/**
 * Shapes that are a key and nothing else. status/home.mjs holds a file back from
 * the folder's home when a line it is about to save matches one. This list is
 * wider than the three above because a whole business folder is going to a
 * repository, and it leaves out the loose "password: ..." rule on purpose: that
 * one catches honest sentences, and a save that runs with nobody there must not
 * drop a file over a sentence.
 */
export const KEY_SHAPE_RES = Object.freeze([
  ...UNMISTAKABLE_KEY_RES,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,        // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,      // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/,            // Google API keys
  /\bAKIA[0-9A-Z]{16}\b/,                // AWS access key ids
  /\b[rs]k_live_[A-Za-z0-9]{16,}/,       // Stripe live keys
  /\bpat-[a-z]{2}\d-[0-9a-f-]{30,}/,     // HubSpot private-app tokens
]);

export function looksLikeKey(text) {
  return KEY_SHAPE_RES.some((re) => re.test(String(text)));
}

/** One line means one short line: the shift-log contract's own limit. */
export const LINE_MAX = 120;

// ── Send Risk: one level, one matrix, one sentence (spec 007, K16) ──────────
//
// Every message to a person outside the folder is scored 0 to 100. The client
// sets one level for the harness; a message at or under it sends on its own,
// one above it waits for them. The matrix lives here and nowhere else in code;
// agent/risk-matrix.md is its plain-words twin and a test holds the two equal.

/** The levels, in the order a client can move through them. `off` is paused. */
export const SEND_LEVELS = Object.freeze(['off', 'low', 'medium', 'high']);

/**
 * The matrix, v1. One label per factor; the points are summed and floored at 0.
 * Content is the single highest label that applies, and an attachment counts as
 * money. History is read from the client's own verdicts in the send log over
 * the last HISTORY_DAYS. Nothing else is a factor: pacing is a hard stop.
 */
export const RISK_MATRIX = Object.freeze({
  relationship: Object.freeze({ reply: 0, 'follow-up': 15, known: 25, cold: 50 }),
  content: Object.freeze({ logistics: 0, information: 10, claim: 20, money: 25 }),
  channel: Object.freeze({ email: 0, calendar: 0, linkedin: 10, slack: 10, dm: 10, whatsapp: 20, sms: 20 }),
  history: Object.freeze({ rejected: 20, approved: -10 }),
  customer: -10,
});
export const HISTORY_DAYS = 30;

/** What each level sends up to. Above the highest, every message waits, whatever the level. */
export const SEND_THRESHOLDS = Object.freeze({ low: 20, medium: 45, high: 70 });
export const SEND_CEILING = 70;

/** The one sentence under every waiting message. Asserted word for word in rule 1. */
export const WAITING_SENTENCE = 'This message falls outside of your risk parameters, and you need to approve this manually.';

/** Each label in the words the client reads. The plain-words twin, agent/risk-matrix.md, uses the same. */
export const FACTOR_WORDS = Object.freeze({
  relationship: Object.freeze({ reply: 'a reply in a thread they answered', 'follow-up': 'a follow-up with no reply yet', known: 'first contact to a known lead', cold: 'cold, a stranger' }),
  content: Object.freeze({ logistics: 'logistics', information: 'standard information', claim: 'a results claim or a third party named', money: 'price, discount, commitment, signature, deadline or an attachment' }),
  channel: Object.freeze({ email: 'email', calendar: 'a calendar invite', linkedin: 'LinkedIn', slack: 'Slack', dm: 'a DM', whatsapp: 'WhatsApp', sms: 'SMS' }),
  history: Object.freeze({ rejected: 'this kind of message rejected in the last 30 days', approved: 'this kind of message approved in the last 30 days' }),
  customer: 'an existing customer',
});

/** What each level sends on its own, in one phrase, for the lines the client hears. */
export const LEVEL_SENDS = Object.freeze({
  low: 'replies and logistics',
  medium: 'replies, logistics, and first contact to known leads with standard information',
  high: 'replies, logistics, first contact to known leads, and cold logistics and cold information',
});

/** What still waits at each level, for the same lines. */
export const LEVEL_WAITS = Object.freeze({
  low: 'First contact, money and cold contact still wait for you.',
  medium: 'Money and cold contact still wait for you.',
  high: 'Cold contact with money, and anything scoring above 70, still wait for you.',
});

/** The short word for a content label, in "without the price". */
export const CONTENT_SHORT = Object.freeze({ information: 'the information', claim: 'the claim', money: 'the price' });

/**
 * An unknown label fails closed: an unknown relationship scores as cold, unknown
 * content as money, an unknown channel as WhatsApp. The caller says so.
 */
export const UNKNOWN_AS = Object.freeze({ relationship: 'cold', content: 'money', channel: 'whatsapp' });

export function riskLabel(kind, value) {
  const v = String(value ?? '').trim().toLowerCase();
  return Object.hasOwn(RISK_MATRIX[kind], v) ? v : UNKNOWN_AS[kind];
}

/** The score and its factors, in plain words, from labels already read with riskLabel. */
export function riskScore({ relationship, content, channel, customer = false, history = null }) {
  const factors = [
    [FACTOR_WORDS.relationship[relationship], RISK_MATRIX.relationship[relationship]],
    [FACTOR_WORDS.content[content], RISK_MATRIX.content[content]],
    [FACTOR_WORDS.channel[channel], RISK_MATRIX.channel[channel]],
  ];
  if (history && Object.hasOwn(RISK_MATRIX.history, history)) factors.push([FACTOR_WORDS.history[history], RISK_MATRIX.history[history]]);
  if (customer) factors.push([FACTOR_WORDS.customer, RISK_MATRIX.customer]);
  const score = Math.max(0, factors.reduce((sum, [, points]) => sum + points, 0));
  return { score, factors };
}

/** The lowest level that sends this score on its own, or null above the ceiling. */
export function lowestLevelFor(score) {
  for (const level of SEND_LEVELS) if (level !== 'off' && score <= SEND_THRESHOLDS[level]) return level;
  return null;
}

/** Whether a level sends a score on its own. `off`, `never` and anything unknown send nothing. */
export function levelSends(level, score) {
  return Object.hasOwn(SEND_THRESHOLDS, level) && score <= SEND_THRESHOLDS[level] && score <= SEND_CEILING;
}
