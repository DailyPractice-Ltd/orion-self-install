/**
 * The installed-file receipt: this harness's own record of the Orion-managed files
 * actually installed, by destination, with the fingerprint of the installed bytes.
 * It is ownership evidence for later updates. It is never replaced by an update and
 * never lists client records, credentials, client templates or client-owned skills.
 */
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT, REGISTRY_PATH, SHA256_HEX, TOOL_LAYOUT, fingerprint, safePath } from './destination-resolver.mjs';
import { RECEIPT_PATH } from '../status/store.mjs';

export { RECEIPT_PATH };
export const RECEIPT_SCHEMA = 'orion-installed-files';
export const RECEIPT_VERSION = 1;
export const RECEIPT_ALGORITHM = 'sha256-utf8-lf';
const ORIGINS = ['release', 'generated'];

/** One receipt entry: a destination's stable identity, its installed bytes' fingerprint and where they came from. */
export const receiptEntry = (key, hash, origin = 'release') => ({ key, hash, origin });

/** A receipt's `files` in its canonical order: by destination. */
export const sortedFiles = files => Object.fromEntries(Object.keys(files).sort().map(path => [path, files[path]]));

/** The same receipt with new `files` (and any other changed fields), recorded now. */
export const revisedReceipt = (receipt, files, fields = {}) => ({ ...receipt, ...fields, recorded_at: new Date().toISOString(), files: sortedFiles(files) });

/** What to do when the receipt cannot be trusted, for the command that stopped. */
export const receiptAction = command => `Put back ${RECEIPT_PATH} as it was (your folder's home repository or an earlier copy of the folder has it), then run the same ${command} again. If you cannot, ask Daily Practice for help.`;

/** The entry for a destination as it is on disk now. */
export function entryFromDisk(root, destination, key, origin) {
  const target = safePath(root, destination);
  if (!lstatSync(target).isFile()) throw new Error(`Cannot record ${destination}: not a regular file`);
  return receiptEntry(key, fingerprint(readFileSync(target)), origin);
}

/**
 * The receipt for `root` as it stands: every release-owned destination in `plan`
 * (from planForTool) and the selected tool's generated catalog, hashed from disk.
 */
export function buildReceipt(root, plan, { ai_assistant, template_version, recorded_by, recorded_at = new Date().toISOString() }) {
  if (!TOOL_LAYOUT[ai_assistant]) throw new Error(`Unsupported AI assistant: ${ai_assistant}`);
  const files = {};
  for (const entry of plan) {
    if (entry.ownership !== 'release') continue;
    if (entry.destination === RECEIPT_PATH) throw new Error(`${RECEIPT_PATH} cannot be a managed file`);
    files[entry.destination] = entryFromDisk(root, entry.destination, entry.fingerprint_key, 'release');
  }
  const catalog = TOOL_LAYOUT[ai_assistant].catalogPath;
  files[catalog] = entryFromDisk(root, catalog, catalog, 'generated');
  return validateReceipt({ schema: RECEIPT_SCHEMA, version: RECEIPT_VERSION, algorithm: RECEIPT_ALGORITHM, ai_assistant, template_version, recorded_by, recorded_at, files: sortedFiles(files) });
}

