---
name: directus-extension-utils
description: Use when implementing, reviewing, or documenting Directus extensions that could use @onderwijsin/directus-extension-utils, especially guards, Directus memory/KV, locks, auto-tasks, retries, MIME classification, UUIDs, logging, typed object helpers, or runtime-specific imports.
---

# Directus extension utilities

Use this skill when a Directus extension needs a small reusable helper. The package keeps common
behavior out of individual extensions while keeping Directus registration, environment selection,
service access, and application orchestration in the consuming extension. Utilities are runtime-
portable across Directus setups, not general-purpose libraries for non-Directus applications.

## Route the work

Read the smallest set of sources that covers the task, then inspect current source exports:

1. Always read [`docs/extension-cookbook/extension-utils.md`](../../../docs/extension-cookbook/extension-utils.md)
   and [`packages/extension-utils/README.md`](../../../packages/extension-utils/README.md).
2. For locks or auto-tasks, also read [`docs/extension-cookbook/extension-utils-glossary.md`](../../../docs/extension-cookbook/extension-utils-glossary.md).
3. For primitive narrowing, also read [`docs/extension-cookbook/guards.md`](../../../docs/extension-cookbook/guards.md).
4. For package, test, build, export, or documentation changes, follow
   [`docs/agent-workflow.md`](../../../docs/agent-workflow.md) and [`docs/workspace.md`](../../../docs/workspace.md).
5. For runtime-specific work, verify the package `exports` map in
   [`packages/extension-utils/package.json`](../../../packages/extension-utils/package.json).
6. Consult [`references/api-reference.md`](references/api-reference.md) for the complete API surface.

Treat `packages/extension-utils/src/` and its public export indexes as the implementation source of
truth. `dist/` is generated; rebuild it before using declarations or packed output as evidence.

## Choose the smallest utility

- Use a guard when one value needs runtime narrowing.
- Use `@directus/memory` caches for disposable derived data in Directus runtimes; cache misses are
  normal.
- Use a lock when one owner may perform work and ownership must be renewed or released.
- Use an auto-task handler when triggers must be debounced and execution coordinated.
- Use an attempt helper when an operation's failure should be returned as data.
- Use MIME helpers for classification, not structured input validation.
- Use `uuid()` for UUID v7 or deterministic UUID v5 values, and `uuidv4()` when an explicitly
  random UUID v4 is required.
- Use object helpers when preserving key/value types around standard object operations matters.
- Use `createLogger` when a runtime logger is partial or optional.

Do not add a utility for one extension, direct service orchestration, schema validation, environment
lookup, connection creation, or extension registration. Keep those concerns in the owning extension
while retaining shared Directus runtime integration in this package.
Use Zod for structured external input and local guards for small runtime narrowing.

## Runtime and import rules

The package has one shared Directus-extension implementation and five public import paths:

- `@onderwijsin/directus-extension-utils` — default shared surface;
- `@onderwijsin/directus-extension-utils/shared` — explicit browser-safe common surface;
- `@onderwijsin/directus-extension-utils/app` — browser-safe shared surface; and
- `@onderwijsin/directus-extension-utils/server` — common surface plus Directus-runtime utilities;
- `@onderwijsin/directus-extension-utils/constants` — shared deployment-environment constants; and
- `@onderwijsin/directus-extension-utils/sentry` — explicit Sentry utilities.

Import common browser-safe helpers from the root or `/shared`. Always use `/server` for
`createMemoryLockProvider`, `createRedisLockProvider`, `createFsLockProvider`,
`createAutoTaskHandler`, task-storage factories, marker stores, `createLogger`,
`extensionSetup`, `validateExtensionOptions`, `schemaChangeSchema`, `ensureDirectusSchema`, and
`registerSchemaChangeOnStart`. Never import
these Directus-runtime utilities from the root, `/shared`, or `/app`; the app path must remain free
of Node-only imports.

