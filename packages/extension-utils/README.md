# `@onderwijsin/directus-extension-utils`

Framework-neutral utilities shared by Onderwijs in Directus extensions. This package exists to keep
small, stable runtime helpers in one place instead of reimplementing them in every extension. The
current API includes primitive guards, attempted operations, object conversions, MIME
classification, explicit environment predicates, UUID generation, logging adapters, and reusable
types. It deliberately does not contain Directus services, extension registration, or schema
validation.

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

Attempted operations can return failures as data instead of throwing:

```ts
import { attempt, attemptWithRetry } from '@onderwijsin/directus-extension-utils'

const result = await attempt(() => fetchValue())
if (result.error === null) console.log(result.data)

const retried = await attemptWithRetry(() => fetchValue(), { attempts: 3, delayMs: 250 })

// A retry result contains the final failure instead of throwing.
if (retried.error !== null) console.error(retried.error)
```

MIME values can be classified with the default registry or extended for a consuming project:

```ts
import { classifyMimeType } from '@onderwijsin/directus-extension-utils'

classifyMimeType('image/webp') // 'image'
classifyMimeType('application/vnd.example.custom', {
  documentMimeTypes: ['application/vnd.example.custom'],
}) // 'document'
```

Environment and CLI predicates accept explicit state, so they do not depend on global process
objects:

```ts
import {
  isCiEnvironment,
  isInteractive,
  shouldSkipConfirmation,
} from '@onderwijsin/directus-extension-utils'

const interactive = isInteractive({ stdinIsTTY: true, stdoutIsTTY: true })
const ci = isCiEnvironment({ CI: 'true' })
const skip = shouldSkipConfirmation({ interactive, ci })
```

Generate random or deterministic UUIDs without relying on a consuming project's UUID setup:

```ts
import { generateDeterministicUUID, generateUUID } from '@onderwijsin/directus-extension-utils'

const randomId = generateUUID()
const stableId = generateDeterministicUUID('external-item')
```

The `Logger` contract and `createLogger` adapter accept runtime-provided loggers while providing a
console fallback. Pino and Directus logger adapters remain outside the shared package surface.

Typed object helpers preserve the object's key/value types at the call site:

```ts
import { fromEntries, keys, toEntries } from '@onderwijsin/directus-extension-utils'

const settings = { enabled: true, retries: 3 } as const
toEntries(settings)
keys(settings)
fromEntries([
  ['enabled', true],
  ['retries', 3],
])
```

`toEntries` and `keys` use own enumerable string keys. `fromEntries` accepts any iterable and uses
the standard last-entry-wins behavior for duplicate keys.

Create a logger adapter when a consuming runtime supplies only some logging methods:

```ts
import { createLogger } from '@onderwijsin/directus-extension-utils'

const logger = createLogger({ info: (message, fields) => audit.info(message, fields) })
logger.warn('Using a fallback for an unavailable integration')
```

The adapter preserves supplied methods and falls back independently to `console` for missing
methods. `trace` and `debug` are optional on the logger contract; `info`, `warn`, and `error` are
always available.

The package also exports `PartialNested`, `Geometry`, and `LngLatCoordinates` for framework-neutral
typing. `PartialNested` recursively makes object properties optional while preserving functions and
constructors.

Runtime-aware subpaths are available when an extension has an explicit runtime boundary:

```ts
import { isRecord } from '@onderwijsin/directus-extension-utils/server'
import { isString } from '@onderwijsin/directus-extension-utils/app'
import { isDefined } from '@onderwijsin/directus-extension-utils/shared'
```

The root and `shared` exports are the framework-neutral public surface. `server` and `app` currently
re-export the shared helpers so runtime-specific utilities can be added later without changing
consumer imports. The implementation module is internal; import guards from the root or `/shared`.

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

Tests live in [`__tests__/`](./__tests__/) and cover the public helper behavior and export contract.
Prefer focused unit tests for deterministic helpers. Do not add tests solely to increase coverage,
and do not test private implementation details when a public import expresses the consumer contract.

Run the package tests or the full repository suite with:

```sh
pnpm test -- packages/extension-utils/__tests__
pnpm test
```