/** The receipt itself, or an error naming what is wrong with it. */
export function validateReceipt(value) {
  const fail = (why) => { throw new Error(`Invalid installed-file receipt (${RECEIPT_PATH}): ${why}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('not a JSON object');
  if (value.schema !== RECEIPT_SCHEMA) fail(`schema must be ${RECEIPT_SCHEMA}`);
  if (value.version !== RECEIPT_VERSION) fail(`unsupported version ${JSON.stringify(value.version)}`);
  if (value.algorithm !== RECEIPT_ALGORITHM) fail(`algorithm must be ${RECEIPT_ALGORITHM}`);
  if (!TOOL_LAYOUT[value.ai_assistant]) fail(`unknown ai_assistant ${JSON.stringify(value.ai_assistant)}`);
  if (typeof value.template_version !== 'string' || !value.template_version) fail('template_version is missing');
  if (typeof value.recorded_by !== 'string' || !value.recorded_by) fail('recorded_by is missing');
  if (typeof value.recorded_at !== 'string' || Number.isNaN(Date.parse(value.recorded_at))) fail('recorded_at is not a time');
  if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) fail('files is not an object');
  for (const [destination, entry] of Object.entries(value.files)) {
    const segments = destination.split('/');
    if (destination.includes('\\') || segments.some(part => !part || part === '.' || part === '..' || part === 'specs') || /^[A-Za-z]:/.test(destination)) {
      fail(`${JSON.stringify(destination)} is not a harness-relative path`);
    }
    if (destination === RECEIPT_PATH || destination === 'status/status.json') fail(`${destination} is not a managed file`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`${destination}: entry is not an object`);
    if (typeof entry.key !== 'string' || !entry.key) fail(`${destination}: key is missing`);
    if (typeof entry.hash !== 'string' || !SHA256_HEX.test(entry.hash)) fail(`${destination}: hash is not a sha256 hex digest`);
    if (!ORIGINS.includes(entry.origin)) fail(`${destination}: origin must be one of ${ORIGINS.join(', ')}`);
  }
  return value;
}

/** The harness's receipt: null when it has none, an error when one exists but cannot be trusted. */
export function readReceipt(root) {
  const path = join(root, RECEIPT_PATH);
  if (!existsSync(path) && !isDanglingLink(path)) return null;
  let text;
  try {
    if (!lstatSync(path).isFile()) throw new Error('not a regular file');
    text = readFileSync(path, 'utf8');
  } catch (error) { throw new Error(`Cannot read the installed-file receipt (${RECEIPT_PATH}): ${error.message}`); }
  let value;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`Invalid installed-file receipt (${RECEIPT_PATH}): ${error.message}`); }
  return validateReceipt(value);
}

function isDanglingLink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

/**
 * Managed runtime: code the harness runs, and the data that code reads. A client edit
 * here that an update would replace stops the update, so the folder never runs a
 * mixture of releases. Plugin package files and the catalog are protected the same way
 * by the updater. The compatibility registry is not runtime: updates read the
 * incoming release's copy, never the harness's, so it is tracked like any other
 * non-runtime file (see legacyReceipt for how a migrating harness claims it).
 */
export function isRuntimeDestination(destination) {
  if (destination === REGISTRY_PATH) return false;
  return destination.endsWith('.mjs') || destination.startsWith('update/') || destination === 'status/status.schema-template.json';
}

/**
 * What the receipt says about one destination as it stands now:
 *   absent      nothing is there
 *   not-a-file  a link (anywhere on the path), folder or special file: never read through
 *   installed   the bytes Orion installed, unchanged (line endings aside)
 *   modified    the receipt lists it and the bytes differ: a client edit
 *   unknown     something is there that Orion never recorded installing
 * `current` is the fingerprint of a regular file, `baseline` the receipt's.
 */
export function receiptState(root, destination, receipt) {
  const baseline = receipt.files[destination]?.hash ?? null;
  let part = root;
  for (const segment of destination.split('/')) {
    part = join(part, segment);
    try { if (lstatSync(part).isSymbolicLink()) return { state: 'not-a-file', current: null, baseline }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const target = safePath(root, destination);
  if (!existsSync(target)) return { state: 'absent', current: null, baseline };
  if (!lstatSync(target).isFile()) return { state: 'not-a-file', current: null, baseline };
  const current = fingerprint(readFileSync(target));
  const state = baseline === null ? 'unknown' : current === baseline ? 'installed' : 'modified';
  return { state, current, baseline };
}

/**
 * The receipt a harness from before receipts can prove, from the frozen compatibility
 * registry (update/pristine.json): one entry for each candidate `{destination, key}` whose
 * current bytes are the last version Orion shipped under that source identity before
 * receipts. Anything else gets no entry, so its bytes are never adopted as Orion's, with one
 * deliberate exception: the registry's own copy (update/pristine.json). Updates read the
 * incoming release's registry and never the harness's, so the harness copy is Orion's
 * bookkeeping, not client content; no client work lives in it and nothing runs from it.
 * It is seeded as owned whatever its bytes, so a malformed or stale shipped copy is
 * always replaced and the registry never has to list versions of itself.
 */
export function legacyReceipt(root, candidates, { registry, ai_assistant, template_version }) {
  const proved = { schema: RECEIPT_SCHEMA, version: RECEIPT_VERSION, algorithm: RECEIPT_ALGORITHM, ai_assistant, template_version, recorded_by: 'migration', recorded_at: new Date().toISOString(), files: {} };
  const shipped = key => registry?.files?.[key] || [];
  for (const { destination, key } of candidates) {
    if (proved.files[destination]) continue;
    const { state, current } = receiptState(root, destination, proved);
    if (state === 'unknown' && (destination === REGISTRY_PATH || shipped(key).includes(current))) proved.files[destination] = receiptEntry(key, current);
  }
  return validateReceipt({ ...proved, files: sortedFiles(proved.files) });
}

/**
 * The receipt an update leaves when every action succeeds: `verified` destinations already
 * held the incoming bytes, `forgotten` ones were retired before and are gone, `written`
 * maps each destination the update adds or replaces to its new entry, `retired` lists those
 * it removes. With `pkg` (the incoming package's entries) the whole package claim is
 * replaced; `catalog` is the generated catalog's entry, when the update leaves it as generated.
 */
export function updatedReceipt(receipt, { verified = {}, forgotten = [], written = {}, retired = [], pkg = null, catalog = null }, fields) {
  const files = { ...receipt.files, ...verified };
  for (const path of [...forgotten, ...retired]) delete files[path];
  Object.assign(files, written);
  if (pkg) {
    for (const path of Object.keys(files)) if (isPackagePath(path)) delete files[path];
    Object.assign(files, pkg);
  }
  if (catalog) files[catalog.path] = catalog.entry;
  return revisedReceipt(receipt, files, { ...fields, recorded_by: 'update' });
}

/**
 * The receipt after a restore: restored destinations go back to their `prior` entries (or
 * lose them), a restored package takes back the whole prior package claim, and `gone`
 * destinations (added by the update, deleted since) are no longer claimed. Everything
 * else, kept edits included, keeps the baseline in `base`.
 */
export function restoredReceipt(base, { prior = {}, restored = [], gone = [] }, fields) {
  const files = { ...base.files };
  for (const path of gone) delete files[path];
  for (const path of restored) {
    if (path === PACKAGE_ROOT) {
      for (const key of Object.keys(files)) if (isPackagePath(key)) delete files[key];
      for (const key of Object.keys(prior)) if (isPackagePath(key)) files[key] = prior[key];
    } else if (prior[path]) files[path] = prior[path];
    else delete files[path];
  }
  return revisedReceipt(base, files, { ...fields, recorded_by: 'restore' });
}

/** The receipt without the claims for those paths that are now gone from the folder. */
export function withoutAbsent(root, receipt, paths) {
  const files = { ...receipt.files };
  for (const path of paths) if (!existsSync(join(root, path))) delete files[path];
  return revisedReceipt(receipt, files);
}

const isPackagePath = path => path === PACKAGE_ROOT || path.startsWith(`${PACKAGE_ROOT}/`);

/** The receipt's exact serialised form. */
export function receiptText(receipt) {
  return `${JSON.stringify(validateReceipt(receipt), null, 2)}\n`;
}

/** Write a receipt into a folder no other process can see yet (an installation stage). */
export function writeStagedReceipt(stage, receipt) {
  writeFileSync(safePath(stage, RECEIPT_PATH), receiptText(receipt));
}
