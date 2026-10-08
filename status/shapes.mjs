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

/**
 * A status.json with NO memory block gets the defaults: memory on, plain local
 * folder. Updates never touch status.json, so a harness that reached the
 * notebook by UPDATE rather than fresh install would otherwise sit silently
 * memory-off forever — found live on a real harness, 5 Oct 2026. The folder
 * backend writes only inside this folder, so defaulting on shares nothing.
 * An explicit `enabled: false` is still respected absolutely.
 */
const MEMORY_DEFAULTS = Object.freeze({ enabled: true, backend: 'folder', remote: '', path: 'memory' });

export function memoryBlock(status) {
  return { ...MEMORY_DEFAULTS, ...(status?.memory ?? {}) };
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
 * The two kinds follow the rules that already name them. A roster name is the
 * naming rule in library/HIRING.md: it starts with a letter and is at most 30
 * characters. A skill slug is the library's own slug rule (the same one the radio
 * uses when it installs a skill): it may start with a digit, like "5-whys", and is
 * at most 100 characters. A skill the radio can install must be a skill a report
 * can name.
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
 * lines. status/memory.mjs refuses a note that matches, and status/done.mjs
 * refuses a line that matches before it is written anywhere, because the same
 * line goes to the local logs that other agents read.
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
 * How this machine's agent software is started with nobody watching, so the
 * computer's own scheduler can wake a hired agent for its shift.
 *
 * The wake-up has to start the SAME agent software the client runs. It used to
 * be written as `claude -p` whatever the machine had, so on a Codex machine
 * the task could never start and no shift ever ran. Claude Code and Codex are
 * the two that can be started this way. Every other surface gets
 * `schedulable: false`, and library/HIRING.md stops the schedule honestly
 * instead of wiring a task that will never fire.
 *
 * This is the computer's-own-scheduler rung only (HIRING.md step 6, rung B).
 * A scheduled task that lives inside the agent software itself (Claude Code's
 * scheduled tasks, the Codex app's automations) needs no command at all.
 *
 * It gives the command's name and its arguments as a plain list, with
 * PROMPT_SLOT standing where the shift prompt goes. Where it goes matters:
 * Claude Code's --allowedTools takes every word after it as a tool name, so a
 * prompt placed last is swallowed and the run stops with "no prompt". It never
 * gives a ready-made command line: status/schedule.mjs is the one place that
 * finds the command's full path and quotes each argument for the file it is
 * writing.
 *
 * `tools` is the `tools:` line of the agent's job sheet. With nobody there to
 * answer a permission question, Claude Code is told to allow exactly those
 * tools and to refuse everything else without asking.
 */
export const PROMPT_SLOT = '{prompt}';

export function unattendedRunner(surface, { tools } = {}) {
  switch (surface) {
    case 'claude-code':
      return {
        schedulable: true,
        bin: 'claude',
        args: tools
          ? ['-p', PROMPT_SLOT, '--permission-mode', 'dontAsk', '--allowedTools', tools]
          : ['-p', PROMPT_SLOT, '--permission-mode', 'dontAsk'],
      };
    case 'codex':
      // `codex exec` is the form that runs without a person.
      // --skip-git-repo-check lets it run in a folder that was downloaded, not
      // cloned. The workspace sandbox blocks the network unless told
      // otherwise, and a shift's report has to reach the radio, so network
      // access is switched on here rather than left to a config file that may
      // never have been edited.
      return {
        schedulable: true,
        bin: 'codex',
        args: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true', PROMPT_SLOT],
      };
    default:
      // cursor, copilot-vscode, claude-desktop, chatgpt-app, website-chat, or
      // nothing recorded.
      return {
        schedulable: false,
        bin: null,
        args: null,
        note: 'The agent is hired and works when asked; its schedule stays "not yet wired".',
      };
  }
}

// ── Skill bundles: a skill is a folder, and the whole folder travels ────────
//
// A skill is more than its SKILL.md: references, templates, examples. The radio
// carries the whole folder as a bundle of TEXT files, and nothing else. No
// script, no binary, ever crosses — that one rule is what makes carrying skills
// safe without a sandbox or signing, so it is enforced on both ends. The server
// in dailypractice-mono applies the same constants and rules; keep them equal.

export const SKILL_TEXT_EXTENSIONS = ['.md', '.txt', '.json', '.csv', '.yaml', '.yml'];
export const SKILL_FILE_MAX = 200000;      // characters per file (the library's long-standing cap)
export const SKILL_FILES_MAX = 40;
export const SKILL_BUNDLE_MAX = 1000000;   // characters across the whole bundle
export const SKILL_BUNDLE_BYTES_MAX = 3500000; // UTF-8 bytes; stays under the bridge's 4.5 MB request limit
export const SKILL_ENTRY_FILE = 'SKILL.md';

/**
 * Why a path is not allowed inside a skill bundle, or null when it is fine.
 * Relative, forward slashes, no dot segments, no hidden files, text only.
 * Applied to what we pack AND to what a server hands us: the other end is data.
 */
export function skillPathProblem(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 200) return 'empty or too long';
  if (p.includes('\\') || p.includes('\0')) return 'bad character';
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return 'absolute path';
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..')) return 'dot segment';
  if (parts.some((s) => s.startsWith('.'))) return 'hidden file';
  const dot = p.lastIndexOf('.');
  const ext = dot > p.lastIndexOf('/') ? p.slice(dot).toLowerCase() : '';
  if (!SKILL_TEXT_EXTENSIONS.includes(ext)) return 'not a text file';
  return null;
}

