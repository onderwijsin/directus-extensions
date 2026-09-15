# `@onderwijsin/directus-extension-utils`

Small, reusable utilities for Directus extensions. The package is runtime-portable across Directus
setups, but is intended to run inside Directus—not as a framework-agnostic utility library.

The public surface includes:

- runtime guards (including Directus primary-key narrowing), attempt/retry helpers, object helpers,
  MIME classification, and UUIDs;
- server-only async Express adapters, locks, debounced auto-task handlers, task storage, logging,
  extension setup helpers, composable configuration fragments, and the Studio Docs article seeding
  contract; and
- reusable Directus extension types.

## Install

```sh
pnpm add @onderwijsin/directus-extension-utils
```

The server utilities use their own Zod runtime dependency. Consumers do not need to install or align
Zod when defining extension options through the package's schema builders. A consumer-owned Zod
schema can also be passed directly to `validateExtensionOptions`; this is a fully supported API.
When extension options combine shared configuration provided by extension-utils, use
`defineExtensionOptionsSchema` with declarative `include` fragments and build extension fields with
its `extend` callback. Shared dependencies are deduplicated by fragment identity, include order does
not change behavior, and duplicate top-level keys fail instead of overriding one another. The
specialized builders remain convenience APIs for one shared fragment. An extension may use another
Zod version for unrelated validation, but must not combine schemas from that runtime with the raw
shared schemas exported by this package. Use the `z` supplied to each builder callback for the
complete options definition, including nested schemas and helper output.

`ensureDirectusDocumentation` is the server-only contract for extensions that contribute articles to
the fixed `studio_docs` collection. It validates stable article input, honors the docs seed gate,
and reconciles changed content using either the main item or the reserved `incoming` content
version. Call it from a startup documentation callback; the coordinator runs documentation
independently of the ordinary extension schema and data gates.

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
  withCache,
  createRedisTaskHandlerStorage,
  createRedisLockProvider,
  ensureDirectusDocumentation,
} from '@onderwijsin/directus-extension-utils/server'
```

Use `/hook` when defining an API hook with asynchronous action handlers. This subpath contains the
corrected Directus hook types and keeps `@directus/extensions-sdk` isolated from consumers that only
import server utilities:

```ts
import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
```

Import only the corrected hook types from `/types` when a utility needs the compile-time contract
without the hook runtime:

```ts
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
```

Use the server policy utilities when an extension must resolve Directus policy assignments,
including nested roles and `ip_access` filtering. The first accountability controls whose policy
assignments are resolved; by default it also controls CRUD filtering while reading `directus_access`
and `directus_policies`:

```ts
import {
  fetchPolicies,
  hasPolicies,
  initializePolicyCache,
} from '@onderwijsin/directus-extension-utils/server'

const policyCache = initializePolicyCache(env)
const policies = await fetchPolicies(accountability, services, schema, policyCache)
const allowed = await hasPolicies(accountability, policyId, services, schema, policyCache)
```

Pass a final `null` read accountability only for a trusted server-side consumer that must resolve
assignments without CRUD filtering. This bypass reads policy metadata with system accountability and
must not be used before returning policies to a client unless exposing all matching policy metadata
is intentional:

```ts
const policies = await fetchPolicies(accountability, services, schema, policyCache, null)
const allowed = await hasPolicies(accountability, policyId, services, schema, policyCache, null)
```

The policies endpoint uses the default user-scoped mode. Its callers therefore need read access to
the relevant `directus_access` and `directus_policies` records, directly or through a role.

Initialize a policy cache once during extension startup with `initializePolicyCache`. It returns
`null` when caching is disabled or Redis configuration is invalid. Pass that cache to policy
helpers; they never initialize Redis clients on the request path. The Redis-only policy cache uses
the shared `directus:policies` namespace so separate extension entrypoints can invalidate it.

Create a local or Redis-backed cache from validated Directus environment values:

```ts
import { initializeCache, withCache } from '@onderwijsin/directus-extension-utils/server'

const cache = initializeCache(context.env, {
  ttl: 60_000,
  namespace: 'directus:extensions:my-extension:summary',
})
const summaryCacheKey = (collection: string): string => `summary:${collection}`

