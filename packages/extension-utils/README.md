# `@onderwijsin/directus-extension-utils`

Framework-neutral utilities shared by Onderwijs in Directus extensions. This package exists to keep
small, stable runtime helpers in one place instead of reimplementing them in every extension. It
deliberately does not contain Directus services, extension registration, or schema validation.

For the complete API and design rules, read the
[extension-utils cookbook article](../../docs/extension-cookbook/extension-utils.md) and the
[primitive guards article](../../docs/extension-cookbook/guards.md).

## Usage

Install the package in an extension that needs a shared utility:

```sh
pnpm add @onderwijsin/directus-extension-utils
```

Import from the root for shared helpers:

```ts
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

if (isRecord(value) && isString(value.name)) {
  return value.name
}
```

Runtime-aware subpaths are available when an extension has an explicit runtime boundary:

```ts
import { isRecord } from '@onderwijsin/directus-extension-utils/server'
import { isString } from '@onderwijsin/directus-extension-utils/app'
import { isDefined } from '@onderwijsin/directus-extension-utils/shared'
```

The root and `shared` exports are the framework-neutral public surface. `server` and `app` currently
re-export the shared helpers so runtime-specific utilities can be added later without changing
consumer imports. The legacy `/guards` subpath remains available for compatibility.

## Extending the package

Add a helper only when it is framework-neutral, has stable semantics, and has more than one credible
consumer. Keep Directus-specific behavior in the owning extension. Add shared helpers to
`src/shared/` and export them through `src/shared/index.ts`; expose them from the root only when
they belong in the default shared API. Add runtime-specific helpers to `src/server/` or `src/app/`
without leaking them through the root export.

Use Zod for structured external input. These helpers are type-narrowing predicates, not parsers,
coercion utilities, or a schema system.

## Development

From the repository root:

```sh
pnpm --filter @onderwijsin/directus-extension-utils typecheck
pnpm --filter @onderwijsin/directus-extension-utils build
pnpm test:watch
```

The package has no standalone dev server or watch script. `build` writes generated declarations and
JavaScript to `dist/`; do not commit that output. Use the root watch command for an interactive
development loop.

## Testing policy

Tests live in [`__tests__/`](./__tests__/) and cover the public guard behavior and export contract.
Prefer focused unit tests for deterministic helpers. Do not add tests solely to increase coverage,
and do not test private implementation details when a public import expresses the consumer contract.

Run the package tests or the full repository suite with:

```sh
pnpm test -- packages/extension-utils/__tests__
pnpm test
```
