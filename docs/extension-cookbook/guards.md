# Primitive runtime guards

`@onderwijsin/directus-extension-utils` provides these small runtime guards:

`isDefined`, `isRecord`, `isArray`, `isString`, `isNonEmptyString`, `isNonBlankString`, `isNumber`,
`isFiniteNumber`, `isInteger`, `isBoolean`, `isFunction`, `hasKeys`, and `hasKey`.

They answer one small runtime question and provide TypeScript narrowing. They do not parse, coerce,
validate structured external input, or produce diagnostics. Use Zod for structured boundaries and a
local predicate for a domain-specific shape.

The guard semantics are intentionally small so they can be reused across Directus extension
runtimes.
