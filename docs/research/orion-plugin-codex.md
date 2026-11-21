# Codex plugin support for Orion

Research date: 21 November 2026. Planning only; no package, installation, or discovery test was performed. This answers local ticket `01-codex-plugin-support.md` in the Orion skills plugin Wayfinder map.

## Answer

Codex documents project-specific enablement for local-marketplace plugins. That supports a candidate per-harness configuration, but does not establish exclusive folder activation or a filesystem security boundary. A real discovery and isolation test remains necessary before promising that product behavior.

## Documented packaging and distribution

The [official package guide](https://developers.openai.com/plugins/build/plugins) establishes:

- Preferred entry: root `plugin.json`, stable kebab-case name, version, description; portable skills in `skills/`. `.codex-plugin/plugin.json` remains a fallback; `extensions.com.openai` supersedes that overlay without merging.
- Plugin name supplies component namespace. Overlay paths start `./`, relative to plugin root.
- Repo discovery: `.agents/plugins/marketplace.json`; local `source.path` is relative to marketplace root, inside it. Catalog entries include installation/authentication policy and category.
- Discovery precedes installation. Desktop loads the installed cache at `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`; local version directory is `local`.
- After local edits, refresh source files and restart desktop. CLI supports `codex plugin marketplace add/list/upgrade/remove`; Git sources accept ref/SHA selectors. A manifest version alone does not prove an installed update.

This is a registered marketplace flow; copying skills alone is insufficient evidence of plugin registration.

## Surface and configuration constraints

[Plugins user documentation](https://learn.chatgpt.com/docs/plugins) supports desktop Codex and CLI. CLI `/plugins` browses, installs, uninstalls and toggles plugins; start a new session after installation. Desktop installations add capabilities to new chats. The IDE extension does not support plugins. The host sandbox and approvals still apply. Documentation now uses “Codex in the ChatGPT desktop app”; it does not establish identical behavior for every historical standalone desktop build.

The [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) defines `plugins.<plugin>.enabled` with `plugin-name@marketplace-name`, read from merged configuration. Trusted-project settings override user, cloud-managed and system defaults within enforced requirements. Untrusted projects skip project `.codex/` settings. Workspace-managed enabled states are exempt from these overrides. Refresh can install disabled plugins. A candidate Orion project entry is:

```toml
[plugins."orion@orion-local"]
enabled = true
```

A matching user-level `enabled = false`, with project override, is a **proposal requiring validation**, not an established exclusive-activation mechanism. Installation and effective enablement must be inspected separately. Do not disable unrelated plugins through a blanket default.

## Skill resources and harness identity

[Build skills](https://developers.openai.com/plugins/build/skills) documents required `SKILL.md` name/description and optional adjacent `references/`, `assets/`, and `scripts/`. Instructions should identify when supporting resources are loaded or scripts run. `agents/openai.yaml` can declare MCP dependencies. A skills-only plugin requires no MCP server. [Codex skill guidance](https://learn.chatgpt.com/docs/build-skills) describes progressive loading, initial file paths, explicit invocation and description-based implicit selection. Neither source documents a guaranteed active-Orion-root variable or a complete collision-resolution contract for plugin and standalone skills.

**Local code fact:** [guard.mjs](../../status/guard.mjs) derives its root from its own script location and launches admitted commands with that root as cwd. [The Codex adapter](../../agent/adapters/codex.md) currently installs standalone skills in `.agents/skills/`. Root [AGENTS.md](../../AGENTS.md) confines identity and operation to this harness.

**Design inference:** cached plugin resources and active harness data need separate roots. Do not compute the harness by walking upward from a cached skill, copy mutable status into the plugin, scan sibling folders, or search the machine for a suitable business. A later contract should require an explicitly selected current project, validate its Orion markers there, and stop on missing/ambiguous context. Invoke that project's existing guard by its verified path. No automatic root resolver is implemented or claimed here.

## Unknowns and required smoke-test evidence

No verified minimum desktop or CLI version for the complete proposed flow was found in the inspected current guides and [changelog](https://learn.chatgpt.com/docs/changelog). A historical plugin announcement does not establish support for today's formats, config precedence and refresh behavior. Record tested client versions as the initial compatibility floor; do not invent a numeric minimum.

Before implementation is declared compatible, obtain these results in synthetic disposable fixtures, without opening another business harness:

1. Capture exact desktop/CLI versions and trusted project root; validate marketplace and manifest; prove directory discovery, installation and enabled state independently.
2. Start fresh sessions and invoke every shipped skill. Record displayed namespace, reference/script paths, name collisions, and implicit activation behavior.
3. In a second neutral fixture and an untrusted fixture, establish whether Orion appears or activates under inherited/global settings. Test project switching, nested directories, worktrees and missing status. This research has not proved isolation.
4. Demonstrate a harmless local guard invocation uses only the selected fixture. Test refusal outside it and symlink escapes without using real credentials.
5. Change release version and packaged resource content; refresh/restart and prove which installed content runs. Roll back and repeat. Cover local-cache refresh and pinned Git sources separately if both are offered.
6. Establish the exact user-visible installation and update steps for each supported client. Preserve existing standalone skills until registration, invocation, root confinement and rollback have passed.

Candidate sequence: validate harness and supported client → stage versioned package/catalog → inspect/register/install through supported client → confirm effective per-project state → restart/new session → run above checks. This is a research proposal, not an installer specification or successful activation result.