const summary = await withCache({ cache, key: summaryCacheKey('orders') }, () =>
  loadSummary('orders'),
)
```

`withCache` accepts a `Cache | null`, an explicit cache key, and an asynchronous cache-miss handler:

```ts
withCache<TResult>(
  options: { cache: Cache | null; key: string },
  handler: () => Promise<TResult>,
): Promise<TResult>
```

The handler runs only on a cache miss, and its resolved value is stored under the explicit key. A
`null` cache bypasses cache reads and writes while still invoking the handler. Keep key construction
next to the cached operation and use stable extension-specific prefixes such as
`fields:<collection>` or `summary:<collection>`; key construction has no implicit extension prefix.

For mutation-driven invalidation, use `registerCollectionCacheInvalidation` with the same key
function used by `withCache`:

```ts
registerCollectionCacheInvalidation(
  'articles',
  { cache, key: (collection) => `fields:${collection}` },
  hook,
  context,
)
```

Invalidation deletes the exact key associated with the mutated collection. It is non-blocking and
logs deletion failures; use Redis when invalidation must be visible across Directus processes. Pass
a string for regular item events, an array for explicit event targets, or an object to select
create/update/delete events and system-collection handling.

The related public types are `CacheEnv`, `CacheOptions` (`ttl`, a finite positive number),
`WithCacheOptions` (`cache` plus `key`), `CollectionInput`, and
`CollectionCacheInvalidationOptions`.

Use `defineCacheConfigSchema` when adding extension-specific fields to the shared cache settings:

```ts
import { defineCacheConfigSchema } from '@onderwijsin/directus-extension-utils/server'

export const envSchema = defineCacheConfigSchema((z) => ({
  CATALOG_CACHE_NAMESPACE: z.string().default('catalog'),
}))
```

Publishable extensions must provide an explicit extension-specific `CacheOptions.namespace` for
extension-owned caches. Use separate subsystem namespaces when targeted invalidation is useful.
`CacheOptions.namespace` isolates Redis keys and makes `clear()` namespace-scoped. Local caches have
a private store per initialized instance; a namespace does not make separate local instances share
data. `cacheConfigSchema` validates Directus cache and Redis settings. `REDIS` takes precedence over
`REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, and `REDIS_PASSWORD`; component configuration requires
`REDIS_ENABLED=true` and all four values. Disabled caching returns `null`; an unset `CACHE_STORE`
uses `memory`, even though `initializeCache` maps memory to the library's local backend. TTL values
must be finite and positive. Policy caching is the exception: it deliberately ignores memory and
requires valid Redis configuration.

The server entrypoint also exports `defineEmailConfigSchema`, `defineRequiredEmailConfigSchema`, and
`isEmailConfigured`. The optional builder supplies Directus defaults without requiring a transport;
the required builder validates the minimum shared prerequisites for the selected transport. For
SMTP, that means only `EMAIL_SMTP_HOST`; the SMTP port, username, password, and other transport
options are left to Directus and the consumer to configure and validate. The corresponding raw
schemas remain available for backward compatibility.

Wrap asynchronous endpoint handlers and middleware with `asyncHandler` so rejected promises reach
Directus's Express 4 error handling:

The callback receives an Express request typed with Directus's `accountability` property, which is
`Accountability | null`.

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

### Zod-safe extension options

Compose extension-utils shared configuration declaratively with `defineExtensionOptionsSchema`.
`include` accepts one or more package-owned fragments, and `extend` adds extension-specific
top-level fields with the Zod runtime owned by extension-utils:

```ts
// env.schema.ts
import {
  cacheConfig,
  defineExtensionOptionsSchema,
  directusStartupConfig,
} from '@onderwijsin/directus-extension-utils/server'

export const envSchema = defineExtensionOptionsSchema({
  include: [directusStartupConfig, cacheConfig],
  extend: (z) => ({
    CATALOG_ENABLED: z.boolean().default(true),
    CATALOG_URL: z.url(),
  }),
})
```

