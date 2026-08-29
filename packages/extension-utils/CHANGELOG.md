# Changelog

## 0.2.3

### Patch Changes

- 80ad3bd: Type asynchronous Express handlers with Directus request accountability.
- f9c64fd: Allow `rejectWhileSchemaLocked` to report schema status without requiring an Express
  continuation.

## 0.2.2

### Patch Changes

- 3975cb3: Loosen SMTP email configuration validation to require only `EMAIL_SMTP_HOST`; SMTP port
  and credentials are now left to Directus and the consumer.

## 0.2.1

### Patch Changes

- 347cc18: Prevent schema ensures from attempting to recreate existing Directus metadata-only fields
  that are omitted from the schema overview.

## 0.2.0

### Minor Changes

- a320307: Replace the shared admin accountability constant with typed factory functions for regular
  and system-owned admin operations.
- d99902a: Add the server-only `asyncHandler` adapter for forwarding rejected Express 4 handler
  promises to `next`.
- c9a3fa0: Add coordinated Directus startup ensures for schema resources and policy data seeds,
  including durable collection identity replacement and read-only startup lock status.
- eeee3e9: Add shared `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE` configuration for process-local or
  Redis-backed extension rate limiters.
- 4e1c188: Add server-side extension lifecycle and Zod environment validation helpers.
- Export reusable server-side schema-management utilities, including global schema-change settings
  and portable Directus schema ensuring.
- 71f3b12: Add `replaceCollectionNameInSchema` for reusable collection-name substitution in bundled
  Directus schema definitions.
- 4e1c188: Add a dedicated Sentry export and expose the shared Directus extension build
  configuration.
- f44e974: Add the `withCache` helper with an optional namespace prefix configured through an
  options object, and cache Sluggernaut field configuration reads for a configurable duration with
  collection-scoped invalidation.
- 7c93fe5: Add shared Redis/cache, synchronization fallback, and Directus email configuration
  schemas, resolvers, and server exports.
- 1007a6b: Add reusable server-side Directus policy resolution with nested-role and IP allow-list
  filtering.
- c74cdb5: Use `@directus/memory` for Directus cache, KV, Redis lock, and auto-task marker
  coordination while retaining explicit filesystem adapters for server deployments. The Redis lock
  provider now owns its Redis connection and accepts a Redis URL. Locks, task handlers, task
  storage, and logger utilities are server-only exports because they depend on the Directus runtime.
- 642b67d: Remove the unused `Geometry` and `LngLatCoordinates` type exports.
- 2a360d1: Make schema ensures always acquire a lock, add read-only schema lock status checks, and
  remove the optional locked-schema configuration. Consumers can still select the lock provider.
- 673086f: Add validation and processing for nested Directus policy permissions, and make
  `ensureDirectusPolicy` persist linked `directus_permissions` rows idempotently.
- 75fffb3: Add the initial publishable `extension-utils` package with primitive runtime guards.
- c7f3e95: Use Redis-only, namespaced policy caching with global invalidation for Directus access,
  policy, and role mutations. The policies endpoint now ships its invalidation hook as part of its
  bundle, and Coolify authorization shares the same policy-cache contract with an opt-out for
  duplicate hooks.
- c7f3e95: Refine cache-aside and collection-invalidation APIs around startup-initialized caches,
  and add isolated runtime and type-only hook subpaths for correctly typed asynchronous Directus
  actions.
- 7e403f4: Harden startup coordination with lease renewal, borrowed-lock ownership, policy conflict
  protection, strict Redis URL validation, and non-blank accountability user checks.
- 8280ce2: Add runtime-aware `server`, `app`, and `shared` export paths.
- f3e7853: Add a shared server cache initializer for configured local and Redis-backed extension
  caches, and use it in the Coolify deployments and policies endpoints.
- 5534dc8: Share schema-lock request rejection through the server utilities package and apply it
  once as middleware to the magic-links endpoint.
- a49ac9b: Add general attempted-operation, cache, lock, auto-task, object, MIME, environment, UUID,
  type, and logger utilities.
- 40120a5: Simplify auto-task coordination APIs by unifying marker provider names, moving Redis KV
  creation into the Redis marker provider, and decomposing handler and marker orchestration.
- 0e6539c: Unify lock-provider configuration and lease implementation across memory, filesystem, and
  Redis providers, including the shared `defaultLeaseMs` option.
- de356e3: Add the `uuid` and `uuidv4` helpers. `uuid()` provides UUID v7 by default and supports
  deterministic UUID v5 generation when given an input.

### Patch Changes

- 55466af: Add semantic emoji prefixes to auto-task lifecycle and failure logs.
- 2b5ad8e: Remove filesystem lock claims when an owned lease is released.
- d1293ea: Add a public `isPrimaryKey` runtime guard for Directus string and numeric primary keys.
- bd2f164: Fix the Pino-based logger export and its typed server utility integration.
- 2b5ad8e: Abort auto-task work when its execution lease is lost and preserve the marker for retry.
- d557613: Preserve schema collection definitions that omit a schema name or nested primary-key
  field, preventing Directus from creating an implicit integer primary key.
- 9f136f5: Keep auto-task markers pending when task execution fails so transient failures can be
  retried.
- d557613: Reduce `ensureDirectusSchema` operational logging to debug level while retaining an
  info-level plan and summary.
- 1d31410: Refresh Directus schema service state between collection, field, and relation creation
  phases.
- 2586f40: Share process-local memory lock state between providers that use the same provider ID.
- 203a664: Add comprehensive unit coverage and live playground E2E coverage for schema management
  and startup registration utilities.
- 75fffb3: Harden public package metadata and packed-artifact validation.
- 9f136f5: Validate marker timestamps and Redis marker lock timeouts consistently across providers.
- 74d1089: Validate persisted Redis auto-task markers before using them in scheduling logic.
- 2b5ad8e: Validate retry attempt counts and delays before executing an operation.

## 0.1.0

- Initial package scaffold with primitive runtime guards.
