# Utility consolidation inventory and specification

Status: inventory and design specification. The framework-neutral utility families described below
are now implemented in `packages/extension-utils`; cache, lock, and debounced-task consolidation
remain future work.

## Scope and source snapshots

This inventory covers the utility packages at the paths supplied for these repository snapshots:

| Repository                              | Branch | Snapshot  |
| --------------------------------------- | ------ | --------- |
| `onderwijsin/tio-directus`              | `main` | `74b7061` |
| `onderwijsin/onderwijsloket-datastudio` | `main` | `b7861e8` |
| `onderwijsin/onderwijsloket-directus`   | `next` | `26c7e3e` |
| `onderwijsin/onderwijsin-datahub`       | `main` | `56f2364` |

The first three contain `packages/extension-utils`; Datahub contains `packages/utils`. I also
checked adjacent extension-local copies when they revealed a utility that the package inventory
would otherwise hide, notably Datahub's email-viewer cache and the repeated confirmation-prompt
helpers. Repository and package READMEs, Tio's `KNOWN_LIMITATIONS.md`, package manifests, build
configuration, tests, and usages were included in the analysis.

## Executive summary

The packages are not four independent designs. They are a sequence of copied implementations:

- `createAutoTaskHandler`, `createLogger`, and the cache factory appear in near-identical forms.
- Tio and `onderwijsloket-directus` contain the largest shared server-oriented package, including
  process locks, UUIDs, MIME classification, Sentry helpers, constants, and Directus type aliases.
- `onderwijsloket-datastudio` adds Directus hook adapters, an ItemsService factory, field
  flattening, result/retry helpers, typed entries, and CLI environment detection.
- Datahub's package contains only the auto-task handler and logger, but its auto-task variant
  introduces an injectable `applyingFlagPath`; Datahub also has a separate cache copy inside the
  email-viewer extension.

The consolidation should therefore be layered. A small portable shared layer can be used by every
runtime, while dependencies are allowed when they are intentional and compatible with that layer's
runtime contract. Storage, coordination, observability, Directus services/hooks, and CLI helpers
should be explicit adapters or separate subpaths. A utility must not silently select Redis, depend
on a particular filesystem, import server-only integrations into app code, read process environment,
or assume one Directus deployment topology.

## Consumer migration status

The current `directus-extensions` package exposes primitive guards, attempted operations, typed
object helpers, MIME classification, explicit environment predicates, UUID helpers, logger adapters,
and framework-neutral types. A clean packed-consumer smoke test confirms that the root, `/app`,
`/server`, and `/shared` exports resolve and preserve shared utility identities. The private
`directus-e2e-playground` is packed and installed alongside the public package for Directus E2E
validation.

The four source repositories are not yet fully migratable to this package without an API gap or
breaking shim. Their current consumers use private `@workspace/extension-utils` or
`@workspace/utils` packages and still depend on utilities that have not been implemented here,
including cache factories, locks, auto-task handlers, Sentry/build configuration, Directus type
aliases, and Directus-specific adapters. The implemented simple utility families can now be migrated
one at a time; the remaining migration sequence is:

1. Implement and publish each consolidated utility contract here.
2. Add compatibility adapters or intentionally update consumers per utility family.
3. Migrate one source repository at a time from its copied/private package to the published package.
4. Run that repository's typecheck, tests, build, and packed-consumer checks before deleting its
   copy.

Until step 1 is complete, changing those repositories' package dependencies would produce broken
imports rather than a meaningful migration.

## Inventory by utility

Legend: **shared** means materially present in the supplied utility package; **adjacent** means a
copy was found elsewhere in the repository; **—** means not present in that package snapshot.

