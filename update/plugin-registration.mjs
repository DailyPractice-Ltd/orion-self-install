/**
 * The Orion-owned registration entries in tool configuration files, and nothing else
 * in those files: each function reads or rewrites only this harness's own entries and
 * keeps every other line and key exactly as it was.
 *
 *   Codex        <harness>/.codex/config.toml   [marketplaces."<catalog>"] and
 *                                               [plugins."orion@<catalog>"] (project scope)
 *                <codex home>/config.toml        read only: a user-wide entry for this catalog
 *   Claude Code  <harness>/.claude/settings.local.json
 *                                               extraKnownMarketplaces.<catalog> and
 *                                               enabledPlugins["orion@<catalog>"] (local scope)
 *
 * Codex reads a project's .codex/config.toml only for a folder the person trusts; that is
 * what keeps Orion switched on in this folder alone rather than in every folder.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { safePath } from './destination-resolver.mjs';

export const CODEX_PROJECT_CONFIG = '.codex/config.toml';
export const CLAUDE_LOCAL_SETTINGS = '.claude/settings.local.json';

const pluginId = (catalog) => `orion@${catalog}`;

/** The user's Codex home: CODEX_HOME, else ~/.codex of the given (or this) home folder. */
export function codexHome({ env = process.env, home } = {}) {
  return env.CODEX_HOME || join(home || env.HOME || env.USERPROFILE || homedir(), '.codex');
}

// ── A minimal TOML table reader: enough to find, replace and remove whole tables ──

/** A table header's dotted key as plain parts: [plugins."orion@x"] → ['plugins', 'orion@x']. */
function headerKey(line) {
  const match = line.match(/^\s*\[(?!\[)(.*)\]\s*(?:#.*)?$/);
  if (!match) return null;
  const parts = [];
  let rest = match[1].trim();
  while (rest) {
    let part;
    if (rest.startsWith('"')) {
      const quoted = rest.match(/^"((?:[^"\\]|\\.)*)"/);
      if (!quoted) return null;
      try { part = JSON.parse(`"${quoted[1]}"`); } catch { return null; }
      rest = rest.slice(quoted[0].length);
    } else if (rest.startsWith("'")) {
      const literal = rest.match(/^'([^']*)'/);
      if (!literal) return null;
      part = literal[1];
      rest = rest.slice(literal[0].length);
    } else {
      const bare = rest.match(/^[A-Za-z0-9_-]+/);
      if (!bare) return null;
      part = bare[0];
      rest = rest.slice(part.length);
    }
    parts.push(part);
    rest = rest.trim();
    if (rest.startsWith('.')) rest = rest.slice(1).trim();
    else if (rest) return null;
  }
  return parts;
}

