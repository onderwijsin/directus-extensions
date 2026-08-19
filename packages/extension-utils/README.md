# `@onderwijsin/directus-extension-utils`

Small, reusable utilities for Directus extensions. The package is runtime-portable across Directus
setups, but is intended to run inside Directus—not as a framework-agnostic utility library.

The public surface includes:

- runtime guards, attempt/retry helpers, object helpers, MIME classification, and UUIDs;
- server-only locks, debounced auto-task handlers, task storage, logging, and extension setup
  helpers; and
- reusable Directus extension types.

## Install

```sh
pnpm add @onderwijsin/directus-extension-utils
```

## Import

Use the root entry point for common helpers:

```ts
import { isRecord, uuid } from '@onderwijsin/directus-extension-utils'
```

Use `/server` for server-only utilities:

```ts
import {
  createAutoTaskHandler,
  createRedisTaskHandlerStorage,
  createRedisLockProvider,
} from '@onderwijsin/directus-extension-utils/server'
```

Use `/sentry` when an extension explicitly needs the Sentry helpers. This separate entry point keeps
Sentry out of consumers that only import `/server` utilities:

```ts
import { captureException } from '@onderwijsin/directus-extension-utils/sentry'
```

The shared Directus extension build configuration is available as an unbundled package subpath:

```js
import config, {
  createExtensionConfig,
} from '@onderwijsin/directus-extension-utils/extension.config.js'

export default createExtensionConfig({ externals: ['oxfmt'] })
// Or: export default config
```

Use `/constants` for shared deployment-environment values:

```ts
import { DEPLOYMENT_ENV, deploymentEnvs } from '@onderwijsin/directus-extension-utils/constants'

const environment: DEPLOYMENT_ENV = 'development'
console.log(deploymentEnvs, environment)
```

`deploymentEnvs` is the readonly tuple `['development', 'staging', 'production']`, and
`DEPLOYMENT_ENV` is its corresponding TypeScript union.

Use the accountability factories when a service needs admin permissions. The system variant
identifies the operation as owned by Directus system code:

```ts
import {
  createAdminAccountability,
  createSystemAdminAccountability,
} from '@onderwijsin/directus-extension-utils'

const admin = createAdminAccountability()
const systemAdmin = createSystemAdminAccountability()
```

Create a logger from a Pino-compatible runtime logger, or use the console-backed fallback:

```ts
import { createLogger } from '@onderwijsin/directus-extension-utils/server'

const logger = createLogger(context.logger)
logger.info({ msg: 'Extension started', extension: 'orders' })
```

When a logger is provided, it is returned unchanged. Without one, the fallback exposes the same
`info`, `warn`, `error`, `debug`, and `trace` methods and forwards messages plus optional fields to
the corresponding console methods.

The `/app` and `/shared` entry points expose the common browser-safe surface. Do not import locks,
tasks, task storage, logging, or setup helpers from those paths.

Use `/server` setup helpers at an API extension boundary:

```ts
import {
  extensionSetup,
  validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'
import { envSchema } from './env.schema'

const setup = extensionSetup('my-extension', env, logger)
setup.start()
if (!setup.isEnabled()) return
const options = validateExtensionOptions(env, envSchema, logger)
// Register routes or other API behavior using options.
setup.end()
```

For extensions that modify Directus schema, compose the entrypoint environment schema with the
shared server-side schema-change settings:

```ts
import { schemaChangeSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

const envSchema = schemaChangeSchema.extend({
  MY_EXTENSION_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
})
```

`schemaChangeSchema` validates `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`, which defaults to
`true`, and supports `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` (`MEMORY`, `REDIS`, or `FS`). `REDIS` uses
`DIRECTUS_EXTENSIONS_LOCK_REDIS_URL` when set, otherwise the standard Directus `REDIS` connection;
`FS` requires `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`. It also exposes the shared
`DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE` setting (`memory` by default, or `redis`) and validates the
Directus `REDIS` connection when the Redis store is selected.

