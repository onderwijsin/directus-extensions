# Tooling conventions

## Contents

- [Separate tool responsibilities](#separate-tool-responsibilities)
- [Compiler options express environment contracts](#compiler-options-express-environment-contracts)
- [Type imports and exports](#type-imports-and-exports)
- [Diagnostics and exceptions](#diagnostics-and-exceptions)
- [Runtime and declaration surfaces](#runtime-and-declaration-surfaces)

## Separate tool responsibilities

| Tool or source              | Owns                                                       | Does not establish                                             |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Formatter                   | Mechanical layout and configured presentation              | Correct behavior or architecture                               |
| Linter                      | Configured syntax, semantic and sometimes type-aware rules | Complete runtime correctness                                   |
| Compiler                    | Static checking against effective options and declarations | Runtime input validation or available platform implementations |
| Coding guide                | Adopted naming, structure, idioms and exceptions           | That a rule is actually enforced by tooling                    |
| Package/build configuration | Emitted files, entries and transform rules                 | That every supported consumer can load them                    |

Use the repository's tools and pinned configuration, whether ESLint, Oxlint, Biome, Prettier,
Oxfmt or another supported tool. Rule names and availability differ; examples from one tool
are not configuration instructions for another. Test-selection and delivery procedures remain
with the active coding workflow.

Inspect the effective configuration for a file, including inherited presets, package overrides
and generated references. Configuration existence alone does not prove the invoked script uses
it. A format command may write or only check depending on the project; read its script rather
than infer behavior from its name.

## Compiler options express environment contracts

The following are considerations, not a universal configuration or an instruction to migrate
an existing repository. Check installed-version support and inherited values.

| Option                        | Convention it supports                                           | Qualification                                                        |
| ----------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `strict`                      | A family of stronger type checks                                 | It is not every strictness option; upgrades can add checks           |
| `strictNullChecks`            | Explicit nullable states                                         | Normally part of `strict`; disabling it weakens narrowing guarantees |
| `useUnknownInCatchVariables`  | Narrowed catch values                                            | Part of the strict family; throwing types remain unchecked           |
| `noUncheckedIndexedAccess`    | Account for potentially absent indexed values                    | Additional to `strict`; affects array/dictionary access              |
| `exactOptionalPropertyTypes`  | Distinguish absence from an explicitly supplied `undefined`      | Additional to `strict`; can affect public input compatibility        |
| `noImplicitOverride`          | Mark class overrides intentionally                               | Additional to `strict`; applies to class inheritance                 |
| `noFallthroughCasesInSwitch`  | Reject accidental nonempty case fallthrough                      | Separate option; not exhaustive union checking                       |
| `verbatimModuleSyntax`        | Make erased type imports versus preserved value imports explicit | Must fit the module/emit pipeline                                    |
| `isolatedModules`             | Check constraints of single-file transforms                      | Not a substitute for full project type analysis                      |
| `module` / `moduleResolution` | Match runtime/loader and emitted import semantics                | Choose from actual delivery requirements                             |
| `target` / `lib`              | Syntax emit target and available API declarations                | Declarations do not add runtime polyfills                            |
| `skipLibCheck`                | Skip declaration-file checking                                   | Does not resolve an incompatible dependency contract                 |

Generated configs must be changed through their owner. When browser/server/worker code has
different environments, separate project configurations can express the distinction instead
of granting every file every global. Honor framework-generated project boundaries.

## Type imports and exports

Use the project's type-only import style and compiler requirements. Preserve a runtime import
for values used at runtime; marking an import as type-only removes that runtime binding.
An illustrative pair of authored files:

```ts
// contracts.ts
export interface RecordData {
  id: string;
}
```

```ts
// consumer.ts
import type { RecordData } from "./contracts.js";

export function getId(record: RecordData): string {
  return record.id;
}
```

The `.js` specifier illustrates compiled Node ESM; other loaders may require a different
specifier. Follow effective resolution. Use `export type` for intentionally type-only public
symbols. Preserve side-effect imports and their required order. Type imports do not cause
module initialization, so they cannot replace an import whose initialization is required.

## Diagnostics and exceptions

Type-aware lint rules can catch promise misuse and unsafe propagation that syntax-only checks
cannot. They require the correct project information and may add analysis cost. Do not assume
a rule runs merely because its name appears in a preset or a comment.

Keep a diagnostic's policy separate from its severity: `warn` may or may not fail the invoked
command. The project determines error/warning thresholds. Follow approved exception syntax,
scope and explanation. Types and boundary adapters should express the actual contract before
introducing escape hatches; see [Types and boundaries](types-and-boundaries.md).

Common distinctions:

- `@ts-expect-error` expects an error and diagnoses an unused directive; `@ts-ignore` can remain
  silently after the original problem disappears.
- A lint disable affects that lint rule, not TypeScript semantics or runtime safety.
- `as const` preserves authored literal intent; `as ExternalPayload` asserts an unverified claim.
- Disabling a rule globally changes the coding standard for every matched file.

## Runtime and declaration surfaces

For a public package, export maps, shipped files, emitted declarations and runtime artifacts
form one consumer contract. Keep type conditions and runtime conditions aligned with their
actual files. A declaration-only subpath must not be presented as a runtime value export.

Distinguish the role of runtime dependencies, optional peers, build-only tools and bundled
dependencies according to the actual build. A dependency listed only for development may
still be required at runtime if its import survives bundling. Conversely, externalizing a peer
can deliberately preserve the host's instance and identity. An `exports` map does not promise
CommonJS support merely because a resolver can locate an ESM file.

Use the package's existing versioning and declaration conventions. An exported type change,
narrower accepted option or removed subpath can affect consumers even when the JavaScript
implementation appears unchanged.