/** The text as tables: a preamble, then each table with its header key and its lines. */
function tables(text) {
  const lines = text.split(/\r?\n/);
  const out = [{ key: null, lines: [] }];
  for (const line of lines) {
    const key = /^\s*\[/.test(line) ? headerKey(line) : null;
    if (key || /^\s*\[\[/.test(line)) out.push({ key, lines: [line] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

const sameKey = (a, b) => Array.isArray(a) && a.length === b.length && a.every((part, i) => part === b[i]);
const ownedKeys = (catalog) => [['marketplaces', catalog], ['plugins', pluginId(catalog)]];
const isOwned = (table, catalog) => ownedKeys(catalog).some((key) => sameKey(table.key, key));

function value(table, name) {
  for (const line of table.lines.slice(1)) {
    const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*(?:#.*)?$`));
    if (!match) continue;
    const raw = match[1];
    if (raw === 'true' || raw === 'false') return raw === 'true';
    if (raw.startsWith('"')) { try { return JSON.parse(raw); } catch { return undefined; } }
    if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
    return raw;
  }
  return undefined;
}

/** This catalog's entries in one Codex config text: its marketplace source and plugin enablement. */
export function codexEntries(text, catalog) {
  const all = tables(text || '');
  const marketplace = all.find((t) => sameKey(t.key, ['marketplaces', catalog]));
  const plugin = all.find((t) => sameKey(t.key, ['plugins', pluginId(catalog)]));
  return {
    marketplace: marketplace ? { source_type: value(marketplace, 'source_type'), source: value(marketplace, 'source') } : null,
    enabled: plugin ? value(plugin, 'enabled') : undefined,
    text: all.filter((t) => isOwned(t, catalog)).map((t) => trimTable(t.lines).join('\n')).join('\n\n') || null,
  };
}

function trimTable(lines) {
  const copy = [...lines];
  while (copy.length > 1 && !copy[copy.length - 1].trim()) copy.pop();
  return copy;
}

/** The text without this catalog's tables; every other line is kept as written. */
function withoutOwned(text, catalog) {
  const kept = tables(text || '').filter((t) => !isOwned(t, catalog));
  return kept.map((t) => t.lines.join('\n')).join('\n').replace(/\n{3,}$/, '\n\n').replace(/\s+$/, '');
}

/** The two tables Orion owns for this harness in its project config. */
export function codexOwnedText(catalog, source) {
  return [
    `[marketplaces.${JSON.stringify(catalog)}]`,
    'source_type = "local"',
    `source = ${JSON.stringify(source)}`,
    '',
    `[plugins.${JSON.stringify(pluginId(catalog))}]`,
    'enabled = true',
  ].join('\n');
}

const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

function writeOrRemove(root, rel, text) {
  const path = safePath(root, rel);
  if (text && text.trim()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${text.replace(/\s+$/, '')}\n`);
    return;
  }
  if (existsSync(path)) unlinkSync(path);
  const dir = dirname(path);
  try { if (!readdirSync(dir).length) rmdirSync(dir); } catch { /* not ours to remove */ }
}

/** This harness's entries in its project .codex/config.toml. */
export function codexProjectEntries(root, catalog) {
  return codexEntries(readText(safePath(root, CODEX_PROJECT_CONFIG)), catalog);
}

/** This catalog's entries in the user-wide Codex config, read only. */
export function codexUserEntries(catalog, options = {}) {
  return codexEntries(readText(join(codexHome(options), 'config.toml')), catalog);
}

/**
 * Write this harness's marketplace and enablement into its project .codex/config.toml,
 * replacing only Orion's own tables for this catalog. Returns true when the file changed.
 */
export function writeCodexProjectConfig(root, catalog, source) {
  const before = readText(safePath(root, CODEX_PROJECT_CONFIG));
  const rest = withoutOwned(before, catalog);
  const next = `${rest ? `${rest}\n\n` : ''}${codexOwnedText(catalog, source)}\n`;
  if (next === before) return false;
  writeOrRemove(root, CODEX_PROJECT_CONFIG, next);
  return true;
}

/** Remove only Orion's tables for this catalog; the file goes only if nothing else is left. */
export function removeCodexProjectConfig(root, catalog) {
  const before = readText(safePath(root, CODEX_PROJECT_CONFIG));
  if (before === null || !codexEntries(before, catalog).text) return false;
  writeOrRemove(root, CODEX_PROJECT_CONFIG, withoutOwned(before, catalog));
  return true;
}

// ── Claude Code local settings ──

function readSettings(root) {
  const text = readText(safePath(root, CLAUDE_LOCAL_SETTINGS));
  if (text === null) return { exists: false, value: {} };
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return { exists: true, value };
  } catch { /* reported below */ }
  throw new Error(`${CLAUDE_LOCAL_SETTINGS} is not a JSON object, so Orion cannot put back its own entries without risking your other settings. Fix or move that file, then run the same command again.`);
}

const CLAUDE_KEYS = (catalog) => [['extraKnownMarketplaces', catalog], ['enabledPlugins', pluginId(catalog)]];

/**
 * A snapshot of the registration this harness owns for one tool, to be put back with
 * restoreRegistration. Only Orion's own entries are recorded, never the rest of the file.
 */
export function captureRegistration(root, tool, catalog) {
  if (tool === 'codex') return { tool, catalog, codex: codexProjectEntries(root, catalog).text };
  const { exists, value } = readSettings(root);
  const entries = CLAUDE_KEYS(catalog).map(([group, key]) => ({ group, key, present: Object.hasOwn(value[group] || {}, key), value: value[group]?.[key] ?? null }));
  return { tool, catalog, claude: { existed: exists, entries } };
}

/** Put this harness's own registration entries back as captured; every other entry stays. */
export function restoreRegistration(root, snapshot) {
  if (!snapshot) return;
  const { tool, catalog } = snapshot;
  if (tool === 'codex') {
    const before = readText(safePath(root, CODEX_PROJECT_CONFIG));
    const rest = withoutOwned(before, catalog);
    const next = snapshot.codex ? `${rest ? `${rest}\n\n` : ''}${snapshot.codex}` : rest;
    if ((before || '').replace(/\s+$/, '') !== next.replace(/\s+$/, '')) writeOrRemove(root, CODEX_PROJECT_CONFIG, next);
    return;
  }
  const { exists, value } = readSettings(root);
  if (!exists && snapshot.claude.entries.every((e) => !e.present)) return;
  for (const { group, key, present, value: old } of snapshot.claude.entries) {
    if (present) { value[group] = value[group] && typeof value[group] === 'object' ? value[group] : {}; value[group][key] = old; }
    else if (value[group] && typeof value[group] === 'object') {
      delete value[group][key];
      if (!Object.keys(value[group]).length) delete value[group];
    }
  }
  if (!snapshot.claude.existed && !Object.keys(value).length) { writeOrRemove(root, CLAUDE_LOCAL_SETTINGS, ''); return; }
  const path = safePath(root, CLAUDE_LOCAL_SETTINGS);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