/** Why a bundle ({ path, content }[]) cannot travel, or null when it can. */
export function skillBundleProblem(files) {
  if (!Array.isArray(files) || files.length === 0) return 'no files';
  if (files.length > SKILL_FILES_MAX) return `more than ${SKILL_FILES_MAX} files`;
  const seen = new Set();
  let total = 0;
  let bytes = 0;
  for (const f of files) {
    const why = skillPathProblem(f?.path);
    if (why) return `${String(f?.path)}: ${why}`;
    // "Text" is more than an extension: a NUL byte means a binary wearing a
    // .md name (or a UTF-16 file). It would be refused on arrival; say so here.
    if (typeof f.content !== 'string' || f.content.includes('\0')) return `${f.path}: not text`;
    if (f.content.length > SKILL_FILE_MAX) return `${f.path}: over ${SKILL_FILE_MAX} characters`;
    // Case-insensitively: on a Mac or Windows disk two spellings are one file.
    if (seen.has(f.path.toLowerCase())) return `${f.path}: listed twice`;
    seen.add(f.path.toLowerCase());
    total += f.content.length;
    bytes += Buffer.byteLength(f.content, 'utf8');
  }
  if (!seen.has(SKILL_ENTRY_FILE.toLowerCase())) return `no ${SKILL_ENTRY_FILE}`;
  if (total > SKILL_BUNDLE_MAX) return `bundle over ${SKILL_BUNDLE_MAX} characters`;
  if (bytes > SKILL_BUNDLE_BYTES_MAX) return `bundle over ${SKILL_BUNDLE_BYTES_MAX} bytes`;
  return null;
}

/**
 * Walk a skill folder and collect its text files as a bundle, in a stable order.
 * Everything else is skipped and listed, so the person can see what stayed
 * behind. Symlinks are never followed. `fs` is injected (readdirSync, lstatSync,
 * readFileSync) to keep this file dependency-free and the walk testable.
 */
export function packSkillFolder(dir, fs) {
  const files = [];
  const skipped = [];
  // Anything that cannot be read is skipped and named, never thrown: the radio
  // answers in one plain line, not a stack trace.
  const walk = (rel) => {
    const here = rel ? `${dir}/${rel}` : dir;
    let names;
    try { names = fs.readdirSync(here).sort(); } catch { skipped.push(`${rel || '.'}/ (could not be read)`); return; }
    for (const name of names) {
      const relPath = rel ? `${rel}/${name}` : name;
      let st;
      try { st = fs.lstatSync(`${dir}/${relPath}`); } catch { skipped.push(`${relPath} (could not be read)`); continue; }
      if (st.isSymbolicLink()) { skipped.push(relPath); continue; }
      if (st.isDirectory()) {
        if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') { skipped.push(`${relPath}/`); continue; }
        walk(relPath);
        continue;
      }
      if (skillPathProblem(relPath)) { skipped.push(relPath); continue; }
      try {
        files.push({ path: relPath, content: fs.readFileSync(`${dir}/${relPath}`, 'utf8') });
      } catch { skipped.push(`${relPath} (could not be read)`); }
    }
  };
  walk('');
  return { files, skipped };
}