| Utility/pattern                     | Tio Directus                                                                                              | Onderwijsloket Data Studio                                                                    | Onderwijsloket Directus                                                                       | Onderwijsin Datahub                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Debounced auto-task handler         | **shared** `src/auto-task-handler.ts`; filesystem debounce plus `process-lock` bulk exclusion             | **shared** `src/lib/autoTaskHandler.ts`; filesystem debounce plus optional `applyingFlagPath` | **shared** `src/auto-task-handler.ts`; filesystem debounce plus `process-lock` bulk exclusion | **shared** `src/lib/autoTaskHandler.ts`; filesystem debounce plus optional applying flag                          |
| Cache factory                       | **shared** `src/cache.ts`; Directus Memory local/Redis, env-driven                                        | **shared** `src/lib/cache.ts`; same implementation                                            | **shared** `src/cache.ts`; same implementation                                                | **adjacent** copy in `directus/extensions/email-viewer/src/utils/cache.ts`; not in `packages/utils`               |
| Process lock                        | **shared** `src/process-lock.ts`; atomic file creation and ownership error                                | —; auto-task uses a file but has no separate lock abstraction                                 | **shared** `src/process-lock.ts`; non-exclusive overwrite on acquire                          | —; auto-task uses an optional applying flag                                                                       |
| Logger fallback                     | **shared** `src/create-logger.ts`; Pino type with console fallback                                        | **shared** `src/lib/createLogger.ts`; same behavior                                           | **shared** `src/create-logger.ts`; same behavior                                              | **shared** `src/lib/createLogger.ts`; same behavior                                                               |
| UUID generation                     | **shared** `src/uuid.ts`; random UUID v5 via random namespace and deterministic UUID v5 via URL namespace | —                                                                                             | **shared** `src/uuid.ts`; same implementation                                                 | —                                                                                                                 |
| MIME classification                 | **shared** `src/process-mime-type.ts`; audio/video/image prefixes and fixed document list                 | —                                                                                             | **shared** `src/process-mime-type.ts`; same implementation                                    | —                                                                                                                 |
| Sentry helpers                      | **shared** `src/sentry.ts`; direct `@sentry/node` import and scoped capture                               | **shared** `src/sentry.ts`; same API with optional exception context                          | **shared** `src/sentry.ts`; same API                                                          | —                                                                                                                 |
| Directus service type aliases       | **shared** `src/types/services.ts` and `types/index.ts`                                                   | —                                                                                             | **shared** same generated aliases                                                             | —                                                                                                                 |
| Project/domain types                | **shared** status/vendor constants, Navigator, Deepgram, GeoJSON, Tiptap, snackbar, `PartialNested`       | **shared** hook-specific types and emitter type                                               | **shared** same Tio domain types                                                              | —                                                                                                                 |
| Typed item hook adapters            | —                                                                                                         | **shared** create/update/delete filter and action wrappers                                    | —                                                                                             | —                                                                                                                 |
| Typed ItemsService factory          | —                                                                                                         | **shared** `createItemsService` using `ApiExtensionContext`                                   | —                                                                                             | —                                                                                                                 |
| Query field flattening              | —                                                                                                         | **shared** `flattenQueryFields`                                                               | —                                                                                             | —                                                                                                                 |
| Safe async result                   | —                                                                                                         | **shared** `safeAsync` and exponential-backoff `safeAsyncWithRetry`                           | —                                                                                             | —                                                                                                                 |
| Typed `fromEntries`/`toEntries`     | —                                                                                                         | **shared** strongly inferred object/entry conversions                                         | —                                                                                             | —                                                                                                                 |
| General attempt helpers             | —                                                                                                         | —                                                                                             | —                                                                                             | **adjacent reference** in `onderwijsin/nuxt-modules` `module-utils`: `attempt`, `attemptSync`, `attemptWithRetry` |
| General object helpers              | —                                                                                                         | —                                                                                             | —                                                                                             | **adjacent reference** in `onderwijsin/nuxt-modules` `module-utils`: `toEntries`, `fromEntries`, `keys`           |
| CLI confirmation environment checks | —                                                                                                         | **shared** `isTTY`, `isCI`, `shouldSkipConfirmation`                                          | —                                                                                             | **adjacent** same helpers in enhanced-seeder                                                                      |
| Shared extension build config       | **shared** Sentry/OpenTelemetry externals, plus configurable externals                                    | **shared** Sentry/OpenTelemetry externals                                                     | **shared** Sentry/OpenTelemetry externals                                                     | —                                                                                                                 |
| README/limitations contract         | **shared** extensive README and `KNOWN_LIMITATIONS.md`                                                    | no package README found                                                                       | **shared** README, largely copied from Tio                                                    | no package README found                                                                                           |