Use `/constants` for `deploymentEnvs` and `DEPLOYMENT_ENV` when defining or validating a shared
deployment-environment option. Keep extension environment schemas in the entrypoint's sibling
`src/env.schema.ts`, and import the schema into the entrypoint; do not inline the schema in a module
or server entrypoint.

Use `@directus/memory` for Directus runtime caches and KV state. Use `createRedisLockProvider` for
Redis-backed locks; it initializes and owns the Redis connection. Filesystem helpers remain explicit
server-only adapters because `@directus/memory` has no filesystem backend.

## Contract rules

### Directus memory

Use `createCache` for disposable derived data and `createKv` for coordination state such as
markers. Both support local and Redis-backed stores. Use `createRedisLockProvider` for Redis locks
so Redis connection ownership stays inside the utility.

### Locks

`tryAcquire` returns an owner-bound lease or `null` on contention. Always retain the lease and
release it in `finally`; call `renew` while long-running work continues. A `false` renewal or
release means the owner no longer owns the generation. Never release by name alone and never allow
an old owner to remove a replacement generation.

`createMemoryLockProvider` coordinates one provider instance in one process. Directus KV/Cache
locks coordinate clients sharing their configured backend. The filesystem adapter coordinates only
processes sharing its directory; it is not cluster-wide without shared storage.
All lock providers expose the same `defaultLeaseMs` and `tokenFactory` options where applicable;
`leaseMs` on `tryAcquire` overrides the provider default.

### Schema changes

Use `schemaChangeSchema` when an extension can create or update Directus collections, fields, or
relations. It validates the global enablement flags and selects a lock provider with
`DIRECTUS_EXTENSIONS_LOCK_PROVIDER=MEMORY|REDIS|FS`. Redis requires
`DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`; filesystem locking requires
`DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`.

Pass the validated environment options as `options.lockProviderConfig` to
`ensureDirectusSchema`. The utility creates and disposes providers selected from environment
configuration. An explicitly supplied `options.lockProvider` takes precedence and remains owned by
the consumer. Always pass `database`, `getSchema`, and the complete `ApiExtensionContext['services']`
object from the hook context.

Use `registerSchemaChangeOnStart` to centralize global and extension-specific disabled checks and
startup error logging. Schema definitions are trusted extension-owned data; do not add runtime Zod
schemas merely to validate bundled JSON files. Existing compatible resources are preserved,
incompatible structural resources are logged loudly and left unchanged; UI metadata is not
authoritative.

The schema-change configuration surface is:

| Setting | Scope | Default | Meaning |
| --- | --- | --- | --- |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | global | `true` | Master enablement switch. |
| `DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE` | global | `true` | Global default for lock coordination. |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` | global | `MEMORY` | Provider: `MEMORY`, `REDIS`, or `FS`. |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL` | global | — | Required for `REDIS`. |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY` | global | — | Required for `FS`. |
| `useLockedSchemaChange` | call | — | Enable or disable locking for one ensure. |
| `lockProviderConfig` | call | — | Validated config used to construct a provider. |
| `lockProvider` | call | — | Explicit provider, owned and disposed by the consumer. |
| `abortOnError` | call | `true` | Rethrow unexpected service failures when true. |
| `lockLeaseMs` | call | provider default | Override the acquisition lease. |

Recommended registration pattern:

```ts
registerSchemaChangeOnStart(
  action,
  logger,
  () => ensureDirectusSchema({
    extensionId: 'orders',
    database: context.database,
    getSchema: context.getSchema,
    services: context.services,
    logger,
    definition: ordersDefinition,
    options: {
      useLockedSchemaChange: options.DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE,
      lockProviderConfig: options,
    },
  }),
  {
    name: 'Orders',
    disabled: !options.ORDERS_SCHEMA_CHANGES_ENABLED,
    disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
  },
)
```

`ensureDirectusSchema` only treats structural invariants as authoritative: collection identity, field
type, and relation endpoints. It does not overwrite UI metadata. A second call should therefore be
safe and return no changes for compatible resources; incompatible resources are preserved and logged.
For live tests, use a unique temporary collection and delete it in `finally`; the E2E runner must also
remove its Compose project and disposable volumes on every exit path.

### Auto-tasks

`createAutoTaskHandler` records trigger generations, runs only the latest eligible generation, uses
the supplied `storage`, renews the task lease, and passes an `AbortSignal` to the task. The task must
stop promptly when the signal is aborted. A lost lease must not clear the marker. Use one storage
factory so the lock and marker store share a backend.

Use `createMemoryTaskHandlerStorage`, `createRedisTaskHandlerStorage`, or
`createFsTaskHandlerStorage` for the common providers. When supplied, `lockTimeoutMs` must be finite
and positive. It controls marker-operation locks for Redis and filesystem storage; for memory and
Redis task storage it also controls the provider default when an acquire call omits an explicit
lease. The handler supplies an explicit `taskLeaseMs` for task execution. `markerLeaseMs` limits how
long a pending generation remains eligible; `taskLeaseMs` controls the execution lock lifetime.
They default to five minutes but are independent. Use `handler.dispose()` to cancel pending timers
and `await storage.dispose()` when the extension shuts down. Errors are reported through `onError`
and do not make the trigger reject. Successful tasks clear their matching marker; task failures and
lease losses keep the marker pending for a later trigger, without automatic retry. Tasks should be
safe to retry.

Standalone marker stores are named `createMemoryMarkerStore`, `createRedisMarkerStore`, and
`createFsMarkerStore`. Marker writes preserve every generation; memory writes are process-local,
Redis writes use the backend KV lock, and filesystem writes are serialized per identifier within a
store instance plus the shared filesystem lock.

### Attempts

`attempt` and `attemptSync` return `{ data, error: null }` on success or `{ data: null, error }` on
failure. `attemptWithRetry` counts total executions, not retries after the first attempt. Validate
that the operation is safe to repeat before enabling retries.

### Extension setup

Use `extensionSetup` at an API or server extension entrypoint to log loading/completion and honor
the `<EXTENSION_NAME>_ENABLED` environment flag. Call `start()` first, return when `isEnabled()` is
false, and call `end()` after successful registration.

Use `validateExtensionOptions` with a complete Zod schema to validate the extension environment
before registering routes or other API behavior. Valid data is returned with its inferred Zod
output type. Invalid data is logged and throws `Invalid extension options ☝. Exiting.`.

These helpers coordinate setup and validation only; Directus registration, environment lookup, and
application resource ownership remain with the consuming extension.

### Public compatibility

Preserve existing exports and runtime subpaths unless the maintainer explicitly approves a breaking
change. Add new shared helpers only when they have stable semantics and more than one credible
consumer. Update source exports, tests, package README, cookbook documentation, and any matching
consumer skill together when the public contract changes.

## Implementation workflow

1. Identify the utility family and runtime boundary.
2. Read the relevant API reference and current tests before changing the contract.
3. Prefer an existing adapter or composition over a new backend or convenience abstraction.
4. Keep external dependencies injected and lifecycle ownership with the caller.
5. Add regression coverage for boundary behavior, contention, expiry, lease loss, malformed values,
   or export/runtime contracts as applicable.
6. Run formatting, lint autofix, typecheck, unit tests, build, package validation, and docs
   validation required by the repository. Run packed-consumer or E2E checks when loading or runtime
   behavior is affected.
7. Review root, `/shared`, `/app`, and `/server` exports and documentation for drift. Confirm that
   Directus-runtime utilities remain server-only.

Completion means the selected utility is used through a documented public import, its runtime
boundary is valid, its failure and lifecycle semantics are covered, and every affected export,
test, README, cookbook article, and consumer skill is synchronized.
