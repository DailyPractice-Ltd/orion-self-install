/**
 * The Orion plugin package's metadata: both plugin manifests, generated from the
 * candidate release, and the selected tool's per-harness catalog.
 *
 *   node update/plugin-package.mjs --write   regenerate the committed manifests
 *   node update/plugin-package.mjs --check   exit 2 when they are stale
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT, TOOL_LAYOUT, safePath } from './destination-resolver.mjs';
import { withStatusLock } from '../status/store.mjs';

const RELEASE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PLUGIN_NAME = 'orion';
export const PLUGIN_DESCRIPTION = 'Orion sales harness skills. Requires an installed Orion harness folder.';
export const PLUGIN_AUTHOR = Object.freeze({ name: 'Daily Practice' });

/** The portable root manifest serves Codex; the nested native manifest serves Claude Code. */
export const MANIFEST_PATHS = Object.freeze({
  codex: `${PACKAGE_ROOT}/plugin.json`,
  'claude-code': `${PACKAGE_ROOT}/.claude-plugin/plugin.json`,
});

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Both manifests for one release version, keyed by their package path. */
export function pluginManifests(version) {
  return {
    [MANIFEST_PATHS.codex]: {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: PLUGIN_NAME,
      version,
      description: PLUGIN_DESCRIPTION,
      author: { ...PLUGIN_AUTHOR },
      extensions: { 'com.openai': { interface: { displayName: 'Orion', shortDescription: 'Orion sales harness skills', developerName: PLUGIN_AUTHOR.name, category: 'Productivity' } } },
    },
    [MANIFEST_PATHS['claude-code']]: {
      name: PLUGIN_NAME,
      version,
      description: PLUGIN_DESCRIPTION,
      author: { ...PLUGIN_AUTHOR },
    },
  };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function supported(ai_assistant) {
  if (!Object.hasOwn(MANIFEST_PATHS, ai_assistant)) throw new Error(`Unsupported AI assistant: ${ai_assistant || '(missing)'}`);
}

function unknownKeys(value, allowed, where) {
  return Object.keys(value).filter(key => !allowed.includes(key)).map(key => `${where}: unknown key "${key}"`);
}

const MANIFEST_KEYS = {
  // Codex portable root manifest, plus its OpenAI overlay [agent-plugins.org 1.0.0].
  codex: ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions', 'skills'],
  // Claude Code .claude-plugin/plugin.json fields Orion may use.
  'claude-code': ['name', 'displayName', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'skills'],
};
const CODEX_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const CLAUDE_RESERVED_PLUGIN = /^(claude-|anthropic-|anthropics-|cc-plugin-)|^(claude|anthropic|claude-code|claude-mods)$/;
const OPENAI_INTERFACE = ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category', 'capabilities', 'websiteURL', 'privacyPolicyURL', 'termsOfServiceURL', 'defaultPrompt', 'brandColor', 'composerIcon', 'logo'];

/**
 * Errors in one tool's plugin manifest, checked against that tool's own schema.
 * With `version`, the manifest must carry that exact release version.
 */
export function validatePluginManifest(ai_assistant, manifest, { version } = {}) {
  supported(ai_assistant);
  const where = MANIFEST_PATHS[ai_assistant];
  if (!isObject(manifest)) return [`${where}: must be a JSON object`];
  const errors = unknownKeys(manifest, MANIFEST_KEYS[ai_assistant], where);
  if (manifest.name !== PLUGIN_NAME) errors.push(`${where}: name must be "${PLUGIN_NAME}"`);
  if (typeof manifest.name === 'string' && (!KEBAB.test(manifest.name) || (ai_assistant === 'claude-code' && CLAUDE_RESERVED_PLUGIN.test(manifest.name)))) {
    errors.push(`${where}: name "${manifest.name}" is not a valid plugin name`);
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) errors.push(`${where}: version must not be blank`);
  else if (!SEMVER.test(manifest.version)) errors.push(`${where}: version ${manifest.version} is not an Orion release version`);
  else if (version !== undefined && manifest.version !== version) errors.push(`${where}: version ${manifest.version} must equal the release version ${version}`);
  if (typeof manifest.description !== 'string' || !manifest.description.trim()) errors.push(`${where}: description must be a non-empty string`);
  if ('author' in manifest && (!isObject(manifest.author) || typeof manifest.author.name !== 'string' || !manifest.author.name.trim())) {
    errors.push(`${where}: author.name is required when author is present`);
  }
  // Skills use the standard skills/<name>/SKILL.md discovery; nothing may point elsewhere.
  if ('skills' in manifest && manifest.skills !== './skills/') errors.push(`${where}: skills must use the standard ./skills/ layout`);
  if (ai_assistant === 'codex') {
    if ('$schema' in manifest && manifest.$schema !== CODEX_SCHEMA) errors.push(`${where}: $schema must be ${CODEX_SCHEMA}`);
    if ('extensions' in manifest) {
      const openai = manifest.extensions?.['com.openai'];
      if (!isObject(manifest.extensions) || !isObject(openai)) errors.push(`${where}: extensions must hold a com.openai object`);
      else {
        errors.push(...unknownKeys(manifest.extensions, ['com.openai'], `${where} extensions`));
        errors.push(...unknownKeys(openai, ['apps', 'hooks', 'onboardingSkill', 'interface'], `${where} com.openai`));
        if ('interface' in openai) {
          if (!isObject(openai.interface)) errors.push(`${where}: com.openai.interface must be an object`);
          else {
            errors.push(...unknownKeys(openai.interface, OPENAI_INTERFACE, `${where} com.openai.interface`));
            for (const key of ['composerIcon', 'logo']) {
              if (key in openai.interface && !String(openai.interface[key]).startsWith('./')) errors.push(`${where}: com.openai.interface.${key} must start with ./`);
            }
          }
        }
      }
    }
  }
  return errors;
}

const IDENTITY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The status.json `plugin` region a harness starts with (documented in status/status-schema.md). */
export function defaultPluginRegion() {
  return { catalog_identity: null, setup_state: 'not_started', remaining_action: null, verified_version: null, verified_at: null, pending_version: null, pending_switch: null };
}

/**
 * Give a status object its `plugin` region, filling any missing field, and
 * return it. With `create`, a missing catalog identity is generated once from
 * crypto randomness, never from the pairing key, business name or folder.
 */
export function ensurePluginRegion(status, { create = false } = {}) {
  if (!isObject(status.plugin)) status.plugin = {};
  for (const [key, value] of Object.entries(defaultPluginRegion())) if (!(key in status.plugin)) status.plugin[key] = value;
  const identity = status.plugin.catalog_identity;
  if (identity != null && !IDENTITY.test(identity)) throw new Error('status.json plugin.catalog_identity is malformed; restore it from the backup rather than replacing it');
  if (identity == null && create) status.plugin.catalog_identity = randomUUID();
  return status.plugin;
}

/** Read this harness's catalog identity, creating and saving it the first time. */
export async function catalogIdentity(root, { create = true } = {}) {
  return withStatusLock(root, async store => {
    const status = await store.readStatus();
    const before = JSON.stringify(status);
    const region = ensurePluginRegion(status, { create });
    if (JSON.stringify(status) !== before) await store.writeStatus(status);
    return region.catalog_identity;
  });
}

/** The catalog (marketplace) name both tools register: unique per harness. */
export function catalogName(identity) {
  if (typeof identity !== 'string' || !IDENTITY.test(identity)) throw new Error('A catalog name needs this harness’s catalog identity');
  return `${PLUGIN_NAME}-${identity.replaceAll('-', '').slice(0, 12)}`;
}

// Claude Code marketplace-name rules; Codex accepts the same shape.
const RESERVED_CATALOGS = new Set([
  'claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official', 'anthropic-marketplace', 'anthropic-plugins',
  'agent-skills', 'anthropic-agent-skills', 'life-sciences', 'knowledge-work-plugins', 'claude-for-legal',
  'claude-for-financial-services', 'financial-services-plugins', 'first-party-plugins', 'claude-tag-plugins',
  'claude-community', 'claude-plugins-community', 'healthcare', 'anthropic-plugin-directory', 'claude-plugin-directory',
  'inline', 'builtin', 'skills-dir', 'synced', 'claude-plugin-test', 'org', 'org-provisioned', 'unknown',
]);

export function catalogNameErrors(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return [`catalog name ${JSON.stringify(name)} must use letters, digits, ".", "_" or "-" and start with a letter or digit`];
  const errors = [];
  if (name.length > 128) errors.push('catalog name is longer than 128 characters');
  if (name.includes('..')) errors.push(`catalog name ${name} must not contain ".."`);
  const plain = name.toLowerCase().replace(/[._]/g, '-');
  if (RESERVED_CATALOGS.has(plain) || plain.startsWith('claudeai-') || name in Object.prototype || /(^|-)(claude|anthropic)(-|$)/.test(plain)) {
    errors.push(`catalog name ${name} is reserved`);
  }
  return errors;
}

/**
 * Errors in the package under `root` (a release checkout or a harness): both
 * manifests on their own schemas, at `version` when given, and every skill
 * folder in the standard skills/<name>/SKILL.md layout.
 */
export function validatePackage(root, { version } = {}) {
  const errors = [];
  for (const [ai_assistant, path] of Object.entries(MANIFEST_PATHS)) {
    let manifest;
    try { manifest = JSON.parse(readFileSync(safePath(root, path), 'utf8')); }
    catch (error) { errors.push(`${path}: missing or unreadable (${error.code || error.message})`); continue; }
    errors.push(...validatePluginManifest(ai_assistant, manifest, { version }));
  }
  const skills = join(root, PACKAGE_ROOT, 'skills');
  const folders = existsSync(skills) ? readdirSync(skills, { withFileTypes: true }).filter(item => item.isDirectory()) : [];
  if (!folders.length) errors.push(`${PACKAGE_ROOT}/skills: no skills found`);
  for (const folder of folders) {
    if (!existsSync(join(skills, folder.name, 'SKILL.md'))) errors.push(`${PACKAGE_ROOT}/skills/${folder.name} has no SKILL.md`);
  }
  return errors;
}

/** The package as both catalogs name it: relative to the harness (marketplace) root. */
export const CATALOG_SOURCE = `./${PACKAGE_ROOT}`;

/** The selected tool's harness catalog for this catalog identity. Never a release artifact. */
export function buildCatalog(ai_assistant, identity) {
  supported(ai_assistant);
  const name = catalogName(identity);
  if (ai_assistant === 'codex') {
    return {
      name,
      interface: { displayName: 'Orion' },
      // AVAILABLE, never INSTALLED_BY_DEFAULT: installation stays an explicit, scoped step.
      plugins: [{ name: PLUGIN_NAME, source: { source: 'local', path: CATALOG_SOURCE }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
    };
  }
  return {
    name,
    description: 'Orion sales harness skills for this Orion folder',
    owner: { ...PLUGIN_AUTHOR },
    plugins: [{ name: PLUGIN_NAME, source: CATALOG_SOURCE, description: PLUGIN_DESCRIPTION }],
  };
}

/** The exact bytes of the selected tool's catalog for this identity. */
export function catalogText(ai_assistant, identity) {
  return json(buildCatalog(ai_assistant, identity));
}

/** Write only the selected tool's catalog into the harness; returns its harness path. */
export function writeCatalog(root, ai_assistant, identity) {
  supported(ai_assistant);
  const path = TOOL_LAYOUT[ai_assistant].catalogPath;
  const target = safePath(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, catalogText(ai_assistant, identity));
  return path;
}

function sourceErrors(source, where, root, ai_assistant) {
  if (typeof source !== 'string' || !source.startsWith('./') || source.includes('\\') || source.split('/').includes('..')) {
    return [`${where}: source ${JSON.stringify(source)} must be a ./ path inside the harness, without ".." or backslashes`];
  }
  if (posix.normalize(source) !== PACKAGE_ROOT) return [`${where}: source ${source} must resolve to ${PACKAGE_ROOT}`];
  if (root === undefined) return [];
  // Relative to the harness (marketplace) root, never to the catalog's own folder.
  const manifest = join(resolve(root, source), MANIFEST_PATHS[ai_assistant].slice(PACKAGE_ROOT.length + 1));
  if (!existsSync(manifest)) return [`${where}: the package at ${source} has no ${MANIFEST_PATHS[ai_assistant]} manifest`];
  return [];
}

const CODEX_INSTALLATION = ['AVAILABLE'];
const CODEX_AUTHENTICATION = ['ON_INSTALL', 'ON_USE'];
const CLAUDE_CATALOG_KEYS = ['$schema', 'name', 'description', 'version', 'owner', 'metadata', 'plugins'];
const CLAUDE_ENTRY_KEYS = ['name', 'source', 'description', 'version', 'category', 'tags', 'strict', 'displayName'];

/**
 * Errors in one tool's harness catalog, checked against that tool's own schema.
 * With `root`, the source must reach this harness's package; with `identity`,
 * the catalog must carry this harness's catalog name.
 */
export function validateCatalog(ai_assistant, catalog, { root, identity } = {}) {
  supported(ai_assistant);
  const where = TOOL_LAYOUT[ai_assistant].catalogPath;
  if (!isObject(catalog)) return [`${where}: must be a JSON object`];
  const errors = catalogNameErrors(catalog.name).map(error => `${where}: ${error}`);
  if (identity !== undefined && catalog.name !== catalogName(identity)) errors.push(`${where}: name ${catalog.name} must come from this harness’s catalog identity`);
  if (!Array.isArray(catalog.plugins)) return [...errors, `${where}: plugins must be a list`];
  const entries = catalog.plugins.filter(entry => entry?.name === PLUGIN_NAME);
  if (entries.length !== 1 || catalog.plugins.length !== 1) return [...errors, `${where}: plugins must hold exactly one orion entry`];
  const [entry] = entries;
  if (ai_assistant === 'codex') {
    errors.push(...unknownKeys(catalog, ['name', 'interface', 'plugins'], where));
    if ('interface' in catalog && (!isObject(catalog.interface) || typeof catalog.interface.displayName !== 'string')) errors.push(`${where}: interface.displayName must be a string`);
    errors.push(...unknownKeys(entry, ['name', 'source', 'policy', 'category'], `${where} orion entry`));
    if (!isObject(entry.source) || entry.source.source !== 'local') errors.push(`${where}: the orion source must be {"source":"local","path":"${CATALOG_SOURCE}"}`);
    else errors.push(...unknownKeys(entry.source, ['source', 'path'], `${where} orion source`), ...sourceErrors(entry.source.path, where, root, ai_assistant));
    if (!isObject(entry.policy)) errors.push(`${where}: the orion entry needs policy.installation and policy.authentication`);
    else {
      errors.push(...unknownKeys(entry.policy, ['installation', 'authentication', 'products'], `${where} orion policy`));
      if (!CODEX_INSTALLATION.includes(entry.policy.installation)) errors.push(`${where}: policy.installation must be ${CODEX_INSTALLATION.join(' or ')}; Orion is never installed by default`);
      if (!CODEX_AUTHENTICATION.includes(entry.policy.authentication)) errors.push(`${where}: policy.authentication must be ${CODEX_AUTHENTICATION.join(' or ')}`);
    }
    if (typeof entry.category !== 'string' || !entry.category.trim()) errors.push(`${where}: the orion entry needs a category`);
  } else {
    errors.push(...unknownKeys(catalog, CLAUDE_CATALOG_KEYS, where));
    if (!isObject(catalog.owner) || typeof catalog.owner.name !== 'string' || !catalog.owner.name.trim()) errors.push(`${where}: owner.name is required`);
    else errors.push(...unknownKeys(catalog.owner, ['name', 'email', 'url'], `${where} owner`));
    errors.push(...unknownKeys(entry, CLAUDE_ENTRY_KEYS, `${where} orion entry`));
    errors.push(...sourceErrors(entry.source, where, root, ai_assistant));
  }
  return errors;
}

function releaseVersion(releaseRoot) {
  return JSON.parse(readFileSync(join(releaseRoot, 'update/manifest.json'), 'utf8')).template_version;
}

/** Paths whose committed bytes differ from the generator output for the candidate release. */
export function staleManifests(releaseRoot = RELEASE_ROOT) {
  return Object.entries(pluginManifests(releaseVersion(releaseRoot))).filter(([path, value]) => {
    try { return readFileSync(join(releaseRoot, path), 'utf8') !== json(value); }
    catch { return true; }
  }).map(([path]) => path);
}

export function writePluginManifests(releaseRoot = RELEASE_ROOT) {
  const written = [];
  for (const [path, value] of Object.entries(pluginManifests(releaseVersion(releaseRoot)))) {
    mkdirSync(dirname(join(releaseRoot, path)), { recursive: true });
    writeFileSync(join(releaseRoot, path), json(value));
    written.push(path);
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--write')) console.log(`Wrote ${writePluginManifests().join(', ')}`);
    else {
      const stale = staleManifests();
      if (stale.length) throw new Error(`Stale plugin manifests: ${stale.join(', ')}. Run node update/plugin-package.mjs --write`);
      console.log('Plugin manifests are up to date');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