## Findings by pattern

### Cache

The Tio, Data Studio, and Onderwijsloket Directus factories are effectively identical. They return a
`@directus/memory` cache and statically import `ioredis`. Selection requires all of the following:

1. `REDIS_ENABLED` parses as `1`, `true`, `yes`, or `on`;
2. `REDIS` contains a non-empty URL;
3. `CACHE_STORE` is `redis`; and
4. the explicit `store` option, if supplied, is also `redis`.

Otherwise they silently create a local per-process cache. This is an environment and deployment
assumption, not a cache abstraction. It also has a documentation mismatch: comments mention
`REDIS_URL`, while code reads `REDIS`. `options.store` is not a general backend injection point; it
only selects between two hard-coded implementations. The factory logs directly to the console, does
not expose lifecycle/connection ownership, and cannot express cache-unavailable, fail-open, or
fail-closed policy.

Required consolidation direction: define a small cache contract and inject an implementation. Keep
memory and Redis adapters outside the core; environment parsing belongs in an application adapter.
Distributed cache semantics must be explicit rather than inferred from an environment variable.

### Locks and auto-task coordination

There are three materially different implementations:

- Tio creates a lock file with `flag: 'wx'`, reports contention through
  `ProcessLockAlreadyExistsError`, and uses the system temp directory.
- Onderwijsloket Directus writes the lock file without exclusive creation, so concurrent acquirers
  can overwrite one another.
- Data Studio and Datahub use a separate applying flag; they do not provide a general lock API.

All file variants use timestamps and delete files after a fixed age. Tio's `KNOWN_LIMITATIONS.md`
correctly identifies the consequences: a long-running owner can become stale, another process can
replace its lock, and the original owner can then delete the replacement. Stale inspection also has
`exists`/`stat`/`remove` races. Auto-task debounce has a second claim race, and all filesystem
variants coordinate only processes sharing the same filesystem. One `maxLockAge` is also used for
both debounce markers and task leases even though those lifetimes differ. Task errors are logged and
swallowed; callers cannot observe failure.

Required consolidation direction: split debouncing from distributed coordination. A debouncer should
only decide when a generation is ready. A lock provider should own exclusion and return an
owner-bound lease. File, memory, and Redis providers should be separate. A distributed deployment
must opt into a distributed provider; a local file lock must never be presented as cluster-safe.

Filesystem is therefore a valid implementation option, not the definition of `LockProvider`. The
consolidated design should include an explicitly named local filesystem provider for processes that
share a directory, alongside an in-memory provider and a distributed provider such as Redis. The
provider is injected by the consumer; the package must not silently choose filesystem based on
`tmpdir()` or environment variables. A filesystem provider must use atomic acquisition, owner
tokens, generation-safe release, an explicit lock directory, and a documented single-filesystem
scope.

### Logger and observability

The logger fallback is a useful structural idea but depends on Pino's type and uses a type assertion
to make console functions look like a Pino logger. Sentry helpers directly import `@sentry/node`,
mutate the supplied tags to add default severity, and check `if (!Sentry)` even though a static ESM
namespace import is normally always truthy. The shared build configuration is a Directus/Rollup
workaround, not a runtime utility.

Required consolidation direction: define a minimal logger interface in the core; provide a console
adapter and a Pino adapter separately. Define an observability reporter interface and put Sentry in
an optional server adapter. Do not make core consumers install or bundle Sentry.

### Directus-specific helpers

Data Studio's hook adapters, `createItemsService`, `Emitter`, and Directus service aliases are
valuable, but they are not framework-neutral. They import Directus types, project-generated
collection types, and in the hook adapter use boundary assertions because Directus handler types are
loose. They should live in a Directus-specific package/subpath with a clearly versioned Directus
compatibility range, not in the core shared utility surface.

`flattenQueryFields` is a useful pure helper, but its `FieldInput` shape is Directus query syntax
and its behavior should be specified independently (including wildcard, empty nested selectors, and
deduplication).

### Pure helpers and types

The following are plausible core candidates after naming and contract cleanup:

