/** Resolve a deployed harness's selected destinations and file ownership. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path, name) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`Cannot read ${name} at ${path}: ${error.message}`); }
}

export function safePath(root, path) {
  if (typeof path !== 'string' || !path || path === '.' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
    throw new Error(`Invalid deployment path: ${path}`);
  }
  const target = resolve(root, path);
  if (target === resolve(root) || relative(root, target).startsWith(`..${sep}`)) {
    throw new Error(`Deployment path escapes root: ${path}`);
  }
  let part = resolve(root);
  for (const segment of path.split('/')) {
    part = join(part, segment);
    try { if (lstatSync(part).isSymbolicLink()) throw new Error(`Symlink collision: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

export function selectedTool(status, deployment, { legacyTool } = {}) {
  const recorded = status?.selected_tool;
  if (recorded == null && legacyTool != null) {
    if (legacyTool !== 'claude-code') throw new Error('Legacy migration requires explicit --legacy-tool claude-code');
    return legacyTool;
  }
  if (recorded == null) throw new Error('Missing status.selected_tool; use --legacy-tool claude-code only for an explicit legacy migration');
  if (!deployment.tools.includes(recorded)) throw new Error(`Invalid status.selected_tool: ${recorded}`);
  if (legacyTool != null) throw new Error('--legacy-tool applies only when status.selected_tool is missing');
  return recorded;
}

export function fingerprint(contents) {
  return createHash('sha256').update(Buffer.from(contents).toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
}

export function destinationState(root, entry, pristine) {
  const target = safePath(root, entry.destination);
  // A symlink anywhere in a destination is a collision, even if its target
  // happens to have the expected bytes. Never read through it for ownership.
  let part = resolve(root);
  for (const segment of entry.destination.split('/')) {
    part = join(part, segment);
    try { if (lstatSync(part).isSymbolicLink()) return 'preserve'; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!existsSync(target)) return 'absent';
  if (!lstatSync(target).isFile()) return 'preserve';
  if (entry.ownership === 'client-template') return 'client-owned';
  const known = pristine.files?.[entry.fingerprint_key] || [];
  return known.includes(fingerprint(readFileSync(target))) ? 'owned' : 'preserve';
}

/** The sole source-to-destination mapper for release and deployed harnesses. */
export function planForTool(deployment, tool, { releaseRoot = RELEASE_ROOT, root } = {}) {
  if (!deployment.tools.includes(tool)) throw new Error(`Unsupported selected tool: ${tool || '(missing)'}`);
  const actualSkills = (existsSync(join(releaseRoot, 'skills')) ? readdirSync(join(releaseRoot, 'skills'), { withFileTypes: true }) : [])
    .filter((item) => item.isDirectory() && existsSync(join(releaseRoot, 'skills', item.name, 'SKILL.md')))
    .map((item) => `skills/${item.name}/SKILL.md`).sort();
  const mappedSkills = deployment.entries.filter((entry) => entry.source.startsWith('skills/'));
  const skillSources = mappedSkills.map((entry) => entry.source).sort();
  if (JSON.stringify(actualSkills) !== JSON.stringify(skillSources)) throw new Error('Deployment skill mappings must cover every skills/*/SKILL.md exactly once');
  for (const entry of mappedSkills) for (const selected of deployment.tools) {
    const expected = `${selected === 'codex' ? '.agents' : '.claude'}/skills/${entry.source.slice('skills/'.length)}`;
    if (entry.destinations?.[selected] !== expected) throw new Error(`Invalid skill mapping for ${entry.source} (${selected})`);
  }
  const entries = [
    ...deployment.common_sources.map((source) => ({ source, destination: source, ownership: 'release', fingerprint_key: source })),
    ...deployment.entries.map((entry) => ({ source: entry.sources?.[tool] || entry.source, destination: entry.destinations[tool], ownership: entry.ownership, fingerprint_key: entry.sources?.[tool] || entry.fingerprint_key })),
  ];
  const destinations = new Set();
  for (const entry of entries) {
    safePath(releaseRoot, entry.source);
    safePath(root || releaseRoot, entry.destination);
    if (!existsSync(join(releaseRoot, entry.source))) throw new Error(`Missing release source: ${entry.source}`);
    if (destinations.has(entry.destination)) throw new Error(`Duplicate destination: ${entry.destination}`);
    destinations.add(entry.destination);
  }
  return entries;
}

export function resolveDestinations({ root, releaseRoot = RELEASE_ROOT, legacyTool } = {}) {
  if (!root) throw new Error('A deployed harness root is required');
  const manifest = readJson(join(releaseRoot, 'update/manifest.json'), 'release manifest');
  const pristine = readJson(join(releaseRoot, 'update/pristine.json'), 'fingerprint registry');
  const status = readJson(join(root, 'status/status.json'), 'harness status');
  const tool = selectedTool(status, manifest.deployment, { legacyTool });
  const entries = planForTool(manifest.deployment, tool, { releaseRoot, root });
  return { selected_tool: tool, legacy_migration: status.selected_tool == null, entries: entries.map((entry) => ({ ...entry, state: destinationState(root, entry, pristine) })) };
}

/** Paths used by a running client harness, from its recorded tool and release map. */
export function runtimeLayout(root, { legacyTool } = {}) {
  const manifest = readJson(join(root, 'update/manifest.json'), 'deployment manifest');
  const status = readJson(join(root, 'status/status.json'), 'harness status');
  const tool = selectedTool(status, manifest.deployment, { legacyTool });
  const skill = manifest.deployment.entries.find((entry) => entry.source === 'skills/create-skill/SKILL.md');
  const roster = manifest.deployment.entries.find((entry) => entry.source === 'agents/README.md');
  if (!skill?.destinations?.[tool] || !roster?.destinations?.[tool]) throw new Error(`Missing runtime destinations for ${tool}`);
  const skillRoot = dirname(dirname(skill.destinations[tool]));
  const rosterPath = roster.destinations[tool];
  safePath(root, skillRoot);
  safePath(root, rosterPath);
  return { tool, skillRoot, rosterPath, jobRoot: dirname(rosterPath) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const value = (flag) => { const at = process.argv.indexOf(flag); return at < 0 ? undefined : process.argv[at + 1]; };
    console.log(JSON.stringify(resolveDestinations({ root: value('--root'), legacyTool: value('--legacy-tool') }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