Use `ensureDirectusSchema` from the same `/server` subpath to apply portable collection, field, and
relation definitions. Use `replaceCollectionNameInSchema(name, schema)` when a bundled portable
schema supports a configurable collection name. Every collection definition must include a non-blank
`schema.name` and its primary-key field in the collection's nested `fields` array; do not repeat
that primary-key field in the top-level `fields` array. This prevents Directus from creating an
implicit integer primary key before the extension's intended field is applied. Pass the Directus
hook context's `database`, `getSchema`, and `services`, and provide a logger plus an extension
identifier. Existing compatible resources are preserved; incompatible structural resources are
logged loudly and left unchanged rather than being silently modified. The validated environment
options select the provider automatically. Set `options.lockProvider` to override that selection
programmatically. Redis providers created from environment options are disposed after the ensure
operation; explicitly supplied providers remain owned by the consumer.

`extensionSetup` logs lifecycle messages and supports an environment-based enabled flag.
`validateExtensionOptions` parses a complete extension environment with Zod, logs validation
details, and throws when the configuration is invalid.

Schema configuration and operation options:

| Option                                       | Scope     | Default          | Purpose                                                     |
| -------------------------------------------- | --------- | ---------------- | ----------------------------------------------------------- |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | global    | `true`           | Master switch for schema setup.                             |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          | global    | `MEMORY`         | Selects `MEMORY`, `REDIS`, or `FS`.                         |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         | global    | —                | Optional override; falls back to Directus `REDIS`.          |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      | global    | —                | Required for the filesystem provider.                       |
| `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`     | global    | `memory`         | Selects the process-local or Redis extension limiter store. |
| `REDIS`                                      | Directus  | —                | Required by extension limiters when the store is `redis`.   |
| `lockProviderConfig`                         | operation | —                | Uses validated environment config to create a provider.     |
| `lockProvider`                               | operation | —                | Supplies a consumer-owned provider directly.                |
| `abortOnError`                               | operation | `true`           | Rethrows service failures after logging them.               |
| `lockLeaseMs`                                | operation | provider default | Overrides one lock acquisition lease.                       |

`ensureDirectusSchema` always coordinates the operation with a lock and returns
`{ changed, skipped }`. It creates missing resources, skips compatible resources, and logs
incompatible collections, fields, or relations without changing them. Structural compatibility is
deliberately narrow: collection identity, field identity/type, and relation endpoints are
authoritative; interfaces, displays, labels, icons, visibility, notes, and similar UI metadata are
left under the site's control. It logs an info-level pre-operation plan and post-operation summary;
per-resource and lock lifecycle details use debug-level logging. Bundled extension definitions are
trusted data and do not need a second runtime Zod schema.

Use `getSchemaChangeStatus` to check the same lock from another code path without acquiring,
renewing, releasing, or repairing it:

```ts
import { getSchemaChangeStatus } from '@onderwijsin/directus-extension-utils/server'

const status = await getSchemaChangeStatus({
  extensionId: 'orders',
  options: { lockProviderConfig: options },
})

if (status.isLocked) {
  // The schema ensure operation is still in progress.
}
```

The status query must use the same provider configuration and extension identifier as the ensure
operation. Memory providers with the same `providerId` share state within one process; the schema
management factory uses the stable `schema-change` provider ID so independently created ensure and
status providers can observe one another. Use Redis or a shared filesystem provider for separate
processes.

All lock providers use the same `tryAcquire`/`isLocked`/lease contract and `defaultLeaseMs` option.
Choose the memory provider for one process, the filesystem provider for processes sharing a
directory, or the Redis provider for shared coordination across replicas. When creating memory
providers directly, use the same `providerId` for callers that must coordinate and different IDs for
isolated lock namespaces.

Auto-task handlers clear a marker only after the task succeeds. Task failures and lost leases are
reported through `onError` and leave the marker pending for a later trigger; failed tasks are not
automatically retried. Tasks should honor the supplied `AbortSignal` and be safe to run again.

## Documentation

Start with the
[extension-utils cookbook article](https://github.com/onderwijsin/directus-extensions/blob/main/docs/extension-cookbook/extension-utils.md)
for usage examples and the
[utility glossary](https://github.com/onderwijsin/directus-extensions/blob/main/docs/extension-cookbook/extension-utils-glossary.md)
for coordination terminology. Maintainers can use the
[API reference](https://github.com/onderwijsin/directus-extensions/blob/main/.agents/skills/directus-extension-utils/references/api-reference.md)
for the complete export and option surface.
