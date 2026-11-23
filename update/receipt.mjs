/**
 * The installed-file receipt: this harness's own record of the Orion-managed files
 * actually installed, by destination, with the fingerprint of the installed bytes.
 * It is ownership evidence for later updates. It is never replaced by an update and
 * never lists client records, credentials, client templates or client-owned skills.
 */
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_LAYOUT, fingerprint, safePath } from './destination-resolver.mjs';

export const RECEIPT_PATH = 'status/installed-files.json';
export const RECEIPT_SCHEMA = 'orion-installed-files';
export const RECEIPT_VERSION = 1;
export const RECEIPT_ALGORITHM = 'sha256-utf8-lf';
const ORIGINS = ['release', 'generated'];
const HASH = /^[0-9a-f]{64}$/;

/** One entry per managed destination: its stable identity and the installed bytes' fingerprint. */
function entryFor(root, destination, key, origin) {
  const target = safePath(root, destination);
  if (!lstatSync(target).isFile()) throw new Error(`Cannot record ${destination}: not a regular file`);
  return { key, hash: fingerprint(readFileSync(target)), origin };
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
    files[entry.destination] = entryFor(root, entry.destination, entry.fingerprint_key, 'release');
  }
  const catalog = TOOL_LAYOUT[ai_assistant].catalogPath;
  files[catalog] = entryFor(root, catalog, catalog, 'generated');
  const sorted = Object.fromEntries(Object.keys(files).sort().map(path => [path, files[path]]));
  return validateReceipt({ schema: RECEIPT_SCHEMA, version: RECEIPT_VERSION, algorithm: RECEIPT_ALGORITHM, ai_assistant, template_version, recorded_by, recorded_at, files: sorted });
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
    if (typeof entry.hash !== 'string' || !HASH.test(entry.hash)) fail(`${destination}: hash is not a sha256 hex digest`);
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

/** The receipt's exact serialised form. */
export function receiptText(receipt) {
  return `${JSON.stringify(validateReceipt(receipt), null, 2)}\n`;
}

/** Write a receipt into a folder no other process can see yet (an installation stage). */
export function writeStagedReceipt(stage, receipt) {
  writeFileSync(safePath(stage, RECEIPT_PATH), receiptText(receipt));
}