- `safeAsync`/retry, if the retry count, delay, cancellation, error normalization, and retry policy
  are explicit;
- typed `fromEntries`/`toEntries`;
- MIME classification, if the MIME registry is configurable and unknown types remain unknown;
- UUID generation, using platform primitives and an explicit deterministic namespace;
- generic `PartialNested`, GeoJSON primitives, and small structural types.

The status keys, vendor values, Navigator collections, Deepgram response, Tiptap relation attrs,
Directus snackbar, and generated service aliases encode one project's domain or Directus version.
They should remain in a consuming package until there are multiple independent consumers and a
stable owner for the contract.

## Proposed consolidated design

### Package boundaries

Use one publishable package with explicit subpaths, or a small set of packages if dependencies make
that safer:

```text
@onderwijsin/directus-extension-utils/shared   portable helpers and contracts with intentional deps
@onderwijsin/directus-extension-utils/server   Node/server adapters and Directus integration
@onderwijsin/directus-extension-utils/app      browser-safe helpers
@onderwijsin/directus-extension-utils/cache    cache contract plus optional backend adapters
@onderwijsin/directus-extension-utils/coordination
                                                   lock providers and debouncing
@onderwijsin/directus-extension-utils/observability
                                                   logger/reporter contracts and adapters
```

The root export should remain conservative and framework-neutral. Subpaths must not import a heavier
or less portable runtime merely because another subpath does.

### 1. Cache contract

Define a backend-independent contract, for example:

```ts
export interface CacheStore<T = unknown> {
  get(key: string): Promise<T | undefined>
  set(key: string, value: T, options?: { ttlMs?: number }): Promise<void>
  delete(key: string): Promise<boolean>
  clear?(): Promise<void>
}

export interface CacheNamespace {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void>
  delete(key: string): Promise<boolean>
}
```

Specify that a cache is an optimization, values may disappear, TTL is a maximum freshness hint,
serialization is the adapter's responsibility, and cache errors are surfaced unless the caller
explicitly chooses a fail-open wrapper. Namespace construction must be deterministic and must not
depend on the backend.

Provide:

- `createNamespacedCache(store, namespace)` as the core composition;
- `createMemoryCache()` as a process-local server adapter;
- `createRedisCache(options)` as an opt-in distributed adapter;
- `createCacheFromEnvironment` only as an application-owned convenience adapter, with an explicit
  configuration schema and no silent fallback from a requested distributed mode to local mode.

The caller chooses the store. The utility does not read `context.env`, construct Redis clients as a
side effect, or claim that memory cache is safe across Directus replicas.

### 2. Coordination contract

Define an owner-bound lease rather than path-based global functions:

```ts
export interface LockLease {
  readonly name: string
  readonly token: string
  renew(): Promise<boolean>
  release(): Promise<boolean>
}

export interface LockProvider {
  tryAcquire(name: string, options?: { leaseMs?: number }): Promise<LockLease | null>
}
```

Provider requirements:

- acquisition is atomic from the provider's perspective;
- `release` and stale cleanup can only affect the matching token/generation;
- a lease can be renewed for tasks longer than the initial lease;
- contention returns `null` or a documented typed result, not an incidental filesystem error;
- release is idempotent;
- provider scope is documented as local-process, local-filesystem, or distributed;
- no default provider is selected based on deployment environment.

Implement memory and file providers for local use and a Redis provider for distributed use. The file
provider must accept an explicit directory and use safe namespacing; it must not default to a
cluster-wide interpretation of `tmpdir()`.

Build `createDebouncedTask` on top of an injected scheduler/timer and optional `LockProvider`:

- trigger records a debounce generation;
- only the current generation is eligible;
- execution claims the generation atomically when coordination is enabled;
- newer triggers during execution create a later generation;
- `debounceMs`, `markerLeaseMs`, and `taskLeaseMs` are separate options;
- errors are observable through an `onError` callback and a documented fire-and-forget policy;
- tests can inject clock, timer, marker store, and lock provider.

This preserves the useful auto-task behavior without pretending that a file flag coordinates a
multi-host Directus deployment.

### 3. Logging and observability

