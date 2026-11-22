/**
 * The native command boundary for the Orion plugin: the only module that runs the
 * `claude` or `codex` plugin CLIs.
 *
 * Every function takes the harness root, the tool, this harness's catalog name and the
 * expected Orion version, and returns { state: 'complete' | 'pending' | 'failed',
 * remaining_action?, details }. `complete` means a real native inspection confirmed the
 * plugin, its version, its source and every shipped skill in this harness, with the
 * enablement scoped to this folder; nothing else earns it.
 *
 *   Claude Code  validate, marketplace add and install with --scope local; then `plugin list`
 *                (local scope, this folder, read in place from the package, this version) and
 *                `plugin details` (its skill inventory matches the package)
 *   Codex        this folder's own .codex/config.toml names the catalog and switches Orion on
 *                (update/plugin-registration.mjs); nothing user-wide is written. Then
 *                `marketplace list` (the catalog is seen here: the folder is trusted),
 *                `plugin list` (installed, on), no user-wide switch, and the cached copy
 *                Codex loads holds this version and every skill
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, sep } from 'node:path';
import { PACKAGE_ROOT, TOOL_LAYOUT } from './destination-resolver.mjs';
import { catalogNameErrors } from './plugin-package.mjs';
import { CODEX_PROJECT_CONFIG, codexHome, codexProjectEntries, codexUserEntries, removeCodexProjectConfig, writeCodexProjectConfig } from './plugin-registration.mjs';

const CLIENTS = Object.freeze({
  'claude-code': Object.freeze({ command: 'claude', envVar: 'ORION_CLAUDE_BIN' }),
  codex: Object.freeze({ command: 'codex', envVar: 'ORION_CODEX_BIN' }),
});

function client(tool) {
  const found = CLIENTS[tool];
  if (!found) throw new Error(`Unknown AI tool: ${tool}`);
  return found;
}

const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };

/** Claude Code may live only inside the desktop app; look there after PATH. */
function bundledClaude(home) {
  const base = join(home, 'Library/Application Support/Claude/claude-code');
  const found = [];
  try {
    for (const version of readdirSync(base)) {
      for (const build of readdirSync(join(base, version))) {
        const bin = join(base, version, build, 'claude.app/Contents/MacOS/claude');
        if (isFile(bin)) found.push({ version, bin });
      }
    }
  } catch { return []; }
  const key = (v) => v.split('.').map((n) => n.padStart(8, '0')).join('.');
  return found.sort((a, b) => key(b.version).localeCompare(key(a.version))).map((f) => f.bin);
}

