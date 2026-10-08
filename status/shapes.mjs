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
export const CREDENTIAL_RES = Object.freeze([
  /orion_[A-Za-z0-9_-]{20,}/,            // an install token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,  // a key file
  /\bsk-[A-Za-z0-9_-]{16,}/,             // API-key shapes
  /\b(password|passwd|api[_-]?key|client[_-]?secret)\s*[:=]\s*\S/i,
]);

export function looksLikeCredential(text) {
  return CREDENTIAL_RES.some((re) => re.test(String(text)));
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

// ── Fill at install: a library skill becomes this business's as it lands ────
//
// A library skill is written for any business, so where the business is named
// it carries a token instead. The skill itself says which tokens get filled, in
// a plain list in its SKILL.md:
//
//   ## Fill at install
//   - {{CLIENT_BUSINESS}}: your business name (from: business_name)
//   - {{PIPELINE_STAGES}}: your CRM pipeline stage names, in order
//
// Only a token on that list is ever touched. Anything else in double braces is
// the skill's own working text (a message template's {{first_name}}) and stays
// exactly as written. A line ending "(from: <field>)" is filled from
// status.json with no question; every other line is asked by the assistant,
// one question at a time, after the skill has landed.
//
// The list is the run of such lines straight after the heading. It ends at the
// first line that is something else, so a later list in the same skill is never
// mistaken for it. A heading inside a code block is an example, not the list.

// What a skill may ask to be filled from. A skill is data from somewhere else:
// it names one of these or nothing, never a field of its own choosing, so no
// skill can pull a token or a path out of status.json into a file.
export const FILL_FROM_FIELDS = Object.freeze(['business_name', 'agent_name']);
export const FILL_TOKENS_MAX = 20;
export const FILL_VALUE_MAX = 200;
// A fill line is short. A longer one is not read as one, which also keeps every
// pattern below working on a bounded string whatever a server sends.
const FILL_LINE_MAX = 400;

const FILL_HEADING_RE = /^#{2,4}\s+fill at install\s*:?$/i;
const FILL_LINE_RE = /^[-*]\s+\{\{([A-Z][A-Z0-9_]{0,63})\}\}\s*:(.*)$/;
const FENCE_RE = /^(```|~~~)/;
const BREAK_RE = /^(#{1,6}\s|-{3,}$|\*{3,}$|_{3,}$)/;
// A name that can be written into YAML or CSV as it stands: letters, digits,
// spaces and a few marks that mean nothing there. Anything else is still fine
// in prose, so it only matters where a token sits in one of those files.
const STRUCTURE_SAFE_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&()\/+-]*$/u;

/** "question (from: field)" -> { question, from }. Plain string work, no backtracking. */
function splitFrom(rest) {
  const text = rest.trim().replace(/\.$/, '');
  if (text.endsWith(')')) {
    const at = text.toLowerCase().lastIndexOf('(from:');
    const name = at === -1 ? '' : text.slice(at + 6, -1).trim();
    if (/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) return { question: text.slice(0, at), from: name.toLowerCase() };
  }
  return { question: rest, from: null };
}

/**
 * Where the fill list sits in a SKILL.md, line by line. Null when there is none.
 * `problem` says why a list cannot be used (a token twice, too many of them).
 */
function fillSection(skillMd) {
  if (typeof skillMd !== 'string') return null;
  const lines = skillMd.split('\n');
  let start = -1;
  let fenced = false;
  for (let i = 0; i < lines.length && start === -1; i++) {
    const t = lines[i].trim();
    if (FENCE_RE.test(t)) fenced = !fenced;
    else if (!fenced && t.length <= FILL_LINE_MAX && FILL_HEADING_RE.test(t)) start = i;
  }
  if (start === -1) return null;

  const entries = [];
  const seen = new Set();
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') continue;
    const m = t.length <= FILL_LINE_MAX ? FILL_LINE_RE.exec(t) : null;
    if (!m) {
      // A sentence may introduce the list; once the list has begun, anything
      // that is not part of it ends it.
      if (entries.length > 0 || BREAK_RE.test(t) || FENCE_RE.test(t)) break;
      continue;
    }
    if (seen.has(m[1])) return { lines, entries, problem: `{{${m[1]}}} is listed twice under "Fill at install"` };
    if (entries.length >= FILL_TOKENS_MAX) return { lines, entries, problem: `more than ${FILL_TOKENS_MAX} things listed under "Fill at install"` };
    seen.add(m[1]);
    const { question, from } = splitFrom(m[2]);
    // The question is printed for a person to read: one plain line, no control characters.
    const plain = question.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, FILL_VALUE_MAX);
    entries.push({ token: m[1], question: plain || m[1].toLowerCase().replace(/_/g, ' '), from, line: i });
  }
  return { lines, entries, problem: null };
}

/**
 * The tokens a skill declares for filling: [{ token, question, from }], in the
 * order the skill lists them. Empty when the skill declares none.
 */
export function parseFillManifest(skillMd) {
  const section = fillSection(skillMd);
  return section ? section.entries.map(({ token, question, from }) => ({ token, question, from })) : [];
}

/** A value fit to write into a skill: one plain line, or null when it is not. */
function fillValue(v) {
  if (typeof v !== 'string') return null;
  const value = v.trim();
  if (!value || value.length > FILL_VALUE_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(value) || value.includes('{{')) return null;
  return value;
}

/** How many leading lines of a SKILL.md are its frontmatter block (0 when it has none). */
function frontmatterEnd(lines) {
  if (lines.length === 0 || lines[0].trim() !== '---') return 0;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return end === -1 ? 0 : end + 1;
}

/**
 * Fill what this harness already knows into a skill bundle ({ path, content }[]).
 * `known` is { business_name, agent_name } from status.json. Returns the files
 * to write, what was filled, and what is still open for the assistant to ask:
 *   { files, filled: [{ token, question, value }], open: [{ token, question }], problem }
 *
 * A skill that declares nothing comes back as the very same array, untouched.
 * A filled token's own line in the list becomes the record ("- TOKEN: value"),
 * so nothing filled is left in braces; an open token's line stays to be asked.
 * `problem` is set, and nothing is filled, when the list itself cannot be used.
 */
export function fillBundle(files, known = {}) {
  const asArrived = { files, filled: [], open: [], problem: null };
  const entry = Array.isArray(files) ? files.find((f) => f?.path === SKILL_ENTRY_FILE) : null;
  const section = entry ? fillSection(entry.content) : null;
  if (!section) return asArrived;
  if (section.problem) return { ...asArrived, problem: section.problem };
  if (section.entries.length === 0) return asArrived;

  // In YAML or CSV (and a SKILL.md's own frontmatter is YAML) a colon, a comma
  // or a quote in a name changes what the file means. A token that sits there
  // is filled only with a name that is safe there; otherwise it is asked, and
  // the assistant writes it in with the quoting that file needs.
  const fmEnd = frontmatterEnd(section.lines);
  const inStructure = (token) => {
    const braces = `{{${token}}}`;
    return section.lines.slice(0, fmEnd).some((l) => l.includes(braces))
      || files.some((f) => /\.(ya?ml|csv)$/i.test(f.path) && f.content.includes(braces));
  };

  const filled = [];
  const open = [];
  for (const e of section.entries) {
    let value = e.from && FILL_FROM_FIELDS.includes(e.from) ? fillValue(known?.[e.from]) : null;
    if (value !== null && !STRUCTURE_SAFE_RE.test(value) && inStructure(e.token)) value = null;
    if (value === null) open.push(e);
    else filled.push({ ...e, value });
  }

  // Split and join, never a regex replacement: a business name is written as
  // it is, "$&" and all. Inside a .json file it is escaped so the file still parses.
  const put = (text, json) => filled.reduce(
    (acc, f) => acc.split(`{{${f.token}}}`).join(json ? JSON.stringify(f.value).slice(1, -1) : f.value),
    text,
  );
  const openList = open.map((o) => ({ token: o.token, question: put(o.question, false) }));
  const allOpen = { ...asArrived, open: section.entries.map(({ token, question }) => ({ token, question })) };

  // A line's own "(from: ...)" is the installer's business. One this harness
  // does not honour is taken off the line as it lands, so nothing on disk
  // suggests a status field to whoever fills the answer in afterwards.
  const stripped = new Map(open.filter((o) => o.from && !FILL_FROM_FIELDS.includes(o.from)).map((o) => [o.line, o]));
  if (filled.length === 0 && stripped.size === 0) return allOpen;

  const recordAt = new Map(filled.map((f) => [f.line, f]));
  const out = files.map((f) => {
    if (f.path !== SKILL_ENTRY_FILE) {
      return { ...f, content: put(f.content, f.path.toLowerCase().endsWith('.json')) };
    }
    const lines = section.lines.map((line, i) => {
      const cr = line.endsWith('\r') ? '\r' : '';
      const rec = recordAt.get(i);
      if (rec) return `- ${rec.token}: ${rec.value}${cr}`;
      const bare = stripped.get(i);
      if (bare) return `- {{${bare.token}}}: ${put(bare.question, false)}${cr}`;
      return put(line, false);
    });
    return { ...f, content: lines.join('\n') };
  });

  // Filling must never be the reason a skill cannot land. If the filled bundle
  // breaks a cap the arriving one kept, it lands as it arrived and all is asked.
  if (!skillBundleProblem(files) && skillBundleProblem(out)) return allOpen;
  return {
    files: out,
    filled: filled.map(({ token, question, value }) => ({ token, question, value })),
    open: openList,
    problem: null,
  };
}