Keep the core interface minimal and structural:

```ts
export interface Logger {
  trace?(message: string, fields?: Record<string, unknown>): void
  debug?(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export interface ErrorReporter {
  captureException(error: unknown, context?: ReportContext): void
  captureMessage(message: string, context?: ReportContext): void
  addBreadcrumb?(breadcrumb: Breadcrumb): void
  setUser?(user: ReportUser | null): void
}
```

Provide `noopReporter`, `consoleLogger`, and adapters for Directus/Pino and Sentry. Context should
be immutable from the caller's perspective; default severity must not mutate caller-owned tags.
Reporting should be best-effort by default and must not make an otherwise usable extension fail
because Sentry is not configured. Sentry dependency and bundler externals belong only to its
adapter.

### 4. Retry/result helpers

Retain the discriminated result shape if consumers value it, but specify it precisely:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: Error; attempts: number }
```

`tryAsync` should normalize unknown thrown values without hiding the original cause. `retryAsync`
should accept `maxAttempts`, `shouldRetry(error, attempt)`, `delay(attempt, error)`, and an abort
signal or cancellation callback. `maxAttempts: 1` means one call and no retry. Do not sleep after
the final failed attempt. Keep throwing and result-returning APIs separate so consumers choose their
error model deliberately.

### 5. Directus adapters

Put typed hook adapters, `createItemsService`, field selector flattening, Directus service aliases,
and Directus notification types behind a Directus-specific subpath. Parameterize collection/item
types so the utility does not import a project-generated `CollectionName` or `ItemIn`. Keep all
Directus boundary narrowing in one adapter layer and document the supported Directus major version.

The generic package should not own project constants, generated service lists, or domain response
types. Those can be consumer packages built on the adapter contracts.

### 6. Attempt and object helpers

Also promote the general-purpose helpers from `onderwijsin/nuxt-modules` `module-utils` (snapshot
`451c582`), with a small contract adjustment where needed:

- `attempt(operation)` accepts synchronous or asynchronous operations and returns `{ data, error }`
  without throwing;
- `attemptSync(operation)` provides the same contract for synchronous callers;
- `attemptWithRetry(operation, options)` uses an explicit total `attempts` count, initial delay, and
  exponential-backoff choice. It should add cancellation and a retry predicate before becoming a
  public contract, and it must not wait after the final failed attempt;
- `toEntries(object)`, `fromEntries(entries)`, and `keys(object)` remain pure object helpers. The
  source implementation uses typed assertions around native `Object.*` operations; retain the useful
  type surface but test symbol keys, inherited properties, empty objects, and duplicate entries
  before finalizing semantics.

These helpers overlap with Data Studio's `safeAsync` and typed `fromEntries`/`toEntries`.
Consolidate under one naming and error contract rather than publishing both APIs. `attempt` is the
better base name for the general utility because it supports sync operations and preserves unknown
errors as data; a throwing retry helper can remain a separate API if consumers need it.

### 7. CLI and environment helpers

Make environment checks pure and injectable:

```ts
isInteractive({ stdinIsTTY, stdoutIsTTY }): boolean
isCiEnvironment(env: Record<string, string | undefined>): boolean
shouldSkipConfirmation({ force, interactive, ci }): boolean
```

The utility must not read global `process.stdin`, `process.stdout`, or `process.env` at module
evaluation time. A Node CLI adapter may map process globals into these inputs.

### 8. MIME, UUID, and generic types

- MIME: expose a pure classifier with a default registry and an additive custom registry option;
  normalize case and whitespace; classify `text/*` only if that is a deliberate documented policy.
- UUID: use `crypto.randomUUID()` for random IDs in supported server runtimes; expose deterministic
  UUID generation only with an explicit namespace argument. Do not describe a UUID v5 made from a
  random namespace as a random UUID without documenting the distinction.
- Entries: retain typed conversions only if compiler support and runtime key semantics are tested;
  avoid unsafe assertions in public implementation where possible.
- `PartialNested` and GeoJSON primitives may be shared as types; document array, tuple, function,
  readonly, and union behavior.

### 9. Build with tsdown

The current branch replaces the TypeScript emitter with tsdown. tsdown is designed for library
builds and supports multiple entrypoints, ESM output, declaration generation, sourcemaps, clean
`dist` output, dependency externalization, and optional package-export generation. Its current
build-time requirement is Node `>=22.18.0`; this repository's package already targets Node 24, so
that requirement is compatible. See the
[tsdown library-build documentation](https://tsdown.dev/guide/how-it-works) and
[package-export documentation](https://tsdown.dev/options/package-exports).

Recommended build shape:

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/shared/index.ts',
    'src/app/index.ts',
    'src/server/index.ts',
    'src/cache/index.ts',
    'src/coordination/index.ts',
    'src/observability/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

The exact bundling and dependency policy should be decided per subpath. tsdown externalizes regular
`dependencies`, `peerDependencies`, and `optionalDependencies` by default, while development-only
imports may be bundled. Therefore runtime adapters must declare their runtime dependencies
correctly; we should not rely on bundling to hide an incomplete manifest. Directus, Redis, Sentry,
and Pino integrations should remain explicit external dependencies so adapters do not pull
server-only packages into app consumers.

Keep the hand-authored `exports` map initially rather than enabling tsdown's automatic export
rewrite. After the first build, compare generated files against every manifest subpath. Enabling
`exports: true` can be considered later, but it should not silently change the public package
contract. Enable tsdown's `publint`/`attw` integration if the required optional tooling is adopted,
and retain the repository's packed-consumer validation as the release gate.

The build-tool migration is intentionally separate from utility API changes. It adds the exact
catalog-pinned `tsdown` devDependency, `tsdown.config.ts`, and a `tsdown` build script while
removing the obsolete TypeScript build configuration. The implementation is validated by checking
declarations, runtime subpaths, package archives, and consumer imports.

## Migration and acceptance plan

1. Freeze the inventory above as the migration checklist and identify real consumers per proposed
   utility.
2. Implement portable contracts and pure helpers first, with public export tests. Dependencies are
   acceptable when they solve a real shared need, are declared directly by the package, and do not
   force an incompatible runtime or unnecessary bundle into consumers.
3. Implement memory/file adapters and concurrency tests using injected directories and child
   processes.
4. Implement Redis adapters separately and test distributed semantics against a disposable Redis
   service; never infer those semantics from the local provider.
5. Add Directus adapters only after selecting the supported Directus type/version contract.
6. Migrate one consumer per repository: replace its copied utility import with the consolidated
   package, run that project's relevant typecheck/tests/build or packed-consumer checks, compare
   behavior, and only then remove the copied implementation. This is what “consumer migration and
   validation” means; it is a staged rollout, not a prerequisite for agreeing on the utility design.
7. Publish README/API docs and matching consumer skills for every public behavior change; add one
   Changeset per independent public package concern.

Minimum acceptance criteria for the consolidation:

- portable shared utilities do not import environment-specific integrations or global process state;
  runtime adapters may depend directly on Directus, Redis, Sentry, Pino, Node filesystem, or other
  libraries when their subpath declares and documents that runtime contract;
- cache backend and failure policy are injected and topology is documented;
- filesystem locking is available only as an explicit local provider; a lock owner cannot release a
  replacement lock, and leases can outlive their initial duration by renewal;
- one debounce generation executes at most once per chosen coordination scope;
- `attempt`, `attemptSync`, `attemptWithRetry`, `toEntries`, `fromEntries`, and `keys` have one
  documented contract with focused edge-case tests;
- tsdown emits every declared export subpath, declarations, and source maps, and packed-consumer
  validation passes;
- unit tests cover all pure behavior and integration tests cover real contention for
  file/distributed providers;
- every exported utility has a stable contract, JSDoc, package export, and consumer-facing example;
- project/domain-specific types remain outside the generic package unless multiple independent
  consumers justify their promotion.

## Deferred decisions

The following require an explicit maintainer decision before implementation because they change
public contracts: package split versus subpaths, supported Node/Directus versions, Redis client
ownership, whether retry helpers return results or throw, and whether auto-task failure remains
fire-and-forget. This document intentionally does not silently choose those compatibility decisions.
