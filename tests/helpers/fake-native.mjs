#!/usr/bin/env node
/**
 * A stand-in for the native `claude` and `codex` plugin CLIs, for tests only.
 * argv[2] names the tool; the rest is what the real CLI would receive.
 * State lives in the JSON file named by FAKE_NATIVE_STATE; every call is logged there.
 * It never reaches a real tool, a real home folder or the network.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const statePath = process.env.FAKE_NATIVE_STATE;
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const [tool, ...args] = process.argv.slice(2);
state.calls ||= [];
state.calls.push({ tool, args, cwd: realpathSync(process.cwd()) });
const faults = state.faults || {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const out = (value) => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
const finish = (code = 0) => { save(); process.exit(code); };
const flag = (name) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

if (args[0] !== 'plugin') { out('unexpected'); finish(9); }
const [, verb, sub, target] = args;

if (tool === 'claude') {
  const c = (state.claude ||= { marketplaces: {}, installs: {} });
  if (verb === 'validate') {
    if (faults.validate) { out({ success: false, contents: [{ errors: ['broken'] }] }); finish(1); }
    out({ success: true, target: sub }); finish(0);
  }
  if (verb === 'marketplace' && sub === 'list') {
    out(Object.entries(c.marketplaces).map(([name, m]) => (faults.listNoPath ? { name, source: 'directory' } : { name, source: 'directory', path: m.path, installLocation: m.path }))); finish(0);
  }
  if (verb === 'marketplace' && sub === 'add') {
    const name = readJson(join(target, '.claude-plugin/marketplace.json')).name;
    const scope = flag('--scope') || 'user';
    const known = c.marketplaces[name];
    if (known && known.path !== target) { out({ command: 'marketplace-add', outcome: 'failed', message: 'name taken', failureCode: 'name_conflict' }); finish(1); }
    c.marketplaces[name] = { path: target, scopes: [...new Set([...(known?.scopes || []), scope])] };
    out({ command: 'marketplace-add', outcome: 'ok', message: known ? `Marketplace '${name}' already on disk` : `Successfully added marketplace: ${name}`, marketplace: name }); finish(0);
  }
  if (verb === 'marketplace' && sub === 'remove') {
    const scope = flag('--scope');
    c.removedUnscoped ||= 0;
    if (!scope) c.removedUnscoped += 1;
    delete c.marketplaces[target];
    out({ command: 'marketplace-remove', outcome: 'ok' }); finish(0);
  }
  const [, plugin] = args.slice(1);
  if (verb === 'install') {
    const [, mkt] = plugin.split('@');
    if (args.includes('--marketplace')) { out({ command: 'install', outcome: 'failed', message: 'forbidden in tests' }); finish(1); }
    if (!c.marketplaces[mkt]) { out({ command: 'install', outcome: 'failed', message: 'unknown marketplace', failureCode: 'marketplace_not_found' }); finish(1); }
    const key = `${plugin}|${realpathSync(process.cwd())}`;
    if (c.installs[key]) { out({ command: 'install', outcome: 'ok', message: `Plugin "${plugin}" is already installed (scope: local)` }); finish(0); }
    c.installs[key] = { id: plugin, scope: flag('--scope') || 'user', enabled: !faults.installDisabled, projectPath: realpathSync(process.cwd()) };
    out({ command: 'install', outcome: 'ok', pluginId: plugin, scope: flag('--scope') }); finish(0);
  }
  if (verb === 'enable' || verb === 'disable') {
    const want = verb === 'enable';
    const record = c.installs[`${plugin}|${realpathSync(process.cwd())}`];
    if (!record) { out({ command: verb, outcome: 'failed', failureCode: 'not_installed' }); finish(1); }
    if (record.enabled === want) { out({ command: verb, outcome: 'failed', failureCode: 'already_in_goal_state', alreadyInGoalState: true }); finish(1); }
    record.enabled = want; out({ command: verb, outcome: 'ok' }); finish(0);
  }
  if (verb === 'uninstall') {
    delete c.installs[`${plugin}|${realpathSync(process.cwd())}`];
    out({ command: 'uninstall', outcome: 'ok' }); finish(0);
  }
  if (verb === 'details') {
    // Text only, as the real CLI: a header, then a component inventory.
    const record = c.installs[`${sub}|${realpathSync(process.cwd())}`];
    if (!record || faults.detailsFails) { process.stderr.write(`Plugin "${sub}" is not loaded\n`); finish(1); }
    const skillsDir = join(c.marketplaces[sub.split('@')[1]]?.path || '/nowhere', 'plugins/orion/skills');
    const skills = faults.detailsSkills || (existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'SKILL.md'))).sort() : []);
    out(`${sub}\nComponent inventory\n  Skills (${skills.length})  ${skills.join(', ')}\n  Token cost  ~1.2k`); finish(0);
  }
  if (verb === 'list') {
    const cwd = realpathSync(process.cwd());
    const rows = Object.values(c.installs).filter((r) => r.scope === 'user' || r.projectPath === cwd).map((r) => {
      const folder = join(c.marketplaces[r.id.split('@')[1]]?.path || '/nowhere', 'plugins/orion');
      const manifest = join(folder, '.claude-plugin/plugin.json');
      const folderVersion = existsSync(manifest) ? readJson(manifest).version : 'unknown';
      return { id: r.id, version: folderVersion, scope: r.scope, enabled: r.enabled, installPath: folder, readFromFolder: folder, folderVersion, projectPath: r.projectPath, errors: [], ...(faults.listOverride || {}) };
    });
    out(rows); finish(0);
  }
}

if (tool === 'codex') {
  const c = (state.codex ||= { marketplaces: {}, installed: [], adds: 0 });
  if (verb === 'marketplace' && sub === 'list') {
    out({ marketplaces: Object.entries(c.marketplaces).map(([name, root]) => (faults.listNoPath ? { name } : { name, root })) }); finish(0);
  }
  if (verb === 'marketplace' && sub === 'add') {
    if (faults.codexAdd) { out({ error: 'cannot add' }); finish(1); }
    const name = readJson(join(target, '.agents/plugins/marketplace.json')).name;
    c.adds += 1; c.marketplaces[name] = target;
    out({ name, root: target }); finish(0);
  }
  if (verb === 'marketplace' && sub === 'remove') {
    delete c.marketplaces[target]; out({ removed: target }); finish(0);
  }
  if (verb === 'list') {
    if (faults.codexListFails) { process.stderr.write('cannot read plugins\n'); finish(1); }
    out(c.installed); finish(0);
  }
  if (verb === 'remove') {
    c.installed = c.installed.filter((p) => p.id !== sub); out({ removed: sub }); finish(0);
  }
  if (verb === 'add') { c.forbiddenAdd = true; out({ error: 'not used by Orion' }); finish(1); }
}

out('unhandled'); finish(9);
