# Naming and style

## Contents

- [Follow effective style](#follow-effective-style)
- [Name the domain and behavior](#name-the-domain-and-behavior)
- [Shape functions for readers](#shape-functions-for-readers)
- [Precise defaults and conditions](#precise-defaults-and-conditions)
- [Comments and documentation](#comments-and-documentation)

## Follow effective style

Formatting follows the configured formatter. Configuration owns indentation, quotes, semicolons, trailing
commas, braces and import grouping. Preserve semantic import order and generated output.
Use maintained neighboring style where no effective setting exists. Whether to apply or only
check formatting follows the active workflow's write permissions.

Common defaults for a new unconfigured area are camelCase values/functions and PascalCase
types/classes. Follow local filename and constant conventions; UPPER_SNAKE_CASE can distinguish
some constants but is not required for every `const`. Export form, function declaration style
and `T[]` versus `Array<T>` are local readability choices.

External contributor guides do not define universal TypeScript presentation. Record adopted
choices once instead of importing a competing style guide into each task.

## Name the domain and behavior

| Expose                 | Example                                       | Benefit                                   |
| ---------------------- | --------------------------------------------- | ----------------------------------------- |
| Operation and subject  | `resolveImportConfig`, `createBlobDriver`     | Shows what is produced or changed         |
| Predicate              | `isEnabled`, `hasPendingWork`, `shouldRetry`  | Reads naturally in conditions             |
| Units                  | `timeoutMs`, `maxBytes`                       | Prevents unit confusion                   |
| State or phase         | `rawConfig`, `resolvedConfig`, `selectedIds`  | Makes trust/lifecycle transitions visible |
| Meaningful distinction | `parseConfig`, `validateConfig`, `loadConfig` | Separates parsing, checking and I/O       |

Use verbs consistently within the project. `get`, `find`, `read`, `ensure` and `create` need not
have universal meanings, but names and docs should make absence, I/O, mutation and failure
predictable. Prefer domain terms over `manager`, `helper`, `data` and `process` when those hide
responsibility. Short local names are fine where meaning is immediate; expand with scope or
domain ambiguity.

## Shape functions for readers

Use the project's function declaration and parameter conventions. The following forms make
TypeScript call signatures and lexical behavior explicit.

Use an options object when positional arguments hide unrelated policy:

```ts
// A call like runImport(rows, true, false, 50) hides policy in argument positions.
interface ImportPolicy {
  mode: "insert" | "upsert";
  continueOnError: boolean;
  batchSize: number;
}

interface ImportRequest {
  rows: readonly string[];
  policy: ImportPolicy;
}

export function describeImport(request: ImportRequest): string {
  const { rows, policy } = request;
  return `${policy.mode}: ${rows.length} rows, batches of ${policy.batchSize}`;
}
```

Two obvious operands do not need an object. Keep existing public signatures compatible;
improving an internal call style does not authorize breaking consumers.

Declarations, arrows, classes and factories are all valid TypeScript forms. Arrows capture
lexical `this`; prototype methods use the caller's receiver unless bound. Preserve that
distinction when following a project's function style. Default exports may be required for
host entry points; named exports make other public symbols explicit.

## Precise defaults and conditions

```ts
interface Options {
  enabled?: boolean;
  retries?: number;
  label?: string;
}

export function resolveOptions(options: Options) {
  return {
    enabled: options.enabled ?? true,
    retries: options.retries ?? 3,
    label: options.label ?? "Import",
  };
}
```

This preserves `false`, `0` and an empty label. Use `||` when every falsy value actually means
fallback, and `??` for nullish values. Neither validates an input. Decide how explicit `null`
behaves before choosing the operator.

Use explicit comparisons when truthiness collapses distinct states. Preserve a documented exact
development-mode match rather than broadening it to "anything except production." Name expensive
or stateful intermediate results when that clarifies lifetime or prevents repeated work.

## Comments and documentation

Document reasons, invariants, compatibility constraints, units, effects and failure contracts.
Follow required JSDoc/TSDoc coverage and syntax. TypeScript already expresses parameter types;
repeating them in comments usually creates drift.

```ts
/**
 * Resolve retries after an attempted operation fails.
 * Zero disables retries; the original attempt is not part of the count.
 */
export function resolveRetries(value: number | undefined): number {
  return value ?? 3;
}
```

This helper assumes the boundary already validated the number. A public parser should document
rejected values too.

Use TypeScript-aware JSDoc/TSDoc conventions: parameter descriptions rather than repeated type
syntax, documented units/defaults where not evident from the type, and supported tags for the
project's documentation parser. When broad JSDoc coverage is required, honor it as a project
policy rather than a TypeScript language requirement.
