---
name: authoring-directus-extensions
description:
  Author and maintain publishable Directus Extensions in the onderwijsin/directus-extensions
  repository. Use for any task that creates, extends, fixes, reviews, tests, documents, migrates, or
  restructures an extension, its package metadata, runtime behavior, public API, or consumer-facing
  documentation and skill.
---

# Author Directus Extensions

Use this skill as the procedural entry point. Repository contracts and technical facts live in
`AGENTS.md` and `docs/`; do not reconstruct them from memory or duplicate them here.

## Route the work

1. Read [`AGENTS.md`](../../../AGENTS.md) and the [agent workflow](../../../docs/agent-workflow.md)
   completely.
2. Start with the [extension cookbook index](../../../docs/extension-cookbook/index.md). Select and
   fully read every article triggered by the task, including any linked feature decision under
   `docs/decisions/`.
3. Read the affected extension's implementation, tests, playground, package metadata, and public
   documentation as applicable. Inspect one comparable extension before introducing a pattern.
4. For Directus-specific design decisions, consult the relevant official sources routed by
   [the official Directus documentation router](../../../docs/extension-cookbook/official-directus-documentation.md).
   Fully use Directus's MCP documentation when it is available.

## Implement the contract

1. Trace the change across setup, runtime behavior, emitted output, tests, package metadata, and
   consumer documentation rather than treating the requested file in isolation.
2. Respect the anatomy of the extension type instead of forcing a shared source layout. Treat the
   extension's `package.json` `directus:extension` metadata and the official Directus scaffold as
   the source of truth for its entrypoints:
   - `interface`, `display`, `layout`, `module`, and `panel` extensions use `src/index.ts` for
     registration and a matching Vue component such as `interface.vue`, `display.vue`, `layout.vue`,
     `module.vue`, or `panel.vue`.
   - `endpoint`, `hook`, and `theme` extensions use a single `src/index.ts` entrypoint.
   - `operation` extensions are hybrid and keep separate `src/app.ts` and `src/api.ts` entrypoints
     for Data Studio configuration and server-side execution.
   - `bundle` extensions contain independently typed entries under `src/<entry>/`; keep each entry's
     source structure appropriate to its type and keep `directus:extension.entries` synchronized
     with those entrypoints. Keep entrypoints focused on Directus registration and orchestration.
     Colocate supporting components, composables, services, utilities, schemas, and types with the
     extension or bundle entry that owns them, and introduce subdirectories only when complexity
     warrants them. Do not normalize extensions into a structure that conflicts with their declared
     Directus entrypoints or established repository patterns.
3. Preserve public contracts unless the user explicitly requests a compatibility change. Use Zod at
   applicable runtime boundaries and preserve Node server and Cloudflare Workers compatibility.
4. Prefer the smallest root-cause change and existing repository patterns. Do not add dependencies
   or change workspace/package-manager configuration without explicit need.
5. Complete the impact decisions in the [agent workflow](../../../docs/agent-workflow.md). Update
   the extension README and matching consumer skill under `skills/` whenever options, exports,
   components, auto-imports, compatibility, or behavior change. Keep maintainer docs and Changesets
   synchronized when their triggers apply.

## Verify and hand off

1. Review the complete diff and reconcile every impact category.
2. Run the applicable validation from [workspace tooling](../../../docs/workspace.md); use the
   complete suite for broad, package-facing, or release-facing changes. Do not commit generated
   output.
3. Use the applicable exact handoff format in the [agent workflow](../../../docs/agent-workflow.md).
   Do not commit the changes unless the user explicitly requests it.
