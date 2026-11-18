---
name: typescript-conventions
description: Apply TypeScript coding conventions alongside an implementation, review or cleanup workflow. Use for project style, file/module layout, imports and exports, type idioms, configuration shapes, typed adapters, errors and promise conventions, or to define a TypeScript coding guide. Supplies framework-agnostic rules and examples; leaves implementation planning, necessity judgments, review procedure and test selection to the active coding workflow.
license: MIT
metadata:
  agents: []
---

# TypeScript conventions

Use this as a conventions reference within the active coding task. It supplies concrete TypeScript
forms and their semantics; the active workflow determines scope, edits, review findings, testing
and delivery. It introduces no additional implementation or review phase.

## Resolve the applicable convention

Read the project's coding guide and effective configuration for the target files: compiler
`extends` and references, formatter/linter presets and overrides, module/package metadata and
relevant neighboring examples. Apply the host's instruction hierarchy. Within project evidence,
explicit applicable contracts and effective configuration outweigh inferred habits; use these
references for gaps. Follow local choices for presentation rather than imposing this skill's
example formatting.

Distinguish requirements, inferred conventions and recommendations. Use
[Standards and discovery](references/standards-and-discovery.md) for definitions, conflict
resolution and the template for writing an assessable coding rule. Keep observations in working
context unless a coding guide is requested.

## Choose the relevant reference

| Convention being applied                                                           | Reference                                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| File ownership, execution domains, import paths, barrels or package exports        | [Organization and modules](references/organization-and-modules.md)     |
| Narrowing, schemas, unions, optionality, inference, generics or assertions         | [Types and boundaries](references/types-and-boundaries.md)             |
| Identifier/file names, function forms, defaults, formatting or doc comments        | [Naming and style](references/naming-and-style.md)                     |
| Typed adapters, strategy registries, raw/resolved options or environment parsing   | [Patterns and configuration](references/patterns-and-configuration.md) |
| Error representation, caught values, promises, sequencing or async disposal        | [Errors and async work](references/errors-and-async.md)                |
| Compiler settings, type imports, formatter/linter responsibilities or suppressions | [Tooling conventions](references/tooling-conventions.md)               |
| Unsafe TypeScript shortcuts and their concrete replacements                        | [Anti-patterns](references/anti-patterns.md)                           |
| Evidence behind these conventions or limits of external style guides               | [Research sources](references/research-sources.md)                     |

Read branches relevant to the current decision. Examples illustrate forms, not required folders,
dependencies, framework replacements or architecture migrations. Check version-sensitive syntax
and APIs against the installed compiler and actual runtime.

For a requested coding guide, distinguish adopted rules from recommendations and record scope,
rationale, example, enforcement and exceptions. For an existing coding task, apply the relevant
conventions directly; retain the active workflow's output and verification requirements.
