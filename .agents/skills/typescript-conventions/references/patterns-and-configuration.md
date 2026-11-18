# Patterns and configuration

## Contents

- [Typed capability boundaries](#typed-capability-boundaries)
- [Typed strategy registries](#typed-strategy-registries)
- [Raw options and resolved configuration](#raw-options-and-resolved-configuration)
- [Environment parsing](#environment-parsing)
- [Configuration precedence and generated contracts](#configuration-precedence-and-generated-contracts)

## Typed capability boundaries

For an adapter already warranted by the design, describe its operations in application terms.
Keep provider-specific request/response structures inside the adapter. Consumers can depend on
the exact capabilities they use instead of a framework-wide context.

```ts
interface StoredRecord {
  id: string;
  value: string;
}

interface RecordStore {
  read(id: string): Promise<StoredRecord | null>;
  write(record: StoredRecord): Promise<void>;
}

export async function readRequiredRecord(
  id: string,
  store: Pick<RecordStore, "read">,
): Promise<StoredRecord> {
  const record = await store.read(id);
  if (record === null) throw new Error(`Record not found: ${id}`);
  return record;
}
```

The interface distinguishes absence (`null`) from an operation failure (rejection). Other
projects may use `undefined` or a result union; match the adopted contract. A small callable
type can be equivalent to a one-method object when no receiver or metadata is required.

Use optional members only for genuinely optional capabilities. Required methods returning empty
success defaults make an incomplete implementation appear complete. Express a read-only
capability with `Pick` or a separate interface instead of pretending writes succeed. Preserve
an existing documented no-op contract where it is intentional.

TypeScript uses structural compatibility, so a provider object can satisfy a narrow capability
without inheritance. Implement classes when the owning API uses them; an interface alone does
not require a class, abstract base, dependency-injection container or runtime registration.

## Typed strategy registries

For a closed strategy set, a typed registry can enforce complete dispatch:

```ts
type ImportMode = "insert" | "upsert";
type ImportStrategy = (rows: readonly string[]) => Promise<number>;

export function createStrategyRegistry(insert: ImportStrategy, upsert: ImportStrategy) {
  return { insert, upsert } satisfies Record<ImportMode, ImportStrategy>;
}
```

The object remains indexed by the known keys. An external mode still needs parsing before
indexing. For open plugin registries, use a map and handle unknown keys explicitly. A `switch`
is equally valid; the active design workflow decides whether a registry is useful.

Keep the output contract consistent across strategies. If behavior differs materially, represent
that difference in the type rather than hiding it behind casts or a misleading common result.
Define provider errors and partial outcomes independently of the dispatch syntax.

## Raw options and resolved configuration

Public configuration commonly permits omissions or shorthand; runtime consumers need resolved
values. Model both phases explicitly:

```ts
interface RawOptions {
  enabled?: boolean;
  batchSize?: number;
}

interface ResolvedOptions {
  enabled: boolean;
  batchSize: number;
}

// Inputs have already been validated by their owning parser.
export function resolveOptions(options: RawOptions): ResolvedOptions {
  return {
    enabled: options.enabled ?? true,
    batchSize: options.batchSize ?? 50,
  };
}
```

When a boolean shorthand enables a feature, keep `false`, `true` and an options object as
distinct input variants, then normalize once. A boolean is not an object with a missing field.
Use a discriminated union for driver-specific required settings instead of one optional bag.

```ts
type StoreConfig = { driver: "memory" } | { driver: "remote"; endpoint: URL; token: string };

export function describeStore(config: StoreConfig): string {
  switch (config.driver) {
    case "memory":
      return "memory";
    case "remote":
      return config.endpoint.origin;
  }
}
```

The union makes the remote token available only in its branch. It does not establish token
validity, authorization or permission to serialize it into generated/browser code.

## Environment parsing

Accept an environment object at the composition boundary rather than reading process globals
throughout typed domain code. This works for Node, workers, browsers with injected config and
other hosts without requiring `process` to exist everywhere.

```ts
export function readEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env.IMPORT_ENABLED;
  if (value === undefined) return true;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError("IMPORT_ENABLED must be true or false");
}
```

`Boolean('false')` is `true`; the string is nonempty. Generic coercion is not an environment
boolean parser. If the host already casts environment values, use its declared representation
rather than reparsing according to another host's conventions. Define accepted spellings and
numeric ranges as part of the configuration contract.

## Configuration precedence and generated contracts

Encode the project's documented precedence explicitly. For a shallow options model with
validated values, an illustrative precedence is call override, then file, then defaults:

```ts
interface Options {
  enabled: boolean;
  batchSize: number;
}

export function resolveLayers(overrides: Partial<Options>, file: Partial<Options>): Options {
  return {
    enabled: overrides.enabled ?? file.enabled ?? true,
    batchSize: overrides.batchSize ?? file.batchSize ?? 50,
  };
}
```

This example treats nullish values as missing. An API distinguishing `null`, an absent key and
explicit `undefined` needs different logic. Spread order alone may overwrite a default with
`undefined`. Arrays, nested objects and per-field provenance need explicit replacement/merge
semantics; a deep-merge utility does not choose the right policy automatically.

When types, JSON schema, generated modules and documentation describe one configuration,
identify the canonical definition. Generated JavaScript and its declaration file must agree
on names, module format and runtime values. Serialize data with an appropriate encoder;
JSON string escaping does not make text safe for every HTML, shell or SQL context. Keep secrets
out of public runtime config and inspect where generated artifacts are shipped.
