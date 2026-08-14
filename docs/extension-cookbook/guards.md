# Primitive runtime guards

Port these framework-neutral guards into `@onderwijsin/directus-extension-utils`:

`isDefined`, `isRecord`, `isArray`, `isString`, `isNonEmptyString`, `isNonBlankString`, `isNumber`,
`isFiniteNumber`, `isInteger`, `isBoolean`, `isFunction`, `hasKeys`, and `hasKey`.

They answer one small runtime question and provide TypeScript narrowing. They do not parse, coerce,
validate structured external input, or produce diagnostics. Use Zod for structured boundaries and a
local predicate for a domain-specific shape.

The guard semantics and focused tests may be ported nearly unchanged from the Nuxt module-utils
package because they are framework-neutral.
