# Primitive runtime guards

Read this article when code narrows unknown network, persisted, configuration, or error data, or
when considering a new primitive predicate. It defines the selection boundary between a shared
guard, a local domain predicate, and Zod.

The guards in `@onderwijsin/directus-extension-utils` are small predicates for ordinary runtime
control flow and TypeScript narrowing. They are not a schema system, input-validation framework,
replacement for Zod, parsing/coercion layer, or generic collection for every one-off predicate.

## Selection rule

For generic primitive narrowing, first use the matching public guard instead of repeating its
implementation with `typeof`, `Array.isArray`, or `Object.hasOwn`. Compose guards when interpreting
an unknown record. This keeps narrowing semantics consistent across extensions.

Keep a local predicate when it expresses a stricter or domain-specific shape. Use Zod when an
external boundary needs structured validation, parsing or coercion, composition, or diagnostics. A
local exception should make the additional semantics clear in its name and implementation; do not
create an alias that merely duplicates a shared guard.

## Import and compose guards

Use the common entry point in server or app code:

```ts
import { hasKey, isRecord, isString } from '@onderwijsin/directus-extension-utils'

export function getWebhookName(value: unknown): string | undefined {
  if (!isRecord(value) || !hasKey(value, 'name') || !isString(value.name)) return undefined

  const name = value.name.trim()
  return name === '' ? undefined : name
}
```

The guards narrow one property at a time. They do not prove that the complete value matches a
business schema. Validate that boundary separately when more than primitive narrowing is needed:

```ts
import { z } from 'zod'

const webhookSchema = z.object({
  name: z.string().trim().min(1),
  active: z.boolean().default(true),
})

const webhook = webhookSchema.parse(input)
```

## API reference

| Guard              | Signature                                                                                          | Semantics                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `isDefined`        | `isDefined<T>(value: T): value is Exclude<T, undefined>`                                           | Checks only for `undefined`; `null`, `false`, `0`, and `''` are defined.                                                   |
| `isRecord`         | `isRecord(value: unknown): value is Record<string, unknown>`                                       | Accepts non-null objects excluding arrays, including null-prototype objects. It does not require a plain-object prototype. |
| `isArray`          | `isArray(value: unknown): value is unknown[]`                                                      | Checks `Array.isArray`.                                                                                                    |
| `isString`         | `isString(value: unknown): value is string`                                                        | Checks the string type, including `''`.                                                                                    |
| `isNonEmptyString` | `isNonEmptyString(value: unknown): value is string`                                                | Requires one or more characters; whitespace counts.                                                                        |
| `isNonBlankString` | `isNonBlankString(value: unknown): value is string`                                                | Requires one or more non-whitespace characters.                                                                            |
| `isNumber`         | `isNumber(value: unknown): value is number`                                                        | Checks the number type; `NaN` and infinities pass.                                                                         |
| `isPrimaryKey`     | `isPrimaryKey(value: unknown): value is string \| number`                                          | Accepts Directus string or numeric primary keys.                                                                           |
| `isFiniteNumber`   | `isFiniteNumber(value: unknown): value is number`                                                  | Accepts numbers except `NaN`, `Infinity`, and `-Infinity`.                                                                 |
| `isInteger`        | `isInteger(value: unknown): value is number`                                                       | Checks `Number.isInteger`; non-finite values and fractions fail.                                                           |
| `isBoolean`        | `isBoolean(value: unknown): value is boolean`                                                      | Checks the boolean type.                                                                                                   |
| `isFunction`       | `isFunction(value: unknown): value is (...args: never[]) => unknown`                               | Checks whether a value is callable.                                                                                        |
| `hasKeys`          | `hasKeys(value: Record<string, unknown>): boolean`                                                 | Checks for one or more own enumerable string keys.                                                                         |
| `hasKey`           | `hasKey<Key extends PropertyKey>(value: object, key: Key): value is object & Record<Key, unknown>` | Checks an own property with `Object.hasOwn`, never the prototype chain.                                                    |

For example, `isNumber` intentionally accepts values that `isFiniteNumber` rejects:

```ts
import { isFiniteNumber, isNumber } from '@onderwijsin/directus-extension-utils'

function formatAmount(value: unknown): string {
  if (!isFiniteNumber(value)) return 'unknown'
  return value.toFixed(2)
}

isNumber(Number.NaN) // true
isFiniteNumber(Number.NaN) // false
```

## Design constraints

Each guard answers one small runtime question with literal, explicit semantics. Guards are
dependency-free type predicates: they do not coerce values, report errors, parse input, compose
schemas, or provide broad generic `isEmpty` behavior. Specialized and domain-specific predicates may
remain local.

`isRecord` differs from a stricter local `isPlainObject` predicate. Keep a local plain-object check
when prototypes must be exactly `Object.prototype` or `null`, such as recursive form cloning.

## When to add a new guard — and when not to

Add a guard to `@onderwijsin/directus-extension-utils` when it represents a small generic runtime
property, has multiple credible extension usages (or is an obvious primitive counterpart), has
stable semantics, and materially improves readability or narrowing.

Keep it local when it is domain-specific, validates a structured shape, needs parsing/coercion,
diagnostics, options, composition, or context, belongs at an external boundary where Zod is more
appropriate, or has only one specialized use.

> Prefer a shared guard when it gives a common primitive runtime check a clear name. Prefer a local
> predicate or Zod when the check describes application or domain structure.
