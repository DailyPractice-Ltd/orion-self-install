import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { plainEnv } from './helpers/env.mjs';
import { MANIFEST_PATHS, catalogIdentity, catalogName, catalogNameErrors, defaultPluginRegion, pluginManifests, validateCatalog, validatePackage, validatePluginManifest, writeCatalog } from '../update/plugin-package.mjs';
import { planForTool } from '../update/destination-resolver.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(readFileSync(join(repo, 'update/manifest.json'), 'utf8'));
const readJson = (path) => JSON.parse(readFileSync(join(repo, path), 'utf8'));

test('both committed plugin manifests are the generator output for this release', () => {
  assert.deepEqual(MANIFEST_PATHS, {
    codex: 'plugins/orion/plugin.json',
    'claude-code': 'plugins/orion/.claude-plugin/plugin.json',
  });
  const generated = pluginManifests(release.template_version);
  for (const path of Object.values(MANIFEST_PATHS)) {
    assert.equal(readFileSync(join(repo, path), 'utf8'), `${JSON.stringify(generated[path], null, 2)}\n`, `${path} is stale: run node update/plugin-package.mjs --write`);
    const manifest = readJson(path);
    assert.equal(manifest.name, 'orion');
    assert.equal(manifest.version, release.template_version);
    assert.equal(manifest.description, readJson(MANIFEST_PATHS.codex).description, 'one static product description');
  }
});

test('the release ships both manifests and no harness catalog, for either tool', () => {
  for (const tool of release.deployment.tools) {
    const destinations = planForTool(release.deployment, tool, { releaseRoot: repo }).map(entry => entry.destination);
    for (const path of Object.values(MANIFEST_PATHS)) assert.ok(destinations.includes(path), `${path} ships to ${tool}`);
    for (const path of ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']) {
      assert.ok(!destinations.includes(path), `${path} is per harness, never a release artifact`);
    }
  }
});

test('each manifest format validates on its own schema and rejects drift from the release', () => {
  for (const tool of ['codex', 'claude-code']) {
    const good = readJson(MANIFEST_PATHS[tool]);
    assert.deepEqual(validatePluginManifest(tool, good, { version: release.template_version }), [], `${tool} manifest is valid`);
    const errors = (change) => validatePluginManifest(tool, { ...structuredClone(good), ...change }, { version: release.template_version }).join('\n');
    assert.match(errors({ name: 'orion-plus' }), /name must be "orion"/);
    assert.match(errors({ version: ' ' }), /version must not be blank/);
    assert.match(errors({ version: '9.9.9' }), /version 9\.9\.9 must equal the release version 2\.0\.0/);
    assert.match(errors({ description: '' }), /description/);
    assert.match(errors({ skills: './elsewhere/' }), /skills/);
    assert.match(errors({ bogus: true }), /unknown key "bogus"/);
    assert.match(errors({ author: { email: 'x@example.com' } }), /author\.name/);
  }
  // Each format is checked against its own rules, not the other's.
  assert.match(validatePluginManifest('claude-code', readJson(MANIFEST_PATHS.codex)).join('\n'), /unknown key "\$schema"/);
  const logo = { ...readJson(MANIFEST_PATHS.codex), extensions: { 'com.openai': { interface: { logo: 'logo.png' } } } };
  assert.match(validatePluginManifest('codex', logo).join('\n'), /must start with \.\//);
  assert.throws(() => validatePluginManifest('cursor', {}), /Unsupported AI assistant/);
});

test('a catalog identity is random, made once, and names a valid catalog unique to the harness', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'acme-widgets-harness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'status'));
  const status = JSON.parse(readFileSync(join(repo, 'status/status.schema-template.json'), 'utf8'));
  Object.assign(status, { ai_assistant: 'claude-code', business_name: 'Acme Widgets' });
  status.sharing.install_token = 'orn_live_abcdefabcdefabcdefabcdef';
  writeFileSync(join(root, 'status/status.json'), JSON.stringify(status));

  const identity = await catalogIdentity(root);
  assert.match(identity, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await catalogIdentity(root), identity, 'resume, update, restore and switch reuse it');
  const saved = JSON.parse(readFileSync(join(root, 'status/status.json'), 'utf8'));
  assert.equal(saved.plugin.catalog_identity, identity);
  assert.equal(saved.business_name, 'Acme Widgets', 'the rest of the status is preserved');

  const name = catalogName(identity);
  assert.equal(name, `orion-${identity.replaceAll('-', '').slice(0, 12)}`);
  assert.match(name, /^orion-[0-9a-f]{12}$/, 'never the business name, folder basename or pairing key');
  assert.deepEqual(catalogNameErrors(name), []);
  assert.notEqual(catalogName(await catalogIdentity(mkHarness(t))), name, 'two harnesses never share a catalog name');
  assert.throws(() => catalogName('Acme Widgets'), /catalog identity/);
  for (const reserved of ['claude-plugins-official', 'agent-skills', 'claudeai-orion', 'inline', 'constructor', 'org', 'unknown', 'orion..x', '-orion', 'orión', 'a'.repeat(129)]) {
    assert.ok(catalogNameErrors(reserved).length > 0, `${reserved} is not a usable catalog name`);
  }
});

