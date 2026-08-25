# Patterns and conventions

This article records observations, not settled architecture. Promote a pattern to a repository
contract only after it has been used successfully by more than one extension or package.

When choosing a pattern, prefer correctness, a small change, existing evidence, readability, type
safety, and performance in that order. Record Directus-specific assumptions with links to official
documentation or MCP evidence. Do not copy concepts from another framework into Directus extensions
without an equivalent Directus contract.

## Disabling extensions via env

Environment-backed extensions can be disabled without removing the installed package. Use the
extension's stable name to derive its switch:

```text
${EXTENSION_NAME.toUpperCase()}_ENABLED
```

For example, an extension named `catalog` checks `CATALOG_ENABLED`:

```ts
import { extensionSetup } from '@onderwijsin/directus-extension-utils/server'

export default defineEndpoint((router, { env, logger }) => {
  const setup = extensionSetup('catalog', env, logger)
  setup.start()

  if (!setup.isEnabled()) return

  router.get('/health', (_request, response) => response.json({ ok: true }))
  setup.end()
})
```

The setup helper treats a missing value as enabled for backwards-compatible defaults. The string
`"false"` and boolean `false` disable the extension; other configured values leave it enabled. Place
the check immediately after `setup.start()` and before validation, SDK initialization, route
registration, or other side effects. This makes local, test, and emergency-disable configuration
safe even when optional runtime dependencies are unavailable.

Document the switch in the extension README and consumer skill, including its default, the behavior
that is skipped, and any additional switches required to enable test-only surfaces. Keep the
environment schema in the entrypoint's sibling `src/env.schema.ts` and validate it after the setup
switch has allowed registration to continue.

## Async endpoint route handlers

Directus exposes an Express 4 router. Register asynchronous routes and middleware through the
server-only `asyncHandler` adapter so rejected promises reach Directus's existing error handling:

```ts
import { asyncHandler } from '@onderwijsin/directus-extension-utils/server'

router.post(
  '/route',
  asyncHandler(async (request, response) => {
    const result = await doSomething(request)
    response.json(result)
  }),
)
```

For asynchronous middleware, call `next()` explicitly after the check succeeds:

```ts
router.use(
  asyncHandler(async (_request, _response, next) => {
    await checkAccess()
    next()
  }),
)
```

Keep synchronous handlers unwrapped. Use `attempt` when the caller should handle a failure as data;
use `asyncHandler` when a rejected promise should be forwarded to Express with `next(error)`.

## Directus errors at API boundaries

API extensions—hooks, endpoints, and operations—must report consumer-visible failures through
Directus's error pipeline. Throw a Directus-provided error when its meaning matches the failure:

```ts
import { ForbiddenError, InvalidPayloadError } from '@directus/errors'

if (!request.accountability?.user) throw new ForbiddenError()
if (!payload.name) throw new InvalidPayloadError({ reason: 'Name is required' })
```

In an endpoint, throwing from a synchronous handler or passing an error to `next(error)` lets
Directus format the response. For asynchronous handlers, wrap the handler with `asyncHandler` so
rejected promises reach the same error middleware. Hooks and operations should throw the error and
allow Directus to abort and report the operation according to its normal lifecycle.

When no provided error expresses the contract, create a custom Directus error with a stable,
extension-specific uppercase code, an appropriate HTTP status, and a safe message:

```ts
import { createError } from '@directus/errors'

interface UpstreamErrorExtensions {
  reason: string
}

export const UpstreamError = createError<UpstreamErrorExtensions>(
  'CATALOG_UPSTREAM_FAILED',
  ({ reason }) => reason,
  502,
)

throw new UpstreamError({ reason: 'Catalog provider is unavailable' })
```

Keep custom error definitions near the API boundary or in a shared `errors.ts` module when several
handlers use them. Put stable machine-readable information in the code and extensions, and keep
messages safe for clients: do not expose tokens, credentials, SQL, stack traces, or raw upstream
responses. Translate unknown errors at the boundary, while preserving an existing Directus error
when one is already available. Use
[`isDirectusError`](https://github.com/directus/directus/blob/main/packages/errors/src/is-directus-error.ts)
for that check.

The `@directus/errors` package documents the built-in error classes, `createError`, error codes, and
the `isDirectusError` helper:
[Directus errors package](https://github.com/directus/directus/tree/main/packages/errors).

## Accountability at API boundaries

Narrow Directus request accountability before using it for authorization or service accountability.
Use `assertRequestWithAccountability` when the handler needs a narrowed request type:

```ts
import { assertRequestWithAccountability } from '@onderwijsin/directus-extension-utils/server'

if (!assertRequestWithAccountability(request)) {
  next(new ForbiddenError())
  return
}

const userId = request.accountability.user
```

Use `hasAuthenticatedUser` when only an authenticated accountability is required, and use
`getAccountabilityFromRequest` when absent or malformed data should become `null` without changing
the inferred request type. Use `isAccountability` for general structural narrowing. These helpers do
not replace complete boundary validation with Zod.

## Cache and KV

Cache and KV are Directus runtime concerns. Use `initializeCache` and `withCache` from the
extension-utils server surface for disposable derived values. A cache miss is normal because the
value can be rebuilt:

```ts
import { initializeCache, withCache } from '@onderwijsin/directus-extension-utils/server'

const cache = initializeCache(context.env, {
  ttl: 60_000,
  namespace: 'directus:extensions:my-extension:summary',
})
const summaryKey = (id: string): string => `orders:summary:${id}`

const summary = await withCache({ cache, key: summaryKey('42') }, () => loadSummary('42'))
```

Use `createKv` for coordination state, such as markers or a last-processed value:

```ts
import { createKv } from '@directus/memory'

const kv = createKv({
  type: 'local',
  namespace: 'orders:coordination',
})

await kv.set('last-sync', new Date().toISOString())
const lastSync = await kv.get('last-sync')
```

For multiple Directus replicas, configure the cache and KV providers for Redis. Use stable,
extension-specific cache keys and an explicit extension-specific Redis namespace for every
publishable extension-owned cache. Use separate subsystem namespaces where targeted invalidation
matters, and register explicit invalidation hooks for mutable derived data:

```ts
const sharedKv = createKv({
  type: 'redis',
  namespace: 'orders:coordination',
  redis,
})
```

Both providers come from `@directus/memory`. Use KV for state that coordinates work and cache for
values that are safe to discard and recompute.
