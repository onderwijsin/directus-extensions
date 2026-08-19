# `@onderwijsin/directus-extension-utils`

Small, reusable utilities for Directus extensions. The package is runtime-portable across Directus
setups, but is intended to run inside Directus—not as a framework-agnostic utility library.

The public surface includes:

- runtime guards, attempt/retry helpers, object helpers, MIME classification, and UUIDs;
- server-only async Express adapters, locks, debounced auto-task handlers, task storage, logging,
  and extension setup helpers; and
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
  asyncHandler,
  createAutoTaskHandler,
  initializeCache,
  createRedisTaskHandlerStorage,
  createRedisLockProvider,
} from '@onderwijsin/directus-extension-utils/server'
```

Create a local or Redis-backed cache from validated Directus environment values:

```ts
import { initializeCache } from '@onderwijsin/directus-extension-utils/server'

const cache = initializeCache(env, { ttl: 60_000 })
const cached = await cache?.get('orders:summary')
```

`cacheConfigSchema` validates Directus cache and Redis settings. `REDIS` takes precedence over
`REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, and `REDIS_PASSWORD`; component configuration requires
`REDIS_ENABLED=true` and all four values. Disabled caching returns `null`; an unset `CACHE_STORE`
uses `memory`, even though `initializeCache` maps memory to the library's local backend. TTL values
must be finite and positive.

The server entrypoint also exports `emailConfigSchema`, `requiredEmailConfigSchema`, and
`isEmailConfigured`. The base email schema supplies Directus defaults without requiring a transport;
the required schema validates prerequisites for `sendmail`, `smtp`, `mailgun`, and `ses`.

Wrap asynchronous endpoint handlers and middleware with `asyncHandler` so rejected promises reach
Directus's Express 4 error handling:

```ts
router.post(
  '/route',
  asyncHandler(async (request, response) => {
    const result = await doSomething(request)
    response.json(result)
  }),
)
```

Middleware can call `next()` explicitly after asynchronous work:

```ts
router.use(
  asyncHandler(async (_request, _response, next) => {
    await checkAccess()
    next()
  }),
)
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
import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

const envSchema = directusStartupSchema.extend({
  MY_EXTENSION_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
})
```

`directusStartupSchema` validates `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`, which defaults to
`true`, and supports `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` (`memory`, `redis`, or `fs`). When unset,
the lock provider falls back to `SYNCHRONIZATION_STORE`. `redis` uses
`DIRECTUS_EXTENSIONS_LOCK_REDIS_URL` when set, otherwise the resolved Directus Redis configuration;
`fs` requires `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`. It also exposes the shared
`DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE` setting. When unset, it falls back to
`SYNCHRONIZATION_STORE`.

Use `ensureDirectusSchema` from the same `/server` subpath to apply portable collection, field, and
relation definitions. Use `withCollectionIdentity(name, schema)` when a bundled portable schema
supports a configurable collection name. Every collection definition must include a non-blank
`schema.name` and its primary-key field in the collection's nested `fields` array; do not repeat
that primary-key field in the top-level `fields` array. This prevents Directus from creating an
implicit integer primary key before the extension's intended field is applied. Pass the Directus
hook context's `database`, `getSchema`, and `services`, and provide a logger plus an extension
identifier. Existing compatible resources are preserved; incompatible structural resources are
logged loudly and left unchanged rather than being silently modified. The validated environment
options select the provider automatically. Set `options.lockProvider` to override that selection
programmatically. Redis providers created from environment options are disposed after the ensure
operation; explicitly supplied providers remain owned by the consumer.

Use `validateSchemaDefinition(...)` for bundled schema JSON before passing it to
`ensureDirectusSchema`; no type cast is required.

Use `validatePolicyDefinition(...)` for bundled policy JSON with nested `permissions`, then pass the
validated definition to `ensureDirectusPolicy`. The policy ensure operation processes the nested
permissions into `directus_permissions` rows linked to the policy; permission IDs are generated by
Directus as integers and must not be included in bundled definitions. Idempotency is based on the
natural key `policy + collection + action`; matching existing rows are preserved and are not
updated.

`extensionSetup` logs lifecycle messages and supports an environment-based enabled flag.
`validateExtensionOptions` parses a complete extension environment with Zod, logs validation
details, and throws when the configuration is invalid.

Schema configuration and operation options:

| Option                                                         | Scope       | Default          | Purpose                                                                              |
| -------------------------------------------------------------- | ----------- | ---------------- | ------------------------------------------------------------------------------------ |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`                   | global      | `true`           | Master switch for schema setup.                                                      |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`                        | global      | `true`           | Enables policy and future data seeds.                                                |
| `SYNCHRONIZATION_STORE`                                        | Directus    | `memory`         | Global fallback for synchronization-related extension stores.                        |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`                            | global      | unset            | Selects `memory`, `redis`, or `fs`; otherwise falls back to `SYNCHRONIZATION_STORE`. |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`                           | global      | —                | Optional override; otherwise uses resolved Redis settings.                           |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`                        | global      | —                | Required for the filesystem provider.                                                |
| `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`                       | global      | unset            | Selects the limiter store; otherwise falls back to `SYNCHRONIZATION_STORE`.          |
| `REDIS_ENABLED`                                                | Directus    | `false`          | Enables component-based Redis configuration.                                         |
| `REDIS`                                                        | Directus    | —                | Complete Redis URL; takes precedence over components.                                |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Directus    | —                | Required together when constructing a Redis URL.                                     |
| `lockProviderConfig`                                           | operation   | —                | Uses validated environment config to create a provider.                              |
| `lockProvider`                                                 | operation   | —                | Supplies a consumer-owned provider directly.                                         |
| `autoRenew`                                                    | coordinator | `true`           | Renews the startup lease while callbacks run.                                        |
| `abortOnError`                                                 | operation   | `true`           | Rethrows service failures after logging them.                                        |
| `lockLeaseMs`                                                  | operation   | provider default | Overrides one lock acquisition lease.                                                |

`ensureDirectusSchema` always coordinates the operation with a lock and returns
`{ changed, skipped }`. It creates missing resources, skips compatible resources, and logs
incompatible collections, fields, or relations without changing them. Structural compatibility is
deliberately narrow: collection identity, field identity/type, and relation endpoints are
authoritative; interfaces, displays, labels, icons, visibility, notes, and similar UI metadata are
left under the site's control. It logs an info-level pre-operation plan and post-operation summary;
per-resource and lock lifecycle details use debug-level logging. Bundled extension definitions are
trusted data and do not need a second runtime Zod schema.

Use `getDirectusStartupStatus` to check the shared startup lock from another code path without
acquiring, renewing, releasing, or repairing it:

```ts
import { getDirectusStartupStatus } from '@onderwijsin/directus-extension-utils/server'

const status = await getDirectusStartupStatus({
  id: 'orders',
  options: { lockProviderConfig: options },
})

if (status.isLocked) {
  // Schema and data startup work is still in progress.
}
```

Use `rejectWhileSchemaLocked` as endpoint middleware when requests must wait for startup schema
changes to finish. Pass custom error constructors when an endpoint needs its own public error code:

```ts
import { rejectWhileSchemaLocked } from '@onderwijsin/directus-extension-utils/server'

router.use((_request, _response, next) => {
  void rejectWhileSchemaLocked({ id: 'orders', options: schemaLockOptions }, next).then(
    (rejected) => {
      if (!rejected) next()
    },
  )
})
```

The status query must use the same provider configuration and extension identifier as the startup
coordinator. It is read-only and disposes only providers created from configuration. Use Redis or a
shared filesystem provider for separate processes.

Use `ensureDirectusPolicy` for policy data seeds. It creates a policy with its configured UUID and
name, preserves compatible policies, and idempotently creates its nested permission rows. It logs
UUID/name conflicts without modifying existing policies. Role assignments and user assignments are
separate future seeds.

Register startup work through `createDirectusStartupCoordinator`. It holds one lock and always runs
schema callbacks before data callbacks:

```ts
const startup = createDirectusStartupCoordinator(action, logger, {
  id: 'orders',
  name: 'Orders',
  disabled: false,
  disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
  dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
  lockProviderConfig: options,
})

startup.schema(async ({ lockProvider }) => {
  await ensureDirectusSchema({
    id: 'orders',
    database,
    getSchema,
    logger,
    services,
    definition: ordersDefinition,
    options: { lockProvider },
  })
})
```

The coordinator renews its startup lease by default while callbacks run. Set `autoRenew: false` only
when every callback is guaranteed to finish within the configured lease. Nested schema and data
ensures receive a borrowed provider and cannot release the coordinator-owned lease. If renewal is
lost, the coordinator stops before running the next callback and logs the failure.

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
