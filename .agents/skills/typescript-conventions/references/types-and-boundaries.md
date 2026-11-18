# Types and boundaries

## Contents

- [Make trust transitions explicit](#make-trust-transitions-explicit)
- [Keep one authoritative contract](#keep-one-authoritative-contract)
- [Model valid states](#model-valid-states)
- [Inference and public annotations](#inference-and-public-annotations)
- [Contain escape hatches](#contain-escape-hatches)

## Make trust transitions explicit

Treat network responses, environment variables, CLI arguments, files and persisted external data
as untrusted until their relevant contract is established. Prefer `unknown` at uncertain
boundaries. An assertion, generic HTTP response type or non-null assertion adds no runtime
check. A type predicate must perform the checks its claimed type requires.

Reuse existing schema/parser facilities. A dependency-free parser can suffice for a small
contract. Check both shape and operation-specific meaning before relying on either:

```ts
interface ImportOptions {
  readonly enabled: boolean;
  readonly batchSize: number;
}

export function parseImportOptions(input: unknown): ImportOptions {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Import options must be an object");
  }
  if (!("enabled" in input) || typeof input.enabled !== "boolean") {
    throw new TypeError("enabled must be a boolean");
  }
  if (
    !("batchSize" in input) ||
    typeof input.batchSize !== "number" ||
    !Number.isSafeInteger(input.batchSize) ||
    input.batchSize < 1
  ) {
    throw new TypeError("batchSize must be a positive safe integer");
  }
  return { enabled: input.enabled, batchSize: input.batchSize };
}
```

This parser intentionally selects two fields from a plain data boundary. Decide whether other
fields are accepted, stripped or rejected. Strict configuration may reject misspelled keys;
forward-compatible remote responses may tolerate unconsumed fields. Shape validation does not
authorize access, sanitize SQL or establish filesystem confinement.

Choose the validation owner. When an SDK or framework contractually validates a payload, preserve
its supported inputs and failure behavior. Check invariants needed by the current layer;
duplicate parsers can disagree. Revalidate when data crosses a new trust boundary or can change
outside the earlier guarantee.

For destructive imports, distinguish an absent source, a valid empty source and an invalid
source. Filtering malformed rows into an empty array can turn rejection into deletion.
Preflight what can be checked before mutation; preflight alone is not transaction isolation.

## Keep one authoritative contract

Derive types from an existing schema when the library supports it. Check whether transforms
change the output type. Keep public raw options and fully resolved configuration distinct;
`Partial<ResolvedConfig>` rarely models a real public input format accurately.

For a closed authored set without a schema dependency:

```ts
export const importModes = ["insert", "upsert"] as const;
export type ImportMode = (typeof importModes)[number];

const acceptedModes: ReadonlySet<unknown> = new Set(importModes);

export function isImportMode(input: unknown): input is ImportMode {
  return acceptedModes.has(input);
}
```

The collection is created only from the canonical tuple, so membership establishes this exact
union. Keep that invariant if changing the collection. Avoid separately maintained enum,
validator and documentation lists. Generate published JSON schemas from the canonical
definition when that is the package contract, and check the shipped artifact and examples.

When representations differ intentionally, name the translation: `ApiRecord` to `ImportRecord`,
or `RawOptions` to `ResolvedOptions`. Do not force unrelated structures into a single type just
to eliminate repeated fields.

## Model valid states

Use unions when optional properties would allow contradictory states:

```ts
type ImportState =
  | { status: "idle" }
  | { status: "running"; completed: number }
  | { status: "failed"; error: Error }
  | { status: "done"; imported: number };

function assertNever(value: never): never {
  throw new Error(`Unhandled import state: ${String(value)}`);
}

export function describeState(state: ImportState): string {
  switch (state.status) {
    case "idle":
      return "Waiting";
    case "running":
      return `Imported ${state.completed}`;
    case "failed":
      return state.error.message;
    case "done":
      return `Finished ${state.imported}`;
    default:
      return assertNever(state);
  }
}
```

The discriminant enables exhaustive checking inside the trusted model. External JSON still
needs parsing. Error objects require an explicit wire representation across processes because
JSON does not preserve their prototype automatically.

Use `readonly` to communicate ownership where mutation is unnecessary. It is a compile-time,
usually shallow constraint, not runtime freezing or concurrency protection. Keep legitimate
mutation local and visible; copying every collection is not automatically safer or cheaper.

Define missing, `undefined`, `null`, empty and disabled precisely. Narrow array/dictionary
lookups and `Map.get` before use. Use branded identifiers or complex generic relationships
when they prevent a real mix-up that a simpler model does not express clearly.

## Inference and public annotations

Infer straightforward locals. Annotate public boundaries and recursive functions when it
stabilizes the contract, improves diagnostics or prevents accidental implementation types
leaking into declarations. Follow existing public declaration conventions.

```ts
type Mode = "insert" | "upsert";
interface Defaults {
  mode: Mode;
  batchSize: number;
}

export const defaults = {
  mode: "insert",
  batchSize: 50,
} satisfies Defaults;

export const initialMode: "insert" = defaults.mode;
```

`satisfies` checks assignability while retaining useful inference. It does not parse unknown
data, freeze objects or make every property a literal. `as const` records literal/readonly
intent for authored data; it differs from asserting an external payload's shape. Check syntax
support against the installed compiler.

Use `interface` for extensible object contracts and `type` for unions, aliases and mapped forms,
unless local policy says otherwise. Do not rewrite one into the other for preference alone.
Prefer generics that relate values or types; a parameter used once often adds no useful relation.

## Contain escape hatches

First model or narrow accurately. When external declarations cannot express a verified runtime
contract, isolate the smallest justified assertion at the adapter. Explain the invariant,
affected versions and removal condition. Honor stricter local rules, including projects that
require explicit authorization for assertions.

An incomplete test double using `as unknown as FrameworkContext` is not evidence that missing
production fields are safe. Prefer narrow capability contracts or reusable fixture builders
where they meaningfully protect behavior.

Use targeted `@ts-expect-error` only for an intentional evidenced exception, including negative
type tests; an unused directive is diagnosed when the expected error disappears. The comment
does not validate runtime behavior. Fix the root mismatch instead of adding global stubs,
widening a whole flow to `any` or weakening package-wide checks.