Composition is order-independent. A fragment's transitive dependencies are collected once by object
identity, so the example composes Redis once even though startup and cache both depend on it. Each
fragment owns an explicit shallow top-level shape and any cross-field refinement it needs; the
package does not inspect Zod internals. If two different fragments declare the same top-level key,
or `extend` repeats a fragment key, schema materialization throws a duplicate-key error. There is no
override or last-wins mode.

The six public shared configuration fragments are:

| Fragment                | Adds                                                                      | Dependencies             |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------ |
| `redisConfig`           | Directus Redis configuration.                                             | None.                    |
| `synchronizationConfig` | Synchronization store configuration.                                      | `redisConfig`.           |
| `cacheConfig`           | Cache configuration and its Redis cross-field validation.                 | `redisConfig`.           |
| `emailConfig`           | Optional email transport configuration.                                   | None.                    |
| `requiredEmailConfig`   | Selected-transport email prerequisites.                                   | `emailConfig`.           |
| `directusStartupConfig` | Directus startup, locking, and rate-limiter configuration and validation. | `synchronizationConfig`. |

The specialized builders remain convenience APIs implemented through the same fragment composer:

| Builder                             | Equivalent included fragment |
| ----------------------------------- | ---------------------------- |
| `defineRedisConfigSchema`           | `redisConfig`                |
| `defineSynchronizationConfigSchema` | `synchronizationConfig`      |
| `defineCacheConfigSchema`           | `cacheConfig`                |
| `defineEmailConfigSchema`           | `emailConfig`                |
| `defineRequiredEmailConfigSchema`   | `requiredEmailConfig`        |
| `defineDirectusStartupSchema`       | `directusStartupConfig`      |

The returned `ExtensionOptionsDefinition<Output>` is opaque. Most consumers rely on inference; the
type-only `ExtensionOptionsConfigFragment`, `ExtensionOptionsSchemaBuilder`, and
`ExtensionOptionsShapeBuilder` exports are available when a helper needs to name a fragment,
ordinary-schema callback, or shared-shape callback.

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

Schema definitions created by these builders are intentionally opaque: do not call `.parse()`,
`.safeParse()`, `.extend()`, or `.safeExtend()` on them. Define every field inside the callback and
use `validateExtensionOptions` to obtain the inferred, validated output. The specialized builders
`defineRedisConfigSchema`, `defineSynchronizationConfigSchema`, `defineCacheConfigSchema`,
`defineEmailConfigSchema`, `defineRequiredEmailConfigSchema`, and `defineDirectusStartupSchema` add
their matching shared fragment before validation. The callback-only form remains supported for a
complete schema that does not use shared extension-utils configuration:

```ts
export const standaloneEnvSchema = defineExtensionOptionsSchema((z) =>
  z.object({ CATALOG_URL: z.url() }),
)
```

Build nested schemas with the builder callback's runtime. Make a reusable nested-schema helper a
factory that receives that callback value, rather than closing over a separately imported `z`:

```ts
import { defineExtensionOptionsSchema } from '@onderwijsin/directus-extension-utils/server'

export const envSchema = defineExtensionOptionsSchema((z) => {
  const catalogFields = (builderZ: typeof z) => ({
    CATALOG_CONNECTION: builderZ.object({
      URL: builderZ.url(),
      TIMEOUT: builderZ.number().int().positive().default(5_000),
    }),
  })

  return z.object(catalogFields(z))
})
```

The supplied callback value is the builder's mixed-runtime safeguard. The package does not traverse
Zod's internal schema graph or reject schemas captured from another runtime, so using a separately
imported `z` inside the callback can reintroduce version-sensitive behavior.
`validateExtensionOptions` also fully supports a consumer-owned raw Zod schema. Passing a standalone
consumer-owned schema directly does not mix Zod runtimes. The mixed-runtime risk arises when a
consumer-owned schema is composed with a raw shared schema from extension-utils that uses a
different Zod runtime. When using extension-utils-provided shared configuration, prefer fragment
composition or the corresponding one-fragment builder because both supply the package-owned runtime.
The package continues to export its raw shared schemas for compatibility; combining them across Zod
runtimes remains version-sensitive.

