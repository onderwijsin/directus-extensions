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

const cache = initializeCache(context.env, { ttl: 60_000 })
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
extension-specific cache keys, an explicit Redis namespace where isolation matters, and register
explicit invalidation hooks for mutable derived data:

```ts
const sharedKv = createKv({
  type: 'redis',
  namespace: 'orders:coordination',
  redis,
})
```

Both providers come from `@directus/memory`. Use KV for state that coordinates work and cache for
values that are safe to discard and recompute.
