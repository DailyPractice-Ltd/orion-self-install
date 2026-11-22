# Orion skills plugin: implementation specification

Status: ready for implementation. Native installation compatibility is not yet verified.

## Outcome and scope

Package all Orion-shipped skills as the `orion` plugin, using one maintained source for Codex desktop/CLI and local Claude Code. Reorganize the folders and update deployment for fresh harness installations.

The plugin requires an installed Orion harness. Each harness owns its plugin package and uniquely identified local catalog, with one selected AI tool at a time. The plugin shares Orion's release version and is updated through “update my harness”. Client-created and client-added skills remain separately managed.

Existing installed harnesses, conversion of their standalone skills, and legacy migration machinery are outside this effort. Implementation and actual deployment were not performed during specification work.

## Folder and ownership contract

Move the maintained source from `skills/` to `plugins/orion/skills/`. Preserve every skill and supporting script, reference, asset, template, and agent metadata file. Keep existing skill names. Do not maintain duplicate tool-specific skill bodies.

Use this package layout in the release and in newly installed harnesses:

```text
plugins/orion/
  plugin.json
  .claude-plugin/plugin.json
  skills/
    <existing-skill-name>/
      SKILL.md
      <all supporting files>
```

Generate both plugin manifests from the same Orion release metadata. Each identifies `orion`, carries the Orion release version and a static product description, and uses the standard `skills/` discovery layout. The portable root manifest serves Codex; the nested native manifest serves Claude Code. Preserve relevant per-skill metadata, including `agents/openai.yaml` where present.

Generate only the selected tool's harness catalog and enablement configuration:

| Tool | Catalog in harness | Package source |
| --- | --- | --- |
| Codex | `.agents/plugins/marketplace.json` | Local source at `./plugins/orion` |
| Claude Code | `.claude-plugin/marketplace.json` | Relative source `./plugins/orion` |

Those source paths resolve against the harness/marketplace root, not against the metadata subdirectory. Validate the two native catalog schemas independently. Codex entries include local source metadata, installation/authentication policy and category. Claude Code catalogs include their name, static product owner metadata, and plugin entries. Do not publish per-client catalogs or values as release artifacts.

Generate a unique catalog identity once during installation and persist it with harness setup state. Reuse it during resume, update, restoration, and tool switching. Do not derive it from a pairing credential, business name, or folder basename. The plugin remains named `orion`; the catalog identity distinguishes harness installations.

The complete shipped package is release-managed. Back up any in-place modifications before replacement; updates replace the package as a unit. Customizations belong in client-owned skills under `.agents/skills/` or `.claude/skills/`, as appropriate. Preserve those skills and unrelated tool settings.

## Harness context and operational controls

Keep business identity, knowledge base, credentials, permissions, logs, and all mutable business state in the harness. Do not put them in distributable plugin files, platform caches, manifests, or shared plugin data directories.

Resolve operations against the explicitly active project. Validate that the selected project identifies one Orion harness. If context is missing or ambiguous, stop and ask the human to open the intended Orion folder. Never search sibling folders, discover another business's harness, or reuse a root remembered from another session. A cached plugin's location is not the active harness root.

Use the validated harness's existing instructions, guard, pairing, send controls, reporting, and operational runtime. Do not copy harness-root-dependent runtime scripts into the package and execute them there. Skill-specific supporting helpers remain package resources; their mutable outputs belong in the harness.

Treat package-resource paths and harness-data paths separately throughout instructions and helpers. Audit existing relative references when moving the source. Plugin-root instructions must not be assumed to load as project instructions; preserve or establish the supported project instruction entry point for each tool.

Platform enablement scope is not a filesystem isolation guarantee. Registration must not globally enable Orion or repoint another installation's catalog. Preserve unrelated configuration. If the platform cannot establish effective per-harness activation, report the limitation and leave setup incomplete.

## Fresh installation

Keep the existing entry point:

```text
node install.mjs --tool <codex|claude-code> --target <new-client-folder>
```

Retain the new-or-empty target requirement and existing local/private-repository options. This effort does not add legacy migration support.

1. Stage and validate the fresh harness, shipped package, manifests, and selected tool's catalog.
2. Persist the catalog identity and setup progress. Finalize the harness path before registering it; never register a temporary staging directory.
3. Perform the selected tool's documented registration and scoped enablement steps. Platform-wide catalog bookkeeping must be uniquely associated with this harness and must not enable Orion globally.
4. Give an exact remaining action when native trust, installation, restart, or a fresh session is required. Missing or unsupported clients leave a resumable setup state, without silently installing loose shipped skills.
5. Confirm actual native discovery, expected package/version, and the active harness context before reporting “plugin setup complete”. File placement, catalog registration, or a configured enabled flag alone is insufficient.

Provide a documented, repeatable resume operation for unfinished plugin setup in the existing installed folder. Reuse the catalog identity and avoid duplicate registrations or enablement entries. A fresh install request against a nonempty folder must not silently overwrite it.

For Codex, the documented marketplace registration/listing commands can prepare the catalog. Native desktop Plugins Directory or CLI `/plugins` installation and a fresh chat/session remain explicit steps; an unattended plugin-install command has not been established by this research. Catalog listing does not prove installation or discovered skills.

For Claude Code, use native package/catalog validation, marketplace registration and plugin installation with explicit local scope. Inspect enabled state, scope, project/source path and errors. For local in-place plugins, inspect the actual folder/version rather than relying only on historical install-record metadata. Reload or start a fresh session as required.