For extensions that modify Directus schema, compose the entrypoint environment schema with the
shared server-side schema-change settings:

```ts
import {
  defineExtensionOptionsSchema,
  directusStartupConfig,
} from '@onderwijsin/directus-extension-utils/server'

const envSchema = defineExtensionOptionsSchema({
  include: [directusStartupConfig],
  extend: (z) => ({
    MY_EXTENSION_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
  }),
})
```

`defineDirectusStartupSchema` remains the concise equivalent when startup is the only shared
configuration fragment.

The fragment validates `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`, which defaults to `true`, and
supports `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` (`memory`, `redis`, or `fs`). When unset, the lock
provider falls back to `SYNCHRONIZATION_STORE`. `redis` uses `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`
when set, otherwise the resolved Directus Redis configuration; `fs` requires
`DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`. It also exposes the shared
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
`validateExtensionOptions` materializes package-owned schema definitions, parses a complete
extension environment with Zod, logs validation details, and throws when the configuration is
invalid.

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
| `abortOnError`                                                 | coordinator | `true`           | Rethrows provider, callback, and lost-lease failures after cleanup.                  |
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

The status query must use the same provider configuration and extension identifier as the startup
coordinator. It is read-only and disposes only providers created from configuration. Use Redis or a
shared filesystem provider for separate processes.

Use `ensureDirectusPolicy` for policy data seeds. It creates a policy with its configured UUID and
name, preserves compatible policies, and idempotently creates its nested permission rows. It logs
UUID/name conflicts without modifying existing policies. Role assignments and user assignments are
separate future seeds.

Register startup work through `createDirectusStartupCoordinator`. It coordinates each phase with a
lock, registers schema callbacks on `app.before`, and registers data and documentation callbacks on
the awaited `middlewares.before` lifecycle event. Documentation callbacks are independent of the
ordinary global schema/data gates:

```ts
const startup = createDirectusStartupCoordinator(hook, logger, {
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

Schema callbacks always register on Directus's awaited `app.before` lifecycle event, while data
callbacks register on Directus's awaited `middlewares.before` lifecycle event. Provider and callback
failures are logged and then rethrown by default after the coordinator releases its lease and
disposes any provider it created. Set `abortOnError: false` only for deliberate best-effort startup.

```ts
const startup = createDirectusStartupCoordinator(hook, logger, {
  id: 'studio-docs',
  name: 'Studio Docs',
  disabled: false,
  disabledGlobally: false,
  dataDisabledGlobally: false,
})
```

Contribute a stable article from a startup documentation callback. The helper is server-only and
targets the fixed `studio_docs` collection owned by `@onderwijsin/directus-studio-docs-bundle`:

```ts
import { ensureDirectusDocumentation } from '@onderwijsin/directus-extension-utils/server'

startup.documentation(async ({ lockProvider }) => {
  await ensureDirectusDocumentation(
    {
      id: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
      navigation_label: 'Getting started',
      body: '# Getting started\n\nWrite the article in Markdown.',
    },
    context,
    { lockProvider, extensionName: 'Orders' },
  )
})
```

`ensureDirectusDocumentation` honors `DIRECTUS_DOCS_ENABLED` and `DIRECTUS_DOCS_SEED_ENABLED`.
Documentation callbacks are not blocked by `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` or
`DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`; those gates continue to control ordinary extension work.
Pass `extensionSeedEnabled: false` to opt out one contributor. Stable UUIDs in the `id` field
identify the article; `icon` and `archived` have defaults. The default `versioning` strategy updates
the reserved `incoming` version, while `override` replaces the main item. Incoming content is never
promoted automatically.

The coordinator renews its startup lease by default while callbacks run. Set `autoRenew: false` only
when every callback is guaranteed to finish within the configured lease. Nested schema and data
ensures receive a borrowed provider and cannot release the coordinator-owned lease. If renewal is
lost, the coordinator stops before running the next callback and logs the failure. If release
returns `false`, ownership was lost and the coordinator reports that failure instead of claiming a
successful release.

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
