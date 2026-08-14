---
name: authoring-directus-extensions
description:
  Author and maintain publishable Directus Extensions in the onderwijsin/directus-extensions
  repository. Use for creating, extending, fixing, testing, documenting, or restructuring an
  extension, supporting package, local Directus integration, public API, or consumer documentation.
---

# Author Directus extensions

Use this skill for implementation work in this repository. It routes the task; repository docs and
official Directus documentation remain the sources of truth.

## Establish scope

1. Read `AGENTS.md`, `docs/agent-workflow.md`, and the applicable workspace and cookbook articles.
2. Run `git status --short` and preserve existing work.
3. Identify the affected extension/package, Directus extension type, runtime, public contract,
   package metadata, tests, README, consumer skill, Compose integration, and release surface.
4. Inspect the affected implementation and one comparable local implementation when a pattern is
   needed. Treat extension anatomy and patterns as provisional until this repository settles them.
5. Use the Directus documentation MCP for version-sensitive or framework-specific facts. At minimum,
   consult the relevant extension type, CLI, loading, sandbox, permissions, and publishing docs.

## Build the extension

- Treat `package.json` `directus:extension` metadata and the official Directus scaffold as the
  entrypoint contract.
- Keep endpoint, hook, theme, interface, display, layout, module, panel, operation, and bundle
  structures appropriate to their declared type. Do not force every extension into one layout.
- Keep registration/orchestration at the entrypoint and colocate implementation with the entry that
  owns it. Introduce subdirectories only when complexity warrants them.
- Prefer sandbox-compatible API extensions where the type supports sandbox mode. Declare only the
  scopes the extension needs, and account for sandbox limitations such as unavailable Node APIs.
- Prefer Directus internal services and documented SDK APIs over reimplementing Directus behavior.
  Preserve accountability, schema handling, transactions, and permission semantics.
- Validate external input at the boundary. Use Zod for structured parsing and local type guards for
  small runtime narrowing. Do not add casts, assertions, or global stubs to hide type problems.
- Keep server, Data Studio, and browser code boundaries explicit. Preserve supported Node and
  Cloudflare compatibility when the package claims it.

## Package and consumer contract

- Keep `directus:extension` metadata synchronized with source and built output.
- Ensure published packages include the required `dist` files and do not depend on workspace-only
  paths or private test utilities at runtime.
- Update the package README and matching `skills/<extension-name>/SKILL.md` for any consumer-visible
  installation, option, permission, environment, compatibility, or behavior change.
- Add one Changeset per independent public-package concern.
- Do not migrate legacy extensions unless explicitly requested in a separate task.

## Local verification

Use the single local Directus instance rather than creating isolated playgrounds. For the current
scaffold, the expected development path is:

1. build or watch the extension into its workspace `dist` directory;
2. mount the workspace extensions directory into Directus;
3. enable `EXTENSIONS_AUTO_RELOAD` when appropriate; and
4. verify the observable hook behavior against the running instance.

Run the applicable repository checks, inspect the complete diff, and do not commit changes. Use the
exact handoff template from `docs/agent-workflow.md`.