Plugin readiness and operational pairing are separate conditions. Preparing a plugin does not pair a business or authorize sales work. Overall Orion setup must continue to satisfy the existing pairing requirements.

## Updates, recovery, restoration, and tool switching

“Update my harness” must coordinate the harness and plugin as one release:

- Stage the target release and back up the previous affected harness files, complete shipped package, and only the relevant registration/configuration state before replacement.
- Replace release-owned files and package contents, preserving client-owned skills and business records. Refresh the selected tool through its supported mechanism.
- Verify the actually discovered content/version. Account for Codex cached copies and Claude Code local in-place loading; changing a manifest alone is insufficient.
- Track the pending target separately from the last verified active release. An unfinished interactive action, restart or verification step leaves the update pending. Do not announce the target release as active prematurely.
- On confirmed failure, restore the previous coordinated state. Persist sufficient journal information to resume or recover interrupted operations.
- Restore only changes owned by the operation. Preserve unrelated settings. If concurrent edits make restoration unsafe, stop with a concrete recovery action rather than overwriting them. Verify the restored runtime after reload/fresh launch before claiming successful recovery.

Tool switching reuses the harness data, package, version and catalog identity. Prepare the target tool's native catalog and installation, verify discovery, then commit the selected-tool change and retire only the previous tool's Orion enablement. An unfinished target step leaves a pending switch; confirmed failure restores the previous selected tool's owned state. Do not delete unrelated plugins or shared platform caches. Simultaneous dual-tool activation is outside this specification.

Independent marketplace auto-updates must not replace the harness-pinned plugin release. For a local in-place source, the harness updater supplies package changes; platform refresh/reload makes them available to the session.

## Release and repository changes

Update the installer, deployment manifest/resolver, runtime layout resolution, updater, ownership fingerprints, release-contract checks and release workflow to implement the new layout and lifecycle. Update adapters, skill instructions, documentation and tests that assume shipped skills are standalone tool skills.

Generate metadata from the candidate Orion release, not a different checkout or version. Packaging and deployment validation must pass for both tools before the existing Orion tag/release is published. Failure for either tool blocks publication. Keep one release stream and no independent plugin version.

Continue excluding human-only implementation records and release-only development material from harness installs. Code and tests must not load `specs/`. The plugin package and release artifacts must contain no client credentials or business state.

## Automated acceptance before code handoff

Use synthetic fixtures and stub native command boundaries where appropriate. Automated tests must establish:

1. Every shipped skill and supporting file is represented exactly once in the new source/package inventory; no maintained duplicate source is introduced.
2. Both manifest formats and selected-tool catalogs validate; names and versions match the candidate Orion release; catalog source paths resolve to the intended package.
3. Fresh deployment produces the correct layout and selected-tool configuration, with client skills and unrelated settings preserved. Harness business state is absent from the package.
4. Registration uses the final harness path. Resume/retry retains the catalog identity and does not duplicate registrations. Fresh installation rejects conflicting nonempty targets.
5. Missing tools, required interactive steps, and failed discovery remain pending or fail explicitly. Stubbed success is never reported as real native discovery.
6. Package resources resolve inside the package; harness operations resolve only inside the explicitly selected synthetic project. Missing, ambiguous or escaping roots fail without reading another harness.
7. Coordinated updates, version tracking, interrupted operations, confirmed failures, restore conflicts and tool switching preserve the agreed ownership and rollback behavior.
8. Release preparation fails if either tool's packaging/deployment checks fail. Existing relevant repository checks pass after paths and contracts are updated.

Do not invoke sales skills against real accounts merely to test installation. Automated command stubs and file checks demonstrate preparation behavior, not native compatibility.

## Henri's manual installation validation

After code handoff, Henri will run fresh installation from his Codex and Claude Code environments and check that each tool installs and discovers the plugin correctly. These manual checks do not block preparing or handing off the code, and the agent is not required to perform them first.

Supply a short checklist with the implementation:

- Record the client name, exact version and surface used; distinguish Codex desktop from CLI.
- Run a fresh install and complete the tool's native installation/trust/restart steps.
- Confirm `orion` appears in the native plugin inventory with the intended scope, source and release version.
- Confirm the expected shipped skills are discoverable, and invoke a harmless example in the intended harness context.
- Record any remaining errors or unexpected activation outside that context. Broader update/restore/switch checks can use disposable synthetic fixtures.

Native compatibility remains unverified until these results exist. Do not invent a minimum client version or imply that one tested Codex surface validates the other. Codex desktop/CLI and local Claude Code are target surfaces; older versions and unsupported surfaces have no compatibility promise from this specification.

The code handoff must summarize changes, automated checks actually run, manual installation instructions, and remaining unverified native behavior. Automated release preparation and an installed user's verified setup are distinct completion boundaries.

## Platform references

- [Codex plugin packaging, catalogs and enablement](https://developers.openai.com/plugins/build/plugins)
- [Codex native plugin discovery and installation](https://learn.chatgpt.com/docs/plugins)
- [Claude Code marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude Code plugin manifest reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code plugin CLI and inspection](https://code.claude.com/docs/en/plugins/cli-reference)
- [Claude Code plugin loading and caches](https://code.claude.com/docs/en/plugins/loading)

Research was conducted on 21 November 2026. Recheck the native command/schema details against these primary sources during implementation; documentation is not evidence of a successful installation in Henri's environment.