/** Locate one tool's native CLI: its env override, then PATH, then known per-user locations. */
export function findNativeClient(tool, { env = process.env, home } = {}) {
  const { command, envVar } = client(tool);
  if (env[envVar]) return isFile(env[envVar]) ? env[envVar] : null;
  const exts = process.platform === 'win32' ? ['', ...(env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())] : [''];
  for (const dir of (env.PATH || env.Path || '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) if (isFile(join(dir, command + ext))) return join(dir, command + ext);
  }
  const userHome = home || env.HOME || env.USERPROFILE || homedir();
  const known = tool === 'codex' ? [join(userHome, '.local/bin/codex')] : bundledClaude(userHome);
  return known.find(isFile) || null;
}

function missingClient(tool) {
  const { envVar } = client(tool);
  const { product } = TOOL_LAYOUT[tool];
  return {
    state: 'pending',
    remaining_action: `Orion's skills reach ${product} through its plugin system, and ${product} was not found on this computer. Install ${product} (if it is already installed somewhere unusual, set ${envVar} to its program file instead), then run Orion's plugin setup again from this folder (node update/plugin-setup.mjs resume).`,
    details: { tool, reason: 'native_client_not_found' },
  };
}

const failed = (tool, reason, extra = {}) => ({ state: 'failed', details: { tool, reason, ...extra } });
const pending = (tool, remaining_action, reason, extra = {}) => ({ state: 'pending', remaining_action, details: { tool, reason, ...extra } });

/** The native CLIs print one JSON value, or log lines with the JSON value last. */
function parseJson(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { /* fall through to the last line */ }
  const last = trimmed.split(/\r?\n/).filter((line) => line.trim()).pop();
  try { return JSON.parse(last); } catch { return undefined; }
}

/** Windows npm shims are .cmd files, which only start through the shell. */
function run(ctx, args) {
  const shim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(ctx.bin);
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const result = shim
    ? spawnSync(quote(ctx.bin), args.map(quote), { cwd: ctx.real, env: ctx.env, encoding: 'utf8', shell: true, timeout: 120000, windowsHide: true })
    : spawnSync(ctx.bin, args, { cwd: ctx.real, env: ctx.env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  const call = { command: `${ctx.command} ${args.join(' ')}`, status: result.status, json: parseJson(result.stdout), stdout: result.stdout };
  ctx.calls.push({ command: call.command, status: call.status });
  if (result.error) call.error = result.error.message;
  else if (call.status !== 0 && !call.json) call.error = (result.stderr || result.stdout || '').trim().split(/\r?\n/).slice(-3).join(' ');
  return call;
}

/** Shared checks before any native call: a real harness folder holding this catalog and package. */
function prepare({ root, tool, catalogName, version, env = process.env, home, requireCatalog = true } = {}) {
  const { command } = client(tool);
  if (!root) throw new Error('A harness root is required');
  if (catalogNameErrors(catalogName).length) throw new Error(`Invalid catalog name: ${catalogName}`);
  if (requireCatalog && !version) throw new Error('The expected Orion version is required');
  const real = realpathSync(root);
  const layout = TOOL_LAYOUT[tool];
  const ctx = { tool, command, real, catalogName, version, env, home, calls: [], pluginId: `orion@${catalogName}`, packageDir: join(real, PACKAGE_ROOT) };
  if (requireCatalog) {
    let catalog;
    try { catalog = JSON.parse(readFileSync(join(real, layout.catalogPath), 'utf8')); }
    catch { return { early: failed(tool, 'catalog_missing', { catalog: layout.catalogPath }) }; }
    if (catalog.name !== catalogName) return { early: failed(tool, 'catalog_identity_mismatch', { catalog: layout.catalogPath }) };
    if (!existsSync(ctx.packageDir)) return { early: failed(tool, 'package_missing', { package: PACKAGE_ROOT }) };
  }
  ctx.bin = findNativeClient(tool, { env, home });
  if (!ctx.bin) return { early: missingClient(tool) };
  ctx.details = (extra = {}) => ({ tool, plugin_id: ctx.pluginId, catalog: catalogName, harness: real, binary: ctx.bin, calls: ctx.calls, ...extra });
  return { ctx };
}

const samePath = (a, b) => { try { return realpathSync(a) === realpathSync(b); } catch { return false; } };
const within = (path, dir) => { try { const p = realpathSync(path); const d = realpathSync(dir); return p === d || p.startsWith(d + sep); } catch { return false; } };

/** The marketplace this name points to, from a native listing; any shape, by name. */
function listedMarketplace(json, name) {
  const rows = Array.isArray(json) ? json : (json?.marketplaces || []);
  const row = rows.find((r) => r?.name === name);
  if (!row) return null;
  // Claude Code's `source` is a type word ("directory"); only an absolute path names a folder.
  const sourcePath = typeof row.source === 'string' && isAbsolute(row.source) ? row.source : undefined;
  return { row, path: row.path || row.root || row.installLocation || row.source?.path || sourcePath };
}

/**
 * Refuse to touch a marketplace name that already points somewhere else. A listing
 * that names the catalog but gives no path proves nothing either way: unverified, pending.
 */
function marketplaceConflict(ctx) {
  const listed = run(ctx, ['plugin', 'marketplace', 'list', '--json']);
  if (listed.status !== 0 || listed.json === undefined) return { error: failed(ctx.tool, 'marketplace_list_failed', ctx.details({ message: listed.error })) };
  const found = listedMarketplace(listed.json, ctx.catalogName);
  if (found && !found.path) {
    return { error: pending(ctx.tool, `${PRODUCT_OF(ctx)} lists this folder's catalog "${ctx.catalogName}" without saying which folder it reads, so Orion cannot confirm it belongs here and changed nothing. Run Orion's plugin setup again from this folder (node update/plugin-setup.mjs resume); if this keeps happening, send the output to Daily Practice.`, 'catalog_path_unverified', ctx.details()) };
  }
  if (found && !samePath(found.path, ctx.real)) {
    return { error: failed(ctx.tool, 'catalog_name_points_elsewhere', ctx.details({ remaining: 'Another folder already uses this catalog name. Nothing was changed.' })) };
  }
  return { registered: Boolean(found) };
}

const PRODUCT_OF = (ctx) => TOOL_LAYOUT[ctx.tool].product;
/** A sentence continued after a comma. */
export const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/** This harness's Orion row in a Codex `plugin list`, in any of its listing shapes. */
function codexRow(ctx, json) {
  const rows = Array.isArray(json) ? json : (json?.plugins || json?.installed || []);
  return rows.find((r) => r?.id === ctx.pluginId
    || (r?.name === 'orion' && [r.marketplace, r.marketplaceName, r.marketplace_name].includes(ctx.catalogName)));
}

const okOutcome = (call) => call.json?.outcome === 'ok' || call.json?.failureCode === 'already_in_goal_state' || call.json?.alreadyInGoalState === true;

function claudeInspect(ctx) {
  const listed = run(ctx, ['plugin', 'list', '--json']);
  if (listed.status !== 0 || !Array.isArray(listed.json)) return { result: failed(ctx.tool, 'plugin_list_failed', ctx.details({ message: listed.error })) };
  const rows = listed.json.filter((row) => row?.id === ctx.pluginId);
  const row = rows.find((r) => r.scope === 'local' && r.projectPath && samePath(r.projectPath, ctx.real));
  const fresh = 'Start a fresh Claude Code session in this folder (or run /reload-plugins) to load the Orion skills.';
  if (!row) return { result: pending(ctx.tool, `Install Orion for this folder: from this folder run "claude plugin install ${ctx.pluginId} --scope local", then ${lowerFirst(fresh)}`, 'not_installed_here', ctx.details({ other_scopes: rows.map((r) => r.scope) })) };
  const errors = [...(row.errors || []), ...(row.errorDetails ? [].concat(row.errorDetails) : [])];
  if (errors.length) return { result: failed(ctx.tool, 'plugin_reports_errors', ctx.details({ errors })), row };
  if (!row.readFromFolder || !within(row.readFromFolder, ctx.packageDir)) return { result: failed(ctx.tool, 'source_outside_harness_package', ctx.details({ source: row.readFromFolder || row.installPath || null })), row };
  const found = row.folderVersion || row.version;
  if (found !== ctx.version) return { result: failed(ctx.tool, 'version_mismatch', ctx.details({ expected: ctx.version, found })), row };
  if (row.enabled !== true) return { result: pending(ctx.tool, `Enable Orion for this folder: from this folder run "claude plugin enable ${ctx.pluginId} --scope local".`, 'disabled', ctx.details()), row, disabled: true };
  // The install record is not discovery: Claude Code's own inventory must show every shipped skill.
  const inventory = claudeSkills(ctx);
  const expected = packageSkills(ctx);
  // Names are compared when the inventory line lists them; otherwise the count must match.
  const missing = inventory.names ? expected.filter((name) => !inventory.names.includes(name)) : [];
  if (!expected.length || inventory.count !== expected.length || missing.length) {
    return { result: pending(ctx.tool, `Claude Code has Orion installed here but does not yet show its ${expected.length} skills. ${fresh} Then run Orion's plugin setup check again (node update/plugin-setup.mjs verify).`, 'skills_not_discovered', ctx.details({ expected: expected.length, found: inventory.count ?? null, missing, message: inventory.error })), row };
  }
  return { result: { state: 'complete', details: ctx.details({ version: found, scope: 'local', source: row.readFromFolder, skills: inventory.names, verified_by: `claude plugin list --json; claude plugin details ${ctx.pluginId}`, next: fresh }) }, row };
}

/** The shipped skill names: every folder under the package's skills/ holding a SKILL.md. */
function skillNames(dir) {
  try { return readdirSync(dir).filter((name) => isFile(join(dir, name, 'SKILL.md'))).sort(); }
  catch { return null; }
}
const packageSkills = (ctx) => skillNames(join(ctx.packageDir, 'skills')) || [];

/**
 * `claude plugin details` has no JSON mode; its component inventory reads
 * "Skills (N)  a, b, c". Names are taken only when the line lists exactly N of them.
 */
function claudeSkills(ctx) {
  const shown = run(ctx, ['plugin', 'details', ctx.pluginId]);
  if (shown.status !== 0) return { error: shown.error || 'plugin details failed' };
  const text = `${shown.stdout || ''}`;
  const line = text.split(/\r?\n/).map((l) => l.match(/^\s*Skills\s*\((\d+)\)\s*(.*)$/)).find(Boolean);
  if (!line) return { error: 'no skill inventory in plugin details' };
  const count = Number(line[1]);
  const names = line[2].split(/[,\s]+/).map((n) => n.replace(/^orion:/, '')).filter(Boolean);
  return { count, names: names.length === count ? names.sort() : undefined };
}

function claudeSetup(ctx) {
  for (const target of [ctx.packageDir, ctx.real]) {
    const checked = run(ctx, ['plugin', 'validate', target, '--json']);
    if (checked.status !== 0 || checked.json?.success !== true) return failed(ctx.tool, 'validation_failed', ctx.details({ target, report: checked.json ?? checked.error }));
  }
  const conflict = marketplaceConflict(ctx);
  if (conflict.error) return conflict.error;
  const added = run(ctx, ['plugin', 'marketplace', 'add', ctx.real, '--scope', 'local', '--json']);
  if (!okOutcome(added)) return failed(ctx.tool, 'marketplace_add_failed', ctx.details({ report: added.json ?? added.error }));
  const installed = run(ctx, ['plugin', 'install', ctx.pluginId, '--scope', 'local', '--json']);
  if (!okOutcome(installed)) return failed(ctx.tool, 'install_failed', ctx.details({ report: installed.json ?? installed.error }));
  const inspected = claudeInspect(ctx);
  if (!inspected.disabled) return inspected.result;
  const enabled = run(ctx, ['plugin', 'enable', ctx.pluginId, '--scope', 'local', '--json']);
  if (!okOutcome(enabled)) return failed(ctx.tool, 'enable_failed', ctx.details({ report: enabled.json ?? enabled.error }));
  return claudeInspect(ctx).result;
}

export function setupPlugin(options = {}) {
  const { ctx, early } = prepare(options);
  if (early) return early;
  return ctx.tool === 'claude-code' ? claudeSetup(ctx) : codexSetup(ctx);
}

export function verifyPlugin(options = {}) {
  const { ctx, early } = prepare(options);
  if (early) return early;
  return ctx.tool === 'claude-code' ? claudeVerify(ctx) : codexVerify(ctx);
}

function claudeVerify(ctx) {
  const conflict = marketplaceConflict(ctx);
  return conflict.error || claudeInspect(ctx).result;
}

const codexInstallAction = () => `In Codex, from this folder, open the Plugins Directory (desktop app) or type /plugins (CLI), search for "orion" and install Orion; then start a fresh chat in this folder.`;
const CODEX_FRESH = 'Start a fresh chat in this folder so Codex loads the Orion skills.';
const CODEX_RESUME = 'node update/plugin-setup.mjs resume';

/** The plugin manifest version in a Codex cached copy: the portable root manifest first. */
function cachedVersion(dir) {
  for (const rel of ['plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    try { const version = JSON.parse(readFileSync(join(dir, rel), 'utf8')).version; if (version) return version; } catch { /* next */ }
  }
  return null;
}

/**
 * Codex discovery evidence, read from the harness folder: Codex lists this folder's catalog
 * (from its project config), lists Orion installed and on, Orion is not switched on
 * user-wide, and the copy Codex actually loads, its cache, holds this release and every
 * shipped skill. Codex caches a local plugin under the version `local`.
 */
function codexInspect(ctx) {
  const seen = marketplaceConflict(ctx);
  if (seen.error) return seen.error;
  if (!seen.registered) {
    return pending(ctx.tool, `Codex reads this folder's Orion settings (${CODEX_PROJECT_CONFIG}) only once you trust the folder. Open this folder in Codex and choose to trust it when Codex asks; then run Orion's plugin setup again from this folder (${CODEX_RESUME}).`, 'project_not_trusted', ctx.details());
  }
  const listed = run(ctx, ['plugin', 'list', '--json']);
  if (listed.status !== 0 || listed.json === undefined) return failed(ctx.tool, 'plugin_list_failed', ctx.details({ message: listed.error }));
  const row = codexRow(ctx, listed.json);
  if (!row || row.installed === false) return pending(ctx.tool, codexInstallAction(ctx), 'not_installed', ctx.details());
  if (row.enabled === false) return pending(ctx.tool, `In Codex, type /plugins from this folder and switch Orion (${ctx.pluginId}) on; then start a fresh chat in this folder.`, 'disabled', ctx.details());
  // Orion stays on for this folder only: a user-wide switch would load it in every folder.
  const user = codexUserEntries(ctx.catalogName, { env: ctx.env, home: ctx.home });
  if (user.enabled === true) {
    return pending(ctx.tool, `Codex has switched Orion on in your Codex user settings (${join(codexHome({ env: ctx.env, home: ctx.home }), 'config.toml')}, the [plugins."${ctx.pluginId}"] entry), which would load it in every folder, not only this one. Orion does not edit those settings, so its setup stays unfinished: delete that entry there (this folder's own ${CODEX_PROJECT_CONFIG} keeps Orion on here), then run "node update/plugin-setup.mjs verify" from this folder.`, 'enabled_user_wide', ctx.details());
  }
  const reinstall = (found) => `In Codex, from this folder, open the Plugins Directory (desktop app) or type /plugins (CLI), search for "orion" and reinstall Orion so the copy Codex loads moves${found ? ` from ${found}` : ''} to ${ctx.version}; then start a fresh chat in this folder.`;
  if (row.version && row.version !== 'local' && row.version !== ctx.version) {
    return pending(ctx.tool, reinstall(row.version), 'cached_copy_outdated', ctx.details({ expected: ctx.version, found: row.version }));
  }
  const cache = join(codexHome({ env: ctx.env, home: ctx.home }), 'plugins/cache', ctx.catalogName, 'orion', row.version || 'local');
  const found = cachedVersion(cache);
  if (!found) {
    return pending(ctx.tool, `Codex lists Orion as installed, but Orion cannot read the copy Codex loads (${cache}) to confirm its version. ${reinstall(null)}`, 'version_unconfirmed', ctx.details({ cache, found: row.version ?? null }));
  }
  if (found !== ctx.version) return pending(ctx.tool, reinstall(found), 'cached_copy_outdated', ctx.details({ cache, expected: ctx.version, found }));
  const expected = packageSkills(ctx);
  const cached = skillNames(join(cache, 'skills')) || [];
  const missing = expected.filter((name) => !cached.includes(name));
  if (!expected.length || missing.length) return pending(ctx.tool, reinstall(null), 'cached_copy_outdated', ctx.details({ cache, missing }));
  return { state: 'complete', details: ctx.details({ version: found, scope: 'project', source: cache, skills: cached.filter((name) => expected.includes(name)), verified_by: `codex plugin marketplace list --json; codex plugin list --json; cached copy ${cache}`, next: CODEX_FRESH }) };
}

/**
 * Codex registration is project-scoped: this folder's own .codex/config.toml names the
 * catalog and switches Orion on, and nothing is written user-wide. There is no
 * `codex plugin marketplace add` (it writes the user's config) and no unattended install.
 */
function codexSetup(ctx) {
  const before = marketplaceConflict(ctx);
  if (before.error) return before.error;
  writeCodexProjectConfig(ctx.real, ctx.catalogName, ctx.real);
  return codexInspect(ctx);
}

function codexVerify(ctx) {
  const project = codexProjectEntries(ctx.real, ctx.catalogName);
  if (!project.marketplace || !samePath(project.marketplace.source || '', ctx.real) || project.enabled !== true) {
    return pending(ctx.tool, `This folder's Codex settings (${CODEX_PROJECT_CONFIG}) do not yet name its Orion catalog. Run Orion's plugin setup from this folder (${CODEX_RESUME}).`, 'project_config_missing', ctx.details());
  }
  return codexInspect(ctx);
}
const goneAlready = (call) => okOutcome(call) || /not[_ ]installed|not[_ ]found/i.test(`${call.json?.failureCode || ''} ${call.json?.message || ''}`);

function claudeRetire(ctx, registered) {
  if (!registered) return { state: 'complete', details: ctx.details({ retired: 'nothing registered' }) };
  const removed = run(ctx, ['plugin', 'uninstall', ctx.pluginId, '--scope', 'local', '--json']);
  if (!goneAlready(removed)) return failed(ctx.tool, 'uninstall_failed', ctx.details({ report: removed.json ?? removed.error }));
  // Always scoped: an unscoped remove would drop the declaration from every scope.
  const dropped = run(ctx, ['plugin', 'marketplace', 'remove', ctx.catalogName, '--scope', 'local', '--json']);
  if (!goneAlready(dropped)) return failed(ctx.tool, 'marketplace_remove_failed', ctx.details({ report: dropped.json ?? dropped.error }));
  return { state: 'complete', details: ctx.details({ retired: ctx.pluginId }) };
}

function codexRetire(ctx) {
  const seen = marketplaceConflict(ctx);
  if (seen.error) return seen.error;
  const project = codexProjectEntries(ctx.real, ctx.catalogName);
  const user = codexUserEntries(ctx.catalogName, { env: ctx.env, home: ctx.home });
  if (!seen.registered && !project.text && !user.marketplace) return { state: 'complete', details: ctx.details({ retired: 'nothing registered' }) };
  const listed = run(ctx, ['plugin', 'list', '--json']);
  // An unreadable list proves nothing is installed no more than that something is: stop.
  if (listed.status !== 0 || listed.json === undefined) return failed(ctx.tool, 'plugin_list_failed', ctx.details({ message: listed.error }));
  if (codexRow(ctx, listed.json)) {
    const removed = run(ctx, ['plugin', 'remove', ctx.pluginId, '--json']);
    if (removed.status !== 0) return failed(ctx.tool, 'uninstall_failed', ctx.details({ report: removed.json ?? removed.error }));
  }
  removeCodexProjectConfig(ctx.real, ctx.catalogName);
  // A user-wide registration of this harness's own uniquely named catalog, if one was made.
  if (user.marketplace) {
    const dropped = run(ctx, ['plugin', 'marketplace', 'remove', ctx.catalogName, '--json']);
    if (dropped.status !== 0) return failed(ctx.tool, 'marketplace_remove_failed', ctx.details({ report: dropped.json ?? dropped.error }));
  }
  return { state: 'complete', details: ctx.details({ retired: ctx.pluginId }) };
}

/**
 * Retire one tool's Orion enablement for this harness: its plugin install and its catalog
 * registration, and nothing else. A catalog name registered from another folder is never touched.
 */
export function retirePlugin(options = {}) {
  const { ctx, early } = prepare({ ...options, requireCatalog: false });
  if (early) return early;
  if (ctx.tool === 'codex') return codexRetire(ctx);
  const conflict = marketplaceConflict(ctx);
  return conflict.error || claudeRetire(ctx, conflict.registered);
}