test('only the selected tool gets a catalog, and its source resolves to the package from the harness root', async (t) => {
  const identity = '0f1e2d3c-4b5a-4987-a6b5-c4d3e2f1a0b9';
  const expected = {
    codex: {
      path: '.agents/plugins/marketplace.json',
      catalog: {
        name: 'orion-0f1e2d3c4b5a',
        interface: { displayName: 'Orion' },
        plugins: [{ name: 'orion', source: { source: 'local', path: './plugins/orion' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
      },
    },
    'claude-code': {
      path: '.claude-plugin/marketplace.json',
      catalog: {
        name: 'orion-0f1e2d3c4b5a',
        description: 'Orion sales harness skills for this Orion folder',
        owner: { name: 'Daily Practice' },
        plugins: [{ name: 'orion', source: './plugins/orion', description: 'Orion sales harness skills. Requires an installed Orion harness folder.' }],
      },
    },
  };
  for (const [tool, { path, catalog }] of Object.entries(expected)) {
    const root = mkHarness(t);
    for (const file of Object.values(MANIFEST_PATHS)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), readFileSync(join(repo, file)));
    }
    assert.equal(writeCatalog(root, tool, identity), path);
    assert.deepEqual(JSON.parse(readFileSync(join(root, path), 'utf8')), catalog);
    const other = expected[tool === 'codex' ? 'claude-code' : 'codex'].path;
    assert.ok(!existsSync(join(root, other)), `${other} is not generated for ${tool}`);
    assert.deepEqual(validateCatalog(tool, catalog, { root, identity }), [], `${tool} catalog is valid`);

    const broken = (change) => validateCatalog(tool, change(structuredClone(catalog)), { root, identity }).join('\n');
    const setSource = (value) => (c) => { if (tool === 'codex') c.plugins[0].source.path = value; else c.plugins[0].source = value; return c; };
    assert.match(broken(setSource('./plugins/../plugins/orion')), /source/);
    assert.match(broken(setSource('./plugins/other')), /must resolve to plugins\/orion/);
    assert.match(broken((c) => { c.name = 'orion-ffffffffffff'; return c; }), /this harness’s catalog identity/);
    assert.match(broken((c) => { c.plugins = []; return c; }), /exactly one orion/);
    if (tool === 'codex') {
      assert.match(broken((c) => { delete c.plugins[0].policy; return c; }), /policy/);
      assert.match(broken((c) => { c.plugins[0].policy.installation = 'INSTALLED_BY_DEFAULT'; return c; }), /installation/);
      assert.match(broken((c) => { delete c.plugins[0].category; return c; }), /category/);
    } else {
      assert.match(broken((c) => { delete c.owner; return c; }), /owner\.name/);
      assert.match(broken((c) => { c.plugins[0].policy = {}; return c; }), /unknown key "policy"/);
    }
    // The package must really be there, with this tool's manifest.
    rmSync(join(root, MANIFEST_PATHS[tool]));
    assert.match(validateCatalog(tool, catalog, { root, identity }).join('\n'), /manifest/);
    // A catalog of one format never passes as the other.
    assert.ok(validateCatalog(tool === 'codex' ? 'claude-code' : 'codex', catalog).length > 0);
  }
});

test('the status template and the setup wizard carry the plugin region, keeping an existing identity', (t) => {
  const template = JSON.parse(readFileSync(join(repo, 'status/status.schema-template.json'), 'utf8'));
  assert.deepEqual(template.plugin, { catalog_identity: null, setup_state: 'not_started', remaining_action: null, verified_version: null, verified_at: null, pending_version: null, pending_switch: null, update_backup: null });
  assert.deepEqual(defaultPluginRegion(), template.plugin);
  assert.match(readFileSync(join(repo, 'status/status-schema.md'), 'utf8'), /\| `plugin` \|.*catalog_identity/);

  const identity = '0f1e2d3c-4b5a-4987-a6b5-c4d3e2f1a0b9';
  for (const [before, after] of [
    [undefined, template.plugin],
    [{ catalog_identity: identity }, { ...template.plugin, catalog_identity: identity }],
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'orion-plugin-migrate-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    cpSync(join(repo, 'status'), join(root, 'status'), { recursive: true, filter: (path) => !/(status|radio-outbox)\.json$|radio\.key$|-log\.md$/.test(path) });
    copyFileSync(join(repo, 'start.mjs'), join(root, 'start.mjs'));
    const status = { ...structuredClone(template), ai_assistant: 'codex' };
    if (before) status.plugin = before; else delete status.plugin;
    writeFileSync(join(root, 'status/status.json'), JSON.stringify(status));
    const run = spawnSync(process.execPath, [join(root, 'start.mjs')], { input: '', encoding: 'utf8', env: plainEnv({ HOME: root }) });
    assert.equal(run.status, 2, run.stdout + run.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'status/status.json'), 'utf8')).plugin, after);
  }
});

test('the package in a folder validates for both tools at the release version', (t) => {
  assert.deepEqual(validatePackage(repo, { version: release.template_version }), []);
  const root = mkHarness(t);
  cpSync(join(repo, 'plugins'), join(root, 'plugins'), { recursive: true });
  assert.deepEqual(validatePackage(root, { version: release.template_version }), []);
  assert.match(validatePackage(root, { version: '9.9.9' }).join('\n'), /must equal the release version 9\.9\.9/);
  rmSync(join(root, 'plugins/orion/skills/report-bug/SKILL.md'));
  assert.match(validatePackage(root).join('\n'), /skills\/report-bug has no SKILL\.md/);
  rmSync(join(root, MANIFEST_PATHS['claude-code']));
  assert.match(validatePackage(root).join('\n'), /\.claude-plugin\/plugin\.json/);
});

function mkHarness(t) {
  const root = mkdtempSync(join(tmpdir(), 'orion-harness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'status'));
  writeFileSync(join(root, 'status/status.json'), readFileSync(join(repo, 'status/status.schema-template.json')));
  return root;
}
