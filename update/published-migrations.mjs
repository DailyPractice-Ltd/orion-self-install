/** Preflight and interpret local-only migration scripts from the pinned source. */
import { lstatSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fingerprint, safePath } from './destination-resolver.mjs';
import { compareVersions } from './published-release.mjs';

export const statusFile = 'status/status.json';
export const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const cleanInstall =
  'Keep this harness and use a separate clean install if no supported migration is available.';
const operations = new Set(['add', 'replace', 'retire']);
const instructions = new Set([
  'write-text',
  'replace-text',
  'remove',
  'prepare-separate-harness-status',
]);

function pathSegments(path) {
  if (
    typeof path !== 'string' ||
    path
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          /[\\:\u0000-\u001f]/.test(segment),
      )
  ) {
    throw new Error(`Invalid migration path: ${path}`);
  }
  return path.toLowerCase().split('/');
}

function migrationDestination(path) {
  const segments = pathSegments(path);
  if (
    ['.git', '.update-backup'].includes(segments[0]) ||
    path.toLowerCase() === 'status/radio.key' ||
    (path.toLowerCase() === statusFile && path !== statusFile)
  ) {
    throw new Error(`Reserved migration path: ${path}`);
  }
}

function exists(root, path) {
  try {
    lstatSync(safePath(root, path));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function verifiedLayout(root, rule, read) {
  if (
    !Array.isArray(rule.anchors) ||
    !rule.anchors.length ||
    new Set(rule.anchors.map((anchor) => anchor?.path)).size !==
      rule.anchors.length ||
    !Array.isArray(rule.absent_paths)
  ) {
    throw new Error('Invalid starting layout verification declaration.');
  }
  for (const anchor of rule.anchors) {
    pathSegments(anchor?.path);
    if (anchor.path === statusFile || !/^[a-f0-9]{64}$/.test(anchor.sha256))
      throw new Error('Invalid starting layout fingerprint.');
    const actual = read(root, anchor.path);
    if (!actual || fingerprint(actual.bytes) !== anchor.sha256) return false;
  }
  return rule.absent_paths.every((path) => {
    pathSegments(path);
    return !exists(root, path);
  });
}

export function selectPath({ root, manifest, status, previous, read }) {
  const { template_version: version, selected_tool: tool } = status;
  const verificationNeeded = !previous || tool == null;
  const error = verificationNeeded
    ? `Starting release or tool needs a declared verification migration. ${cleanInstall}`
    : `Expected one supported update path from ${version} for ${tool}. ${cleanInstall}`;
  if (
    !versionPattern.test(version) ||
    !Array.isArray(manifest.update_compatibility)
  )
    throw new Error(error);
  const candidates = manifest.update_compatibility.filter(
    (entry) =>
      entry?.from_version === version &&
      manifest.deployment.tools.includes(entry.tool) &&
      (verificationNeeded || entry.starting_layout !== 'legacy-same-folder') &&
      (tool == null
        ? entry.verification?.infer_tool === true
        : entry.tool === tool) &&
      (!verificationNeeded || entry.verification),
  );
  let paths;
  try {
    paths = candidates.filter(
      (entry) =>
        !entry.verification || verifiedLayout(root, entry.verification, read),
    );
  } catch (failure) {
    throw new Error(`${error} ${failure.message}`);
  }
  if (paths.length !== 1) throw new Error(error);
  const path = paths[0];
  if (
    path.starting_layout &&
    !['deployed', 'legacy-same-folder'].includes(path.starting_layout)
  )
    throw new Error('Invalid migration starting layout.');
  if (path.starting_layout === 'legacy-same-folder' && !path.verification)
    throw new Error(
      'Same-folder migration requires starting layout verification.',
    );
  return path;
}

export function preflightSteps(checkout, path, version) {
  if (!Array.isArray(path.steps))
    throw new Error('Missing migration path steps.');
  let expected = path.from_version;
  const scripts = new Set();
  const steps = path.steps.map((step) => {
    if (
      step?.from_version !== expected ||
      !versionPattern.test(step.to_version) ||
      compareVersions(`v${step.to_version}`, `v${expected}`) <= 0 ||
      compareVersions(`v${step.to_version}`, `v${version}`) > 0
    ) {
      throw new Error('Missing, ambiguous, or out-of-order migration step.');
    }
    expected = step.to_version;
    pathSegments(step.script);
    if (
      !/^update\/migrations\/.+\.json$/.test(step.script) ||
      scripts.has(step.script)
    )
      throw new Error(
        'Each migration step requires a distinct pinned local JSON script.',
      );
    scripts.add(step.script);
    if (!Array.isArray(step.changes) || !step.changes.length)
      throw new Error('Missing intended local change declarations.');
    const changes = new Map();
    for (const change of step.changes) {
      migrationDestination(change?.path);
      if (
        !operations.has(change.operation) ||
        changes.has(change.path.toLowerCase())
      )
        throw new Error('Invalid or ambiguous intended local change.');
      changes.set(change.path.toLowerCase(), change);
    }
    const script = safePath(checkout, step.script);
    if (!lstatSync(script).isFile())
      throw new Error(`Invalid pinned migration script: ${step.script}`);
    const program = JSON.parse(readFileSync(script, 'utf8'));
    if (!Array.isArray(program) || !program.length)
      throw new Error(`Empty pinned migration script: ${step.script}`);
    for (const instruction of program) {
      migrationDestination(instruction?.path);
      if (
        !instructions.has(instruction.op) ||
        changes.get(instruction.path.toLowerCase())?.path !== instruction.path
      )
        throw new Error(
          `Undeclared or unsupported migration operation: ${instruction.path}`,
        );
      if (
        (instruction.path === statusFile &&
          !['replace-text', 'prepare-separate-harness-status'].includes(
            instruction.op,
          )) ||
        (instruction.op === 'prepare-separate-harness-status' &&
          (instruction.path !== statusFile ||
            path.starting_layout !== 'legacy-same-folder'))
      )
        throw new Error('Unsupported status migration instruction.');
      if (
        (instruction.op === 'write-text' &&
          typeof instruction.text !== 'string') ||
        (instruction.op === 'replace-text' &&
          (typeof instruction.find !== 'string' ||
            !instruction.find ||
            typeof instruction.replace !== 'string'))
      )
        throw new Error(
          `Invalid migration text instruction: ${instruction.path}`,
        );
    }
    return { step, changes, program };
  });
  if (steps.length && expected !== version)
    throw new Error('Migration path does not reach the selected release.');
  return steps;
}

class TextFragmentConflict extends Error {}

function updatedValue(current, instruction, defaults) {
  const { path, op } = instruction;
  if (op === 'remove') return null;
  const mode = current?.mode ?? 0o600;
  if (op === 'write-text')
    return { bytes: Buffer.from(instruction.text), mode };
  if (!current) throw new Error(`Migration input is missing: ${path}`);
  if (op === 'replace-text') {
    const text = current.bytes.toString('utf8');
    const index = text.indexOf(instruction.find);
    if (
      !Buffer.from(text).equals(current.bytes) ||
      index < 0 ||
      text.indexOf(instruction.find, index + 1) >= 0
    )
      throw new TextFragmentConflict(
        `Migration needs one matching text fragment: ${path}`,
      );
    return {
      bytes: Buffer.from(
        text.slice(0, index) +
          instruction.replace +
          text.slice(index + instruction.find.length),
      ),
      mode,
    };
  }
  const old = JSON.parse(current.bytes);
  const next = {
    ...defaults,
    ...old,
    selected_tool: old.selected_tool,
    applied_release: old.applied_release,
    schema_version: defaults.schema_version,
    checklist: { ...defaults.checklist, ...old.checklist },
    scopes: { ...defaults.scopes, ...old.scopes },
    memory: { ...defaults.memory, ...old.memory },
    home: { enabled: false, branch: 'main' },
    notes: [
      old.notes,
      'Saved schedules need to be wired again in this new folder.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
  return { bytes: Buffer.from(JSON.stringify(next, null, 2) + '\n'), mode };
}

export function runSteps({ steps, read, defaults, reviewable = new Set() }) {
  const files = new Map();
  const original = new Map();
  const migrations = [];
  const blocked = new Map();
  const spellings = new Map();
  for (const { step, changes, program } of steps) {
    const before = new Map();
    for (const instruction of program) {
      const path = instruction.path;
      const key = path.toLowerCase();
      if (spellings.has(key) && spellings.get(key) !== path)
        throw new Error(`Inconsistent migration path spelling: ${path}`);
      spellings.set(key, path);
      if (blocked.has(path)) continue;
      if (!original.has(path)) original.set(path, read(path));
      const current = files.has(path) ? files.get(path) : original.get(path);
      if (!before.has(path)) before.set(path, current);
      try {
        files.set(path, updatedValue(current, instruction, defaults));
      } catch (error) {
        if (
          !(error instanceof TextFragmentConflict) ||
          !reviewable.has(path) ||
          changes.get(key).operation !== 'replace'
        )
          throw error;
        blocked.set(path, error);
        files.delete(path);
        before.delete(path);
      }
    }
    const changed = [];
    for (const [path, prior] of before) {
      const incoming = files.get(path);
      if (isDeepStrictEqual(prior, incoming)) continue;
      const operation = !prior ? 'add' : incoming ? 'replace' : 'retire';
      if (changes.get(path.toLowerCase()).operation !== operation)
        throw new Error(
          `Migration changed ${path} with undeclared operation: ${operation}`,
        );
      changed.push({ path, operation });
    }
    migrations.push({
      from_version: step.from_version,
      to_version: step.to_version,
      changed,
    });
  }
  if (files.has(statusFile)) {
    const before = JSON.parse(original.get(statusFile).bytes);
    const after = JSON.parse(files.get(statusFile).bytes);
    for (const field of [
      'applied_release',
      'template_version',
      'selected_tool',
      'sharing',
    ]) {
      if (!isDeepStrictEqual(before[field], after[field]))
        throw new Error(
          `Migration cannot change the recorded status field: ${field}`,
        );
    }
  }
  for (const [path, value] of files) {
    if (isDeepStrictEqual(original.get(path), value)) files.delete(path);
  }
  for (const migration of migrations) {
    migration.changed = migration.changed.filter(
      ({ path }) => !blocked.has(path),
    );
  }
  return { files, migrations, original, blocked };
}
